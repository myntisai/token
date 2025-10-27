// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {
    ILayerZeroEndpointV2,
    MessagingParams,
    MessagingReceipt,
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/**
 * @title MyntisOFT
 * @notice Canonical omnichain MYNT token for LayerZero V2 hub deployment.
 * @dev Implements direct endpoint interactions (without OZ upgradeable patterns)
 *      while preserving existing tokenomics (cap, fees, access control, pause).
 */
contract MyntisOFT is ERC20, AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    struct BridgeMessage {
        address to;
        uint256 amount;
        bytes metadata; // optional contextual data (reason, provider flag, etc.)
    }

    ILayerZeroEndpointV2 public immutable endpoint;

    // Remote peer per endpoint ID (LayerZero EIDs)
    mapping(uint32 eid => bytes32 peer) public peers;

    // Token economics
    uint256 private _cap;
    uint256 private _maxSupply;
    uint256 private _mintFee; // basis points (1e4 = 100%)
    uint256 private _burnFee; // basis points (1e4 = 100%)
    address private _feeRecipient;

    event CapUpdated(uint256 previousCap, uint256 newCap);
    event MintFeeUpdated(uint256 previousFee, uint256 newFee);
    event BurnFeeUpdated(uint256 previousFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event PeerUpdated(uint32 indexed eid, bytes32 indexed peer);
    event BridgeQueued(
        bytes32 indexed guid,
        uint32 indexed dstEid,
        address indexed sender,
        address recipient,
        uint256 amount
    );
    event BridgeReceived(
        bytes32 indexed guid,
        uint32 indexed srcEid,
        address indexed recipient,
        uint256 amount
    );

    error UnknownPeer(uint32 eid);
    error InvalidEndpoint();
    error InvalidPeer();

    constructor(
        string memory name_,
        string memory symbol_,
        address endpoint_,
        address admin_
    ) ERC20(name_, symbol_) {
        require(endpoint_ != address(0), "MyntisOFT: endpoint zero");
        require(admin_ != address(0), "MyntisOFT: admin zero");

        endpoint = ILayerZeroEndpointV2(endpoint_);

        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(MINTER_ROLE, admin_);
        _grantRole(BURNER_ROLE, admin_);

        _cap = 1_000_000_000 * 1e18; // 1B MYNT cap
        _maxSupply = _cap;
        _mintFee = 0;
        _burnFee = 0;
        _feeRecipient = admin_;
    }

    // ----------------------------------------------------------------------------------------
    // LayerZero bridging
    // ----------------------------------------------------------------------------------------

    /**
     * @notice Quote the native fee for bridging a given amount.
     */
    function quoteBridge(
        uint32 dstEid,
        address to,
        uint256 amount,
        bytes calldata metadata,
        bytes calldata options,
        bool payInLzToken
    ) external view returns (MessagingFee memory fee) {
        if (peers[dstEid] == bytes32(0)) revert UnknownPeer(dstEid);
        bytes memory payload = abi.encode(BridgeMessage({to: to, amount: amount, metadata: metadata}));
        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: peers[dstEid],
            message: payload,
            options: options,
            payInLzToken: payInLzToken
        });
        return endpoint.quote(params, address(this));
    }

    /**
     * @notice Burn and bridge MYNT to a remote chain.
     * @param dstEid Destination LayerZero endpoint ID.
     * @param to Recipient on the destination chain.
     * @param amount Amount in local decimals.
     * @param metadata Optional metadata (e.g. reason, provider flag).
     * @param options LayerZero executor options (encoded via OptionsBuilder).
     * @param refundAddress Address receiving any unused native fee refund.
     * @param payInLzToken Whether to pay in LZ token.
     */
    function bridge(
        uint32 dstEid,
        address to,
        uint256 amount,
        bytes calldata metadata,
        bytes calldata options,
        address refundAddress,
        bool payInLzToken
    ) external payable whenNotPaused returns (MessagingReceipt memory receipt) {
        bytes32 peer = peers[dstEid];
        if (peer == bytes32(0)) revert UnknownPeer(dstEid);
        require(amount > 0, "MyntisOFT: zero amount");

        _burnWithFee(msg.sender, amount);

        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: peer,
            message: abi.encode(BridgeMessage({to: to, amount: amount, metadata: metadata})),
            options: options,
            payInLzToken: payInLzToken
        });

        uint256 nativeFee = endpoint.quote(params, msg.sender).nativeFee;
        require(msg.value >= nativeFee, "MyntisOFT: insufficient fee");

        receipt = endpoint.send{value: msg.value}(params, refundAddress);

        emit BridgeQueued(receipt.guid, dstEid, msg.sender, to, amount);
    }

    /**
     * @notice LayerZero entrypoint for received packets.
     * @dev Endpoint guarantees (guid, origin) uniqueness; peers guard prevents untrusted senders.
     */
    function lzReceive(
        Origin calldata origin,
        address receiver,
        bytes32 guid,
        bytes calldata message,
        bytes calldata /* extraData */
    ) external payable {
        if (msg.sender != address(endpoint)) revert InvalidEndpoint();
        if (receiver != address(this)) revert InvalidEndpoint();

        bytes32 expectedPeer = peers[origin.srcEid];
        if (expectedPeer == bytes32(0) || expectedPeer != origin.sender) revert InvalidPeer();

        BridgeMessage memory bridgeMsg = abi.decode(message, (BridgeMessage));

        _mintWithFee(bridgeMsg.to, bridgeMsg.amount);
        emit BridgeReceived(guid, origin.srcEid, bridgeMsg.to, bridgeMsg.amount);
    }

    // ----------------------------------------------------------------------------------------
    // Admin configuration
    // ----------------------------------------------------------------------------------------

    function setPeer(uint32 eid, bytes32 peer) external onlyRole(ADMIN_ROLE) {
        peers[eid] = peer;
        emit PeerUpdated(eid, peer);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function updateCap(uint256 newCap) external onlyRole(ADMIN_ROLE) {
        require(newCap <= _maxSupply, "MyntisOFT: cap > max");
        uint256 previous = _cap;
        _cap = newCap;
        emit CapUpdated(previous, newCap);
    }

    function updateMintFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1_000, "MyntisOFT: fee too high"); // max 10%
        uint256 previous = _mintFee;
        _mintFee = newFee;
        emit MintFeeUpdated(previous, newFee);
    }

    function updateBurnFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1_000, "MyntisOFT: fee too high");
        uint256 previous = _burnFee;
        _burnFee = newFee;
        emit BurnFeeUpdated(previous, newFee);
    }

    function updateFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) {
        require(newRecipient != address(0), "MyntisOFT: recipient zero");
        address previous = _feeRecipient;
        _feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previous, newRecipient);
    }

    function grantAdmin(address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(ADMIN_ROLE, account);
    }

    function revokeAdmin(address account) external onlyRole(ADMIN_ROLE) {
        _revokeRole(ADMIN_ROLE, account);
    }

    // ----------------------------------------------------------------------------------------
    // Token mint/burn helpers
    // ----------------------------------------------------------------------------------------

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mintWithFee(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burnWithFee(from, amount);
    }

    function _mintWithFee(address to, uint256 amount) internal {
        require(to != address(0), "MyntisOFT: mint to zero");
        require(totalSupply() + amount <= _cap, "MyntisOFT: cap exceeded");

        uint256 feeAmount = (amount * _mintFee) / 10_000;
        uint256 netAmount = amount - feeAmount;

        _mint(to, netAmount);
        if (feeAmount > 0) {
            _mint(_feeRecipient, feeAmount);
        }
    }

    function _burnWithFee(address from, uint256 amount) internal {
        uint256 feeAmount = (amount * _burnFee) / 10_000;
        uint256 netAmount = amount - feeAmount;

        if (feeAmount > 0) {
            _transfer(from, _feeRecipient, feeAmount);
        }

        _burn(from, netAmount);
    }

    // ----------------------------------------------------------------------------------------
    // ERC20 overrides
    // ----------------------------------------------------------------------------------------

    function _update(address from, address to, uint256 value) internal override {
        if (paused()) {
            require(from == address(0) || to == address(0), "MyntisOFT: token transfer while paused");
        }
        super._update(from, to, value);
    }

    // ----------------------------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------------------------

    function cap() external view returns (uint256) {
        return _cap;
    }

    function maxSupply() external view returns (uint256) {
        return _maxSupply;
    }

    function mintFee() external view returns (uint256) {
        return _mintFee;
    }

    function burnFee() external view returns (uint256) {
        return _burnFee;
    }

    function feeRecipient() external view returns (address) {
        return _feeRecipient;
    }

    // ----------------------------------------------------------------------------------------
    // ERC165
    // ----------------------------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return AccessControl.supportsInterface(interfaceId);
    }
}
