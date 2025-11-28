// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    ILayerZeroEndpointV2,
    MessagingParams,
    MessagingReceipt,
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IGlobalSupplyRegistry} from "./IGlobalSupplyRegistry.sol";

/**
 * @title Myntis
 * @notice Canonical omnichain MYNT token with LayerZero V2 OFT support
 * @dev UUPS upgradeable token with cross-chain bridging capabilities
 * @dev 1B total supply: 800M emissions + 200M immediate allocation
 * @dev Hub token on Base, spoke tokens on other chains
 */
contract Myntis is 
    Initializable,
    ERC20Upgradeable, 
    PausableUpgradeable, 
    AccessControlUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct BridgeMessage {
        address to;
        uint256 amount;
        bytes metadata;
    }

    ILayerZeroEndpointV2 public endpoint;
    mapping(uint32 eid => bytes32 peer) public peers;
    IGlobalSupplyRegistry public globalSupplyRegistry;
    mapping(bytes32 guid => bool) public consumedGuids;

    // Production: 1 Billion total supply
    uint256 private _cap;
    uint256 private _maxSupply;
    uint256 private _mintFee; // Fee for minting (in basis points)
    uint256 private _burnFee; // Fee for burning (in basis points)
    address private _feeRecipient;
    
    // Events
    event CapUpdated(uint256 oldCap, uint256 newCap);
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event BurnFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event PeerUpdated(uint32 indexed eid, bytes32 indexed peer);
    event GlobalSupplyRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event BridgeQueued(bytes32 indexed guid, uint32 indexed dstEid, address indexed sender, address recipient, uint256 amount);
    event BridgeReceived(bytes32 indexed guid, uint32 indexed srcEid, address indexed recipient, uint256 amount);
    event TokensMinted(address indexed to, uint256 amount, uint256 fee);
    event TokensBurned(address indexed from, uint256 amount, uint256 fee);

    error UnknownPeer(uint32 eid);
    error InvalidEndpoint();
    error InvalidPeer();
    error GuidConsumed(bytes32 guid);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the upgradeable token with 1B supply and LayerZero support
     * @param admin The admin address
     * @param cap_ The token cap (1B)
     * @param maxSupply_ The maximum supply (1B)
     * @param endpoint_ LayerZero endpoint address (can be zero if not using cross-chain yet)
     */
    function initialize(
        address admin,
        uint256 cap_,
        uint256 maxSupply_,
        address endpoint_
    ) public initializer {
        __ERC20_init("Myntis", "MYNT");
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        // Production: 1 Billion total supply
        require(cap_ == 1_000_000_000 * 1e18, "Cap must be 1B");
        require(maxSupply_ == 1_000_000_000 * 1e18, "Max supply must be 1B");
        require(cap_ <= maxSupply_, "Cap exceeds max supply");
        
        _cap = cap_;
        _maxSupply = maxSupply_;
        _mintFee = 0; // 0% fee by default
        _burnFee = 0; // 0% fee by default
        _feeRecipient = admin;

        if (endpoint_ != address(0)) {
            endpoint = ILayerZeroEndpointV2(endpoint_);
        }

        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Mint tokens with fee
     * @dev Only authorized minters can mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(!paused(), "Minting is paused");
        _mintWithFee(to, amount);
    }

    /**
     * @notice Burn tokens with fee
     * @dev Only authorized burners can burn
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        require(!paused(), "Burning is paused");
        _burnWithFee(from, amount);
    }

    function _mintWithFee(address to, uint256 amount) internal {
        require(to != address(0), "Myntis: mint to zero");
        require(totalSupply() + amount <= _cap, "Myntis: cap exceeded");

        // Check global supply cap if registry is set
        if (address(globalSupplyRegistry) != address(0)) {
            require(globalSupplyRegistry.canMint(amount), "Myntis: global cap exceeded");
        }

        uint256 fee = (amount * _mintFee) / 10000;
        uint256 netAmount = amount - fee;
        
        _mint(to, netAmount);
        
        if (fee > 0) {
            _mint(_feeRecipient, fee);
        }

        // Record mint in global registry if set
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordMint(amount);
        }
        
        emit TokensMinted(to, amount, fee);
    }

    function _burnWithFee(address from, uint256 amount) internal {
        if (from != msg.sender) {
            uint256 currentAllowance = allowance(from, msg.sender);
            require(currentAllowance >= amount, "insufficient allowance");
            unchecked { _approve(from, msg.sender, currentAllowance - amount); }
        }
        
        uint256 fee = (amount * _burnFee) / 10000;
        uint256 netAmount = amount - fee;

        if (fee > 0) {
            _transfer(from, _feeRecipient, fee);
        }
        
        _burn(from, netAmount);

        // Record net burn amount (fee stays in circulation, so only netAmount reduces supply)
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordBurn(netAmount);
        }
        
        emit TokensBurned(from, amount, fee);
    }

    /**
     * @notice Update the token cap
     */
    function updateCap(uint256 newCap) external onlyRole(ADMIN_ROLE) {
        require(newCap <= _maxSupply, "Cap exceeds max supply");
        uint256 oldCap = _cap;
        _cap = newCap;
        emit CapUpdated(oldCap, newCap);
    }

    /**
     * @notice Update minting fee
     */
    function updateMintFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1000, "Fee cannot exceed 10%");
        uint256 oldFee = _mintFee;
        _mintFee = newFee;
        emit MintFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Update burning fee
     */
    function updateBurnFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1000, "Fee cannot exceed 10%");
        uint256 oldFee = _burnFee;
        _burnFee = newFee;
        emit BurnFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Update fee recipient
     */
    function updateFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) {
        require(newRecipient != address(0), "Invalid recipient");
        address oldRecipient = _feeRecipient;
        _feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /**
     * @notice Set LayerZero peer contract on another chain
     */
    function setPeer(uint32 eid, bytes32 peer) external onlyRole(ADMIN_ROLE) {
        require(address(endpoint) != address(0), "Myntis: endpoint not set");
        peers[eid] = peer;
        emit PeerUpdated(eid, peer);
    }

    /**
     * @notice Set global supply registry
     * @dev IMPORTANT: After calling this, admin must call registry.registerToken(address(this))
     *      to grant TOKEN_ROLE, otherwise mint/burn will revert when registry is used.
     */
    function setGlobalSupplyRegistry(address registry) external onlyRole(ADMIN_ROLE) {
        require(registry != address(0), "Myntis: registry zero");
        address previous = address(globalSupplyRegistry);
        globalSupplyRegistry = IGlobalSupplyRegistry(registry);
        emit GlobalSupplyRegistryUpdated(previous, registry);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
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
        require(address(endpoint) != address(0), "Myntis: endpoint not set");
        bytes32 peer = peers[dstEid];
        if (peer == bytes32(0)) revert UnknownPeer(dstEid);
        bytes memory payload = abi.encode(BridgeMessage({to: to, amount: amount, metadata: metadata}));
        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: peer,
            message: payload,
            options: options,
            payInLzToken: payInLzToken
        });
        return endpoint.quote(params, address(this));
    }

    /**
     * @notice Burn and bridge MYNT to a remote chain.
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
        require(address(endpoint) != address(0), "Myntis: endpoint not set");
        require(to != address(0), "Myntis: zero recipient");
        require(refundAddress != address(0), "Myntis: zero refund");
        bytes32 peer = peers[dstEid];
        if (peer == bytes32(0)) revert UnknownPeer(dstEid);
        require(amount > 0, "Myntis: zero amount");

        _burnWithFee(msg.sender, amount);

        MessagingParams memory params = MessagingParams({
            dstEid: dstEid,
            receiver: peer,
            message: abi.encode(BridgeMessage({to: to, amount: amount, metadata: metadata})),
            options: options,
            payInLzToken: payInLzToken
        });

        uint256 nativeFee = endpoint.quote(params, msg.sender).nativeFee;
        require(msg.value >= nativeFee, "Myntis: insufficient fee");

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
        require(address(endpoint) != address(0), "Myntis: endpoint not set");
        if (msg.sender != address(endpoint)) revert InvalidEndpoint();
        if (receiver != address(this)) revert InvalidEndpoint();

        if (consumedGuids[guid]) revert GuidConsumed(guid);
        consumedGuids[guid] = true;

        bytes32 expectedPeer = peers[origin.srcEid];
        if (expectedPeer == bytes32(0) || expectedPeer != origin.sender) revert InvalidPeer();

        BridgeMessage memory bridgeMsg = abi.decode(message, (BridgeMessage));
        require(bridgeMsg.to != address(0), "Myntis: zero recipient");
        require(bridgeMsg.amount > 0, "Myntis: zero amount");

        _mintWithFee(bridgeMsg.to, bridgeMsg.amount);
        emit BridgeReceived(guid, origin.srcEid, bridgeMsg.to, bridgeMsg.amount);
    }

    // View functions
    function cap() public view returns (uint256) { return _cap; }
    function maxSupply() public view returns (uint256) { return _maxSupply; }
    function mintFee() public view returns (uint256) { return _mintFee; }
    function burnFee() public view returns (uint256) { return _burnFee; }
    function feeRecipient() public view returns (address) { return _feeRecipient; }

    /**
     * @notice Get contract information
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint256 cap_,
        uint256 maxSupply_,
        bool paused_,
        address admin
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            cap(),
            maxSupply(),
            paused(),
            address(0) // Admin address - would need to be tracked separately
        );
    }
}
