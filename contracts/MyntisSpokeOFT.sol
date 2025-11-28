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

/**
 * @title MyntisSpokeOFT
 * @notice Spoke-side OFT token that communicates directly with LayerZero V2
 * @dev Mirrors `MyntisOFT` capabilities for chains where we deploy the spoke proxy
 * @dev UUPS upgradeable pattern for spoke deployments
 */
contract MyntisSpokeOFT is 
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

    struct SupplyUpdate {
        uint32 chainId;
        uint256 supplyDelta;
        uint256 newTotalSupply;
    }

    ILayerZeroEndpointV2 public endpoint;
    mapping(uint32 => bytes32) public peers; // chainId => peer address
    uint32 public hubChainId;
    address public hubToken; // Hub token address (for reference)
    bytes32 public registryPeer; // Registry peer address on hub chain (for supply reporting)
    mapping(bytes32 guid => bool) public consumedGuids;

    // Events
    event PeerSet(uint32 indexed chainId, bytes32 indexed peer);
    event BridgeQueued(bytes32 indexed guid, uint32 indexed dstChainId, address indexed sender, address recipient, uint256 amount);
    event BridgeReceived(bytes32 indexed guid, uint32 indexed srcChainId, address indexed recipient, uint256 amount);
    event TokensBridgedIn(address indexed to, uint256 amount);
    event TokensBridgedOut(address indexed from, uint256 amount);
    event SupplyChangeRequiresReporting(uint256 newTotalSupply, uint32 chainId);

    error UnknownPeer(uint32 eid);
    error InvalidEndpoint();
    error InvalidPeer();
    error GuidConsumed(bytes32 guid);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the spoke OFT token
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _delegate Delegate/admin address
     * @param _hubChainId Hub chain ID
     * @param _hubToken Hub token address
     * @param _endpoint LayerZero endpoint address on this chain
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _delegate,
        uint32 _hubChainId,
        address _hubToken,
        address _endpoint
    ) public initializer {
        require(_endpoint != address(0), "MyntisSpokeOFT: endpoint zero");

        __ERC20_init(_name, _symbol);
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        hubChainId = _hubChainId;
        hubToken = _hubToken;
        endpoint = ILayerZeroEndpointV2(_endpoint);

        _grantRole(ADMIN_ROLE, _delegate);
        _grantRole(MINTER_ROLE, _delegate);
        _grantRole(BURNER_ROLE, _delegate);
        _grantRole(UPGRADER_ROLE, _delegate);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Set peer contract on another chain
     * @param _chainId Destination chain ID
     * @param _peer Peer contract address
     */
    function setPeer(uint32 _chainId, bytes32 _peer) external onlyRole(ADMIN_ROLE) {
        peers[_chainId] = _peer;
        emit PeerSet(_chainId, _peer);
    }

    /**
     * @notice Set registry peer address on hub chain for supply reporting
     * @param _registryPeer Registry contract address on hub (as bytes32)
     */
    function setRegistryPeer(bytes32 _registryPeer) external onlyRole(ADMIN_ROLE) {
        registryPeer = _registryPeer;
    }

    /**
     * @notice Quote the native fee for bridging a given amount.
     */
    function quoteBridge(
        uint32 dstChainId,
        address to,
        uint256 amount,
        bytes calldata metadata,
        bytes calldata options,
        bool payInLzToken
    ) external view returns (MessagingFee memory fee) {
        bytes32 peer = peers[dstChainId];
        if (peer == bytes32(0)) revert UnknownPeer(dstChainId);
        bytes memory payload = abi.encode(BridgeMessage({to: to, amount: amount, metadata: metadata}));
        MessagingParams memory params = MessagingParams({
            dstEid: dstChainId,
            receiver: peer,
            message: payload,
            options: options,
            payInLzToken: payInLzToken
        });
        return endpoint.quote(params, address(this));
    }

    /**
     * @notice Burn and bridge MYNT from this spoke to another chain.
     */
    function bridge(
        uint32 dstChainId,
        address to,
        uint256 amount,
        bytes calldata metadata,
        bytes calldata options,
        address refundAddress,
        bool payInLzToken
    ) external payable whenNotPaused returns (MessagingReceipt memory receipt) {
        return _bridge(msg.sender, dstChainId, to, amount, metadata, options, refundAddress, payInLzToken);
    }

    /**
     * @notice Backwards compatible helper that burns on behalf of `_from` and bridges with empty metadata/options.
     */
    function sendFrom(
        address _from,
        uint32 _dstChainId,
        bytes32 _to,
        uint256 _amount
    ) external payable whenNotPaused returns (MessagingReceipt memory receipt) {
        address recipient = address(uint160(uint256(_to)));
        return _bridge(_from, _dstChainId, recipient, _amount, bytes(""), bytes(""), msg.sender, false);
    }

    function _bridge(
        address from,
        uint32 dstChainId,
        address to,
        uint256 amount,
        bytes memory metadata,
        bytes memory options,
        address refundAddress,
        bool payInLzToken
    ) internal returns (MessagingReceipt memory receipt) {
        require(amount > 0, "MyntisSpokeOFT: zero amount");
        require(to != address(0), "MyntisSpokeOFT: zero recipient");
        require(refundAddress != address(0), "MyntisSpokeOFT: zero refund");

        bytes32 peer = peers[dstChainId];
        if (peer == bytes32(0)) revert UnknownPeer(dstChainId);

        if (from != msg.sender) {
            _spendAllowance(from, msg.sender, amount);
        }
        _burn(from, amount);

        MessagingParams memory params = MessagingParams({
            dstEid: dstChainId,
            receiver: peer,
            message: abi.encode(BridgeMessage({to: to, amount: amount, metadata: metadata})),
            options: options,
            payInLzToken: payInLzToken
        });

        uint256 nativeFee = endpoint.quote(params, msg.sender).nativeFee;
        require(msg.value >= nativeFee, "MyntisSpokeOFT: insufficient fee");

        receipt = endpoint.send{value: msg.value}(params, refundAddress);
        emit BridgeQueued(receipt.guid, dstChainId, from, to, amount);
        
        // Emit event to trigger supply reporting (keeper should call reportSupplyUpdate)
        if (registryPeer != bytes32(0)) {
            emit SupplyChangeRequiresReporting(totalSupply(), uint32(block.chainid));
        }
    }

    /**
     * @notice Receive tokens from another chain (OFT functionality)
     * @param _srcChainId Source chain ID
     * @param _to Destination address
     * @param _amount Amount to receive
     * @dev Manual admin function for backwards compatibility; normal flow uses lzReceive
     */
    function receiveFrom(
        uint32 _srcChainId,
        address _to,
        uint256 _amount
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(_to != address(0), "MyntisSpokeOFT: zero recipient");
        require(_amount > 0, "MyntisSpokeOFT: zero amount");
        
        _mint(_to, _amount);
        emit BridgeReceived(bytes32(0), _srcChainId, _to, _amount);
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

        if (consumedGuids[guid]) revert GuidConsumed(guid);
        consumedGuids[guid] = true;

        bytes32 expectedPeer = peers[origin.srcEid];
        if (expectedPeer == bytes32(0) || expectedPeer != origin.sender) revert InvalidPeer();

        BridgeMessage memory bridgeMsg = abi.decode(message, (BridgeMessage));
        require(bridgeMsg.to != address(0), "MyntisSpokeOFT: zero recipient");
        require(bridgeMsg.amount > 0, "MyntisSpokeOFT: zero amount");

        _mint(bridgeMsg.to, bridgeMsg.amount);
        emit BridgeReceived(guid, origin.srcEid, bridgeMsg.to, bridgeMsg.amount);
        
        // Emit event to trigger supply reporting (keeper should call reportSupplyUpdate)
        if (registryPeer != bytes32(0)) {
            emit SupplyChangeRequiresReporting(totalSupply(), uint32(block.chainid));
        }
    }

    /**
     * @notice Report supply update to hub registry (for cap enforcement)
     * @dev Sends LayerZero message to registry with current supply
     * @dev Can be called by anyone (keeper/relayer) to sync supply
     * @param options LayerZero executor options
     * @param refundAddress Address to receive fee refund
     */
    function reportSupplyUpdate(
        bytes calldata options,
        address refundAddress
    ) public payable returns (MessagingReceipt memory receipt) {
        require(registryPeer != bytes32(0), "MyntisSpokeOFT: registry not set");
        require(hubChainId != 0, "MyntisSpokeOFT: hub chain not set");
        
        uint32 currentChainId = uint32(block.chainid);
        uint256 currentSupply = totalSupply();
        
        SupplyUpdate memory update = SupplyUpdate({
            chainId: currentChainId,
            supplyDelta: 0, // Delta not used for sync, newTotalSupply is authoritative
            newTotalSupply: currentSupply
        });
        
        MessagingParams memory params = MessagingParams({
            dstEid: hubChainId,
            receiver: registryPeer,
            message: abi.encode(update),
            options: options,
            payInLzToken: false
        });
        
        uint256 nativeFee = endpoint.quote(params, msg.sender).nativeFee;
        require(msg.value >= nativeFee, "MyntisSpokeOFT: insufficient fee");
        
        receipt = endpoint.send{value: msg.value}(params, refundAddress);
    }

    /**
     * @notice Bridge tokens in from hub chain
     * @param _to Destination address
     * @param _amount Amount to bridge
     */
    function bridgeIn(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) {
        require(_to != address(0), "MyntisSpokeOFT: zero recipient");
        require(_amount > 0, "MyntisSpokeOFT: zero amount");
        
        _mint(_to, _amount);
        emit TokensBridgedIn(_to, _amount);
        
        // Emit event to trigger supply reporting
        if (registryPeer != bytes32(0)) {
            emit SupplyChangeRequiresReporting(totalSupply(), uint32(block.chainid));
        }
    }

    /**
     * @notice Bridge tokens out to hub chain
     * @param _from Source address
     * @param _amount Amount to bridge
     */
    function bridgeOut(address _from, uint256 _amount) external onlyRole(BURNER_ROLE) {
        require(_amount > 0, "Amount must be positive");
        
        _burn(_from, _amount);
        emit TokensBridgedOut(_from, _amount);
        
        // Emit event to trigger supply reporting
        if (registryPeer != bytes32(0)) {
            emit SupplyChangeRequiresReporting(totalSupply(), uint32(block.chainid));
        }
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

    /**
     * @notice Get cross-chain information
     */
    function getCrossChainInfo() external view returns (
        uint32 hubChainId_,
        address hubToken_,
        uint32 currentChainId
    ) {
        return (
            hubChainId,
            hubToken,
            uint32(block.chainid)
        );
    }

    /**
     * @notice Get contract information
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        bool paused_
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            paused()
        );
    }
}
