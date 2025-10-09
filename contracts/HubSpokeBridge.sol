// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

// import {OApp, Origin, MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HubSpokeBridge
 * @notice Unified LayerZero bridge for hub and spoke chains
 * @dev Deploys on both hub and spokes with different functionality
 */
contract HubSpokeBridge is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    // Token contracts
    address public immutable token;
    address public immutable merkleDistributor;
    address public immutable globalNullifier;
    
    // Chain configuration
    uint32 public immutable hubChainId;
    bool public immutable isHub;
    
    // Message types
    enum MessageType { 
        TokenTransfer,      // Regular token transfer
        RewardDistribution, // Cross-chain reward distribution
        NullifierBurn      // Nullifier burn notification
    }
    
    // Message structures
    struct TokenTransferMessage {
        MessageType msgType;
        address recipient;
        uint256 amount;
        bool isProviderReward;
        string reason;
    }
    
    struct RewardDistributionMessage {
        MessageType msgType;
        address provider;
        uint256 rootIndex;
        uint256 totalAmount;
        bytes32 merkleRoot;
        uint256 expiry;
    }
    
    struct NullifierBurnMessage {
        MessageType msgType;
        bytes32 nullifier;
        uint32 sourceChainId;
        address user;
    }
    
    // Events
    event TokensBridged(address indexed user, uint32 dstChainId, uint256 amount, bool isProviderReward);
    event TokensReceived(address indexed recipient, uint32 srcChainId, uint256 amount, string reason);
    event RewardDistributed(address indexed provider, uint32 dstChainId, uint256 amount);
    event NullifierBurned(bytes32 indexed nullifier, uint32 srcChainId, address indexed user);
    event BridgeRoleUpdated(address indexed bridge, bool enabled);

    constructor(
        address _lzEndpoint,
        address _owner,
        address _token,
        address _merkleDistributor,
        address _globalNullifier,
        uint32 _hubChainId,
        bool _isHub
    ) {
        token = _token;
        merkleDistributor = _merkleDistributor;
        globalNullifier = _globalNullifier;
        hubChainId = _hubChainId;
        isHub = _isHub;
        
        _grantRole(ADMIN_ROLE, _owner);
        _grantRole(BRIDGE_ROLE, _owner);
    }

    /**
     * @notice Bridge tokens to another chain
     * @dev Hub: Burns tokens and sends message
     * @dev Spoke: Burns tokens and sends message to hub
     */
    function bridgeTokens(
        uint32 dstChainId,
        uint256 amount,
        address recipient,
        bool isProviderReward,
        string calldata reason
    ) external payable nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        require(recipient != address(0), "Invalid recipient");
        // TODO: Check peer configuration (simplified for testing)
        // require(peers[dstChainId] != bytes32(0), "Peer not set");

        // Burn tokens from sender
        (bool burnSuccess, ) = token.call(
            abi.encodeWithSignature("burn(address,uint256,string)", msg.sender, amount, reason)
        );
        require(burnSuccess, "Token burn failed");

        // Prepare message
        TokenTransferMessage memory message = TokenTransferMessage({
            msgType: MessageType.TokenTransfer,
            recipient: recipient,
            amount: amount,
            isProviderReward: isProviderReward,
            reason: reason
        });

        // TODO: Send LayerZero message (simplified for testing)
        emit TokensBridged(msg.sender, dstChainId, amount, isProviderReward);
        
        emit TokensBridged(msg.sender, dstChainId, amount, isProviderReward);
    }

    /**
     * @notice Distribute rewards to spoke chains
     * @dev Only callable on hub chain
     */
    function distributeRewards(
        uint32[] calldata dstChainIds,
        address provider,
        uint256 rootIndex,
        uint256 totalAmount,
        bytes32 merkleRoot,
        uint256 expiry
    ) external payable onlyRole(BRIDGE_ROLE) {
        require(isHub, "Only callable on hub");
        require(dstChainIds.length > 0, "No destination chains");

        for (uint256 i = 0; i < dstChainIds.length; i++) {
            // TODO: Check peer configuration (simplified for testing)
            // require(peers[dstChainIds[i]] != bytes32(0), "Peer not set");
            
            RewardDistributionMessage memory message = RewardDistributionMessage({
                msgType: MessageType.RewardDistribution,
                provider: provider,
                rootIndex: rootIndex,
                totalAmount: totalAmount,
                merkleRoot: merkleRoot,
                expiry: expiry
            });

            // TODO: Send LayerZero message (simplified for testing)
            emit RewardDistributed(provider, dstChainIds[i], totalAmount);
            emit RewardDistributed(provider, dstChainIds[i], totalAmount);
        }
    }

    /**
     * @notice Notify hub of nullifier burn
     * @dev Only callable on spoke chains
     */
    function notifyNullifierBurn(
        bytes32 nullifier,
        address user
    ) external onlyRole(BRIDGE_ROLE) {
        require(!isHub, "Only callable on spoke");
        
        NullifierBurnMessage memory message = NullifierBurnMessage({
            msgType: MessageType.NullifierBurn,
            nullifier: nullifier,
            sourceChainId: uint32(block.chainid),
            user: user
        });

        // TODO: Send LayerZero message (simplified for testing)
        emit NullifierBurned(nullifier, uint32(block.chainid), user);
        emit NullifierBurned(nullifier, uint32(block.chainid), user);
    }

    /**
     * @notice Handle incoming messages (simplified for testing)
     */
    function handleIncomingMessage(
        bytes calldata message
    ) external onlyRole(BRIDGE_ROLE) {
        MessageType msgType = abi.decode(message, (MessageType));
        
        if (msgType == MessageType.TokenTransfer) {
            _handleTokenTransfer(message);
        } else if (msgType == MessageType.RewardDistribution) {
            _handleRewardDistribution(message);
        } else if (msgType == MessageType.NullifierBurn) {
            _handleNullifierBurn(message);
        }
    }

    /**
     * @notice Handle token transfer messages
     */
    function _handleTokenTransfer(bytes calldata message) internal {
        TokenTransferMessage memory transferMsg = abi.decode(message, (TokenTransferMessage));
        
        // Mint tokens to recipient
        (bool mintSuccess, ) = token.call(
            abi.encodeWithSignature("mint(address,uint256,string)", 
                transferMsg.recipient, 
                transferMsg.amount, 
                transferMsg.reason)
        );
        require(mintSuccess, "Token mint failed");
        
        emit TokensReceived(transferMsg.recipient, uint32(block.chainid), transferMsg.amount, transferMsg.reason);
    }

    /**
     * @notice Handle reward distribution messages
     * @dev Only processed on spoke chains
     */
    function _handleRewardDistribution(bytes calldata message) internal {
        require(!isHub, "Reward distribution only on spokes");
        
        RewardDistributionMessage memory rewardMsg = abi.decode(message, (RewardDistributionMessage));
        
        // Notify spoke distributor (if it exists)
        // This would integrate with SpokeDistributor contract
        emit RewardDistributed(rewardMsg.provider, uint32(block.chainid), rewardMsg.totalAmount);
    }

    /**
     * @notice Handle nullifier burn messages
     * @dev Only processed on hub chain
     */
    function _handleNullifierBurn(bytes calldata message) internal {
        require(isHub, "Nullifier burn only on hub");
        
        NullifierBurnMessage memory nullifierMsg = abi.decode(message, (NullifierBurnMessage));
        
        // Notify GlobalNullifier
        (bool success, ) = globalNullifier.call(
            abi.encodeWithSignature("burnNullifier(bytes32,uint32,address)", 
                nullifierMsg.nullifier, 
                nullifierMsg.sourceChainId, 
                nullifierMsg.user)
        );
        require(success, "Nullifier burn failed");
        
        emit NullifierBurned(nullifierMsg.nullifier, nullifierMsg.sourceChainId, nullifierMsg.user);
    }

    /**
     * @notice Set bridge role for cross-chain operations
     */
    function setBridgeRole(address bridge, bool enabled) external onlyRole(ADMIN_ROLE) {
        if (enabled) {
            _grantRole(BRIDGE_ROLE, bridge);
        } else {
            _revokeRole(BRIDGE_ROLE, bridge);
        }
        emit BridgeRoleUpdated(bridge, enabled);
    }

    /**
     * @notice Get contract information
     */
    function getContractInfo() external view returns (
        address token_,
        address merkleDistributor_,
        address globalNullifier_,
        uint32 hubChainId_,
        bool isHub_,
        bool isHubChain
    ) {
        return (
            token,
            merkleDistributor,
            globalNullifier,
            hubChainId,
            isHub,
            block.chainid == hubChainId
        );
    }
}
