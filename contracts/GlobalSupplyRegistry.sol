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
    }
    
    event SupplyUpdated(uint32 indexed chainId, uint256 supplyDelta, uint256 newTotalSupply, uint256 totalCrossChainSupply);
    event PeerUpdated(uint32 indexed eid, bytes32 indexed peer);
    event CapUpdated(uint256 oldCap, uint256 newCap);
    
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
}

