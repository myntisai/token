// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GlobalNullifier
 * @notice Global nullifier system to prevent double-claiming across all chains
 * @dev Deployed on Base hub, used by all spoke chains
 */
contract GlobalNullifier is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant SPOKE_ROLE = keccak256("SPOKE_ROLE");
    
    // Global nullifier mapping
    mapping(bytes32 => bool) public nullifiers;
    
    // Chain-specific nullifier tracking
    mapping(uint32 => uint256) public chainNullifierCount;
    mapping(uint32 => mapping(bytes32 => bool)) public chainNullifiers;
    
    // Events
    event NullifierBurned(bytes32 indexed nullifier, uint32 indexed chainId, address indexed user);
    event SpokeRegistered(uint32 indexed chainId, address indexed spokeContract);
    event SpokeRemoved(uint32 indexed chainId, address indexed spokeContract);
    
    constructor(address admin) {
        _grantRole(ADMIN_ROLE, admin);
    }
    
    /**
     * @notice Register a spoke chain contract
     */
    function registerSpoke(uint32 chainId, address spokeContract) external onlyRole(ADMIN_ROLE) {
        _grantRole(SPOKE_ROLE, spokeContract);
        emit SpokeRegistered(chainId, spokeContract);
    }
    
    /**
     * @notice Remove a spoke chain contract
     */
    function removeSpoke(uint32 chainId, address spokeContract) external onlyRole(ADMIN_ROLE) {
        _revokeRole(SPOKE_ROLE, spokeContract);
        emit SpokeRemoved(chainId, spokeContract);
    }
    
    /**
     * @notice Burn a nullifier (called by spoke chains)
     * @param nullifier The nullifier to burn
     * @param chainId The chain ID where the claim originated
     * @param user The user who claimed
     */
    function burnNullifier(
        bytes32 nullifier,
        uint32 chainId,
        address user
    ) external onlyRole(SPOKE_ROLE) nonReentrant {
        require(!nullifiers[nullifier], "Nullifier already burned");
        require(!chainNullifiers[chainId][nullifier], "Chain nullifier already burned");
        
        // Mark as burned globally and per-chain
        nullifiers[nullifier] = true;
        chainNullifiers[chainId][nullifier] = true;
        chainNullifierCount[chainId]++;
        
        emit NullifierBurned(nullifier, chainId, user);
    }
    
    /**
     * @notice Check if a nullifier has been burned
     */
    function isNullifierBurned(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }
    
    /**
     * @notice Check if a chain-specific nullifier has been burned
     */
    function isChainNullifierBurned(bytes32 nullifier, uint32 chainId) external view returns (bool) {
        return chainNullifiers[chainId][nullifier];
    }
    
    /**
     * @notice Get nullifier count for a specific chain
     */
    function getChainNullifierCount(uint32 chainId) external view returns (uint256) {
        return chainNullifierCount[chainId];
    }
    
    /**
     * @notice Generate nullifier hash
     * @param user The user address
     * @param rootId The Merkle root ID
     * @param chainId The chain ID
     */
    function generateNullifier(
        address user,
        uint256 rootId,
        uint32 chainId
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(user, rootId, chainId));
    }
}
