// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    ILayerZeroEndpointV2,
    MessagingParams,
    MessagingReceipt,
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/**
 * @title GlobalSupplyRegistry
 * @notice Tracks total token supply across all chains
 * @dev Deployed on hub chain, receives supply updates from spokes via LayerZero
 * @dev Enforces global cap (1B) across all chains
 */
contract GlobalSupplyRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant SPOKE_ROLE = keccak256("SPOKE_ROLE");
    bytes32 public constant TOKEN_ROLE = keccak256("TOKEN_ROLE"); // For hub/spoke token contracts
    
    ILayerZeroEndpointV2 public immutable endpoint;
    mapping(uint32 eid => bytes32 peer) public peers;
    
    // Global supply tracking
    uint256 public globalCap; // e.g., 1B tokens
    mapping(uint32 eid => uint256) public chainSupply; // Per-chain supply
    uint256 public totalCrossChainSupply; // Sum of all chain supplies
    
    struct SupplyUpdate {
        uint32 chainId;
        uint256 supplyDelta; // Positive for mint, negative for burn
        uint256 newTotalSupply;
        uint256 nonce; // SECURITY FIX: Added nonce for ordering
    }
    
    // SECURITY FIX: Nonce tracking per chain to prevent stale updates
    mapping(uint32 => uint256) public chainNonce;
    
    event SupplyUpdated(uint32 indexed chainId, uint256 supplyDelta, uint256 newTotalSupply, uint256 totalCrossChainSupply);
    event PeerUpdated(uint32 indexed eid, bytes32 indexed peer);
    event CapUpdated(uint256 oldCap, uint256 newCap);
    event ChainReseeded(uint32 indexed chainId, uint256 oldSupply, uint256 newSupply);
    event StaleUpdateRejected(uint32 indexed chainId, uint256 providedNonce, uint256 expectedNonce);
    
    error UnknownPeer(uint32 eid);
    error InvalidEndpoint();
    error InvalidPeer();
    error CapExceeded(uint256 current, uint256 cap);
    
    constructor(address endpoint_, address admin_) {
        require(endpoint_ != address(0), "GlobalSupplyRegistry: endpoint zero");
        require(admin_ != address(0), "GlobalSupplyRegistry: admin zero");
        
        endpoint = ILayerZeroEndpointV2(endpoint_);
        _grantRole(ADMIN_ROLE, admin_);
        globalCap = 1_000_000_000 * 1e18; // 1B default
    }
    
    /**
     * @notice Register a spoke chain
     */
    function registerSpoke(uint32 eid, bytes32 peer) external onlyRole(ADMIN_ROLE) {
        require(peer != bytes32(0), "GlobalSupplyRegistry: zero peer");
        peers[eid] = peer;
        _grantRole(SPOKE_ROLE, address(uint160(uint256(peer))));
        emit PeerUpdated(eid, peer);
    }

    /**
     * @notice Register a token contract (hub or spoke) to allow direct supply reporting
     */
    function registerToken(address token) external onlyRole(ADMIN_ROLE) {
        require(token != address(0), "GlobalSupplyRegistry: zero token");
        _grantRole(TOKEN_ROLE, token);
    }
    
    /**
     * @notice Update supply from spoke chain (called via LayerZero)
     * @dev SECURITY FIX: Validates nonce to prevent stale updates from overwriting newer ones
     */
    function lzReceive(
        Origin calldata origin,
        address receiver,
        bytes32 guid,
        bytes calldata message,
        bytes calldata /* extraData */
    ) external payable nonReentrant {
        if (msg.sender != address(endpoint)) revert InvalidEndpoint();
        if (receiver != address(this)) revert InvalidEndpoint();
        
        bytes32 expectedPeer = peers[origin.srcEid];
        if (expectedPeer == bytes32(0) || expectedPeer != origin.sender) revert InvalidPeer();
        
        SupplyUpdate memory update = abi.decode(message, (SupplyUpdate));
        
        uint32 chainId = update.chainId;
        uint256 supplyDelta = update.supplyDelta;
        uint256 newChainSupply = update.newTotalSupply;
        
        // CRITICAL FIX: Validate chainId matches the actual source chain
        // Prevents spoke from spoofing supply updates for other chains
        require(chainId == origin.srcEid, "GlobalSupplyRegistry: chainId mismatch");
        
        // SECURITY FIX: Validate nonce to prevent stale updates
        if (update.nonce <= chainNonce[chainId]) {
            emit StaleUpdateRejected(chainId, update.nonce, chainNonce[chainId]);
            return; // Silently reject stale updates
        }
        chainNonce[chainId] = update.nonce;
        
        // Update chain supply
        uint256 oldChainSupply = chainSupply[chainId];
        chainSupply[chainId] = newChainSupply;
        
        // Update total cross-chain supply
        totalCrossChainSupply = totalCrossChainSupply - oldChainSupply + newChainSupply;
        
        // Verify global cap
        if (totalCrossChainSupply > globalCap) {
            revert CapExceeded(totalCrossChainSupply, globalCap);
        }
        
        emit SupplyUpdated(chainId, supplyDelta, newChainSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Get total supply across all chains
     */
    function getGlobalSupply() external view returns (uint256) {
        return totalCrossChainSupply;
    }
    
    /**
     * @notice Record a mint on the hub chain (direct call, not via LayerZero)
     * @param amount Amount minted
     */
    function recordMint(uint256 amount) external onlyRole(TOKEN_ROLE) nonReentrant {
        require(amount > 0, "GlobalSupplyRegistry: zero amount");
        uint32 chainId = uint32(block.chainid);
        uint256 oldChainSupply = chainSupply[chainId];
        uint256 newChainSupply = oldChainSupply + amount;
        
        // Check cap before updating
        uint256 newTotal = totalCrossChainSupply - oldChainSupply + newChainSupply;
        if (newTotal > globalCap) {
            revert CapExceeded(newTotal, globalCap);
        }
        
        chainSupply[chainId] = newChainSupply;
        totalCrossChainSupply = newTotal;
        
        emit SupplyUpdated(chainId, amount, newChainSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Record a burn on the hub chain (direct call, not via LayerZero)
     * @param amount Amount burned (net amount after fees)
     * @dev Emits amount as delta; newTotalSupply will be lower, indicating a burn
     */
    function recordBurn(uint256 amount) external onlyRole(TOKEN_ROLE) nonReentrant {
        require(amount > 0, "GlobalSupplyRegistry: zero amount");
        uint32 chainId = uint32(block.chainid);
        uint256 oldChainSupply = chainSupply[chainId];
        require(oldChainSupply >= amount, "GlobalSupplyRegistry: burn exceeds supply");
        
        uint256 newChainSupply = oldChainSupply - amount;
        chainSupply[chainId] = newChainSupply;
        totalCrossChainSupply = totalCrossChainSupply - amount;
        
        // Emit amount as delta; the reduction is clear from newTotalSupply < oldChainSupply
        emit SupplyUpdated(chainId, amount, newChainSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Check if minting would exceed global cap
     */
    function canMint(uint256 amount) external view returns (bool) {
        return totalCrossChainSupply + amount <= globalCap;
    }
    
    /**
     * @notice Seed initial supply for a chain (for existing deployments)
     * @param chainId Chain ID to seed
     * @param initialSupply Initial supply on that chain
     */
    function seedChainSupply(uint32 chainId, uint256 initialSupply) external onlyRole(ADMIN_ROLE) {
        require(chainSupply[chainId] == 0, "GlobalSupplyRegistry: chain already seeded");
        require(initialSupply <= globalCap, "GlobalSupplyRegistry: initial supply exceeds cap");
        
        chainSupply[chainId] = initialSupply;
        totalCrossChainSupply += initialSupply;
        
        require(totalCrossChainSupply <= globalCap, "GlobalSupplyRegistry: total exceeds cap");
        
        emit SupplyUpdated(chainId, initialSupply, initialSupply, totalCrossChainSupply);
    }

    /**
     * @notice Update global cap (admin only)
     */
    function updateCap(uint256 newCap) external onlyRole(ADMIN_ROLE) {
        require(newCap >= totalCrossChainSupply, "GlobalSupplyRegistry: cap < current supply");
        uint256 oldCap = globalCap;
        globalCap = newCap;
        emit CapUpdated(oldCap, newCap);
    }
    
    /**
     * @notice Re-seed chain supply for error correction (admin only)
     * @param chainId Chain ID to reseed
     * @param newSupply Corrected supply for that chain
     * @param newNonce New nonce to set (should be higher than any pending messages)
     * @dev SECURITY FIX: Allows admin to correct seeding errors
     * @dev SECURITY FIX: Resets nonce to prevent replay attacks after reseed
     */
    function reseedChainSupply(uint32 chainId, uint256 newSupply, uint256 newNonce) external onlyRole(ADMIN_ROLE) {
        uint256 oldSupply = chainSupply[chainId];
        
        // Calculate new total
        uint256 newTotal = totalCrossChainSupply - oldSupply + newSupply;
        require(newTotal <= globalCap, "GlobalSupplyRegistry: would exceed cap");
        
        chainSupply[chainId] = newSupply;
        totalCrossChainSupply = newTotal;
        
        // SECURITY FIX: Reset nonce to prevent replay attacks with old messages
        chainNonce[chainId] = newNonce;
        
        emit ChainReseeded(chainId, oldSupply, newSupply);
        emit SupplyUpdated(chainId, newSupply > oldSupply ? newSupply - oldSupply : oldSupply - newSupply, newSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Get current nonce for a chain
     * @param chainId Chain ID to query
     * @return Current nonce for the chain
     */
    function getChainNonce(uint32 chainId) external view returns (uint256) {
        return chainNonce[chainId];
    }
    
    /**
     * @notice Force accept next supply update for a chain (admin recovery)
     * @param chainId Chain ID to reset nonce for
     * @dev SECURITY FIX: Allows recovery from out-of-order message scenarios
     * @dev Sets nonce to 0 so next update will be accepted regardless of its nonce
     * @dev Use with caution - can allow replay of old messages
     */
    function resetChainNonce(uint32 chainId) external onlyRole(ADMIN_ROLE) {
        uint256 oldNonce = chainNonce[chainId];
        chainNonce[chainId] = 0;
        emit ChainNonceReset(chainId, oldNonce);
    }
    
    /**
     * @notice Force synchronize supply from a chain (bypass LayerZero)
     * @param chainId Chain ID
     * @param newSupply New supply value
     * @param minNonce Optional minimum nonce to set (0 to keep current)
     * @dev SECURITY FIX: Emergency recovery when LZ messages are stuck/lost
     * @dev SECURITY FIX: Optionally sets minNonce to reject old in-flight messages
     */
    function forceSupplySync(uint32 chainId, uint256 newSupply, uint256 minNonce) external onlyRole(ADMIN_ROLE) {
        uint256 oldSupply = chainSupply[chainId];
        uint256 newTotal = totalCrossChainSupply - oldSupply + newSupply;
        require(newTotal <= globalCap, "GlobalSupplyRegistry: would exceed cap");
        
        chainSupply[chainId] = newSupply;
        totalCrossChainSupply = newTotal;
        
        // SECURITY FIX: Optionally update nonce to reject old in-flight messages
        if (minNonce > chainNonce[chainId]) {
            chainNonce[chainId] = minNonce;
        }
        
        emit SupplyUpdated(chainId, newSupply > oldSupply ? newSupply - oldSupply : oldSupply - newSupply, newSupply, totalCrossChainSupply);
    }
    
    event ChainNonceReset(uint32 indexed chainId, uint256 oldNonce);
}

