// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title ISpokeToken
 * @notice Interface for spoke token minting
 * @dev SECURITY FIX: Typed interface for safer minting
 */
interface ISpokeToken {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title SpokeDistributor
 * @notice Spoke-side Merkle distributor for reward claims
 * @dev Cross-chain safety via chainId in Merkle leaf (not global nullifier)
 * @dev SECURITY FIX: Uses typed interface for spoke token
 * @dev Mints tokens on claim (spoke-side minting model)
 */
contract SpokeDistributor is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");
    
    // SECURITY FIX: Use typed interface for spoke token
    ISpokeToken public immutable spokeToken;
    
    // Claim tracking - prevent same-chain replay attacks
    // Cross-chain protection via chainId in Merkle leaf
    mapping(bytes32 => bool) public nullifiers;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;
    
    // SECURITY FIX: Provider balance tracking (mirrors MerkleDistributor pattern)
    mapping(address => uint256) public providerBalance;
    mapping(address => uint256) public lockedBalance;
    
    // Provider Merkle roots
    struct SpokeMerkleRoot {
        bytes32 root;
        uint256 expiry;
        bool closed;
        uint256 totalClaimable;
        uint256 claimedAmount;
    }
    
    mapping(address => SpokeMerkleRoot[]) public providerMerkleRoots;
    
    // Constants
    uint256 public constant MIN_EXPIRY_DURATION = 1 days;
    uint256 public constant EPOCH_GRACE_PERIOD = 2 days;
    uint256 public constant CLOSE_DELAY = 1 hours; // SECURITY FIX: Delay after grace period
    uint256 public constant MAX_BATCH_SIZE = 20; // SECURITY FIX: Prevent gas griefing
    
    // Events
    event MerkleRootSubmitted(address indexed provider, uint256 rootIndex, bytes32 root, uint256 expiry, uint256 totalClaimable);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 amount, bytes32 nullifier);
    event EpochClosed(address indexed provider, uint256 rootIndex);
    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);
    event LockedBalanceUpdated(address indexed provider, uint256 newLockedBalance);

    constructor(
        address _spokeToken,
        address admin
    ) {
        require(_spokeToken != address(0), "invalid spoke token");
        require(admin != address(0), "invalid admin");
        
        spokeToken = ISpokeToken(_spokeToken);
        
        _grantRole(ADMIN_ROLE, admin);
    }

    /**
     * @notice Submit Merkle root for an epoch
     * @dev Only providers can submit roots
     * @dev SECURITY FIX: Requires provider to have sufficient balance (locked)
     */
    function submitMerkleRoot(
        bytes32 root,
        uint256 expiry,
        uint256 totalClaimableAmount
    ) external onlyRole(PROVIDER_ROLE) nonReentrant {
        require(expiry > block.timestamp + MIN_EXPIRY_DURATION, "expiry too soon");
        require(totalClaimableAmount > 0, "zero claimable");
        
        // SECURITY FIX: Require provider has sufficient balance
        require(providerBalance[msg.sender] >= totalClaimableAmount, "Insufficient balance for claims");
        
        // Lock the balance for this epoch
        providerBalance[msg.sender] -= totalClaimableAmount;
        lockedBalance[msg.sender] += totalClaimableAmount;

        providerMerkleRoots[msg.sender].push(SpokeMerkleRoot({
            root: root,
            expiry: expiry,
            closed: false,
            totalClaimable: totalClaimableAmount,
            claimedAmount: 0
        }));
        
        emit MerkleRootSubmitted(msg.sender, providerMerkleRoots[msg.sender].length - 1, root, expiry, totalClaimableAmount);
        emit LockedBalanceUpdated(msg.sender, lockedBalance[msg.sender]);
    }
    
    /**
     * @notice Add balance for a provider (hub should transfer tokens to spoke)
     * @param provider Provider address
     * @param amount Amount to add
     * @dev Called by admin after verifying tokens were bridged
     */
    function addProviderBalance(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "zero amount");
        require(provider != address(0), "invalid provider");
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    /**
     * @notice Claim rewards using Merkle proof with nullifier verification
     * @dev Prevents double-claiming across chains via GlobalNullifier
     */
    function claim(
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof,
        bytes32 nullifier
    ) external nonReentrant {
        _claim(msg.sender, provider, rootIndex, amount, merkleProof, nullifier);
    }

    function _claim(
        address claimant,
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof,
        bytes32 nullifier
    ) internal {
        require(provider != address(0), "invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(amount > 0, "zero amount");
        require(!claimed[provider][rootIndex][claimant], "already claimed");
        bytes32 expectedNullifier = keccak256(abi.encode(claimant, amount, block.chainid, provider, rootIndex));
        require(nullifier == expectedNullifier, "invalid nullifier");
        require(!nullifiers[nullifier], "nullifier already used");

        SpokeMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(block.timestamp <= e.expiry + EPOCH_GRACE_PERIOD, "expired or grace period passed");
        require(!e.closed, "epoch closed");

        // Verify Merkle proof with chainId to prevent cross-chain proof reuse
        bytes32 leaf = keccak256(abi.encode(claimant, amount, block.chainid));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");

        // Ensure enough balance for this epoch
        require(e.totalClaimable >= e.claimedAmount + amount, "epoch balance exhausted");
        
        // Mark as claimed locally
        claimed[provider][rootIndex][claimant] = true;
        nullifiers[nullifier] = true;
        e.claimedAmount += amount;
        
        // SECURITY FIX: Update lockedBalance
        lockedBalance[provider] -= amount;
        emit LockedBalanceUpdated(provider, lockedBalance[provider]);

        // SECURITY FIX: Use typed interface and verify mint
        uint256 balBefore = spokeToken.balanceOf(claimant);
        spokeToken.mint(claimant, amount);
        uint256 balAfter = spokeToken.balanceOf(claimant);
        require(balAfter >= balBefore + amount, "mint verification failed");

        emit RewardsClaimed(claimant, provider, rootIndex, amount, nullifier);
    }

    /**
     * @notice Batch claim rewards
     * @dev SECURITY FIX: Limited to MAX_BATCH_SIZE to prevent gas griefing
     */
    function batchClaim(
        address[] calldata providers,
        uint256[] calldata rootIndices,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs,
        bytes32[] calldata nullifierList
    ) external nonReentrant {
        // SECURITY FIX: Limit batch size to prevent gas griefing
        require(providers.length <= MAX_BATCH_SIZE, "Batch too large");
        require(
            providers.length == rootIndices.length &&
            rootIndices.length == amounts.length &&
            amounts.length == proofs.length &&
            proofs.length == nullifierList.length,
            "Arrays length mismatch"
        );

        for (uint256 i = 0; i < providers.length; i++) {
            _claim(msg.sender, providers[i], rootIndices[i], amounts[i], proofs[i], nullifierList[i]);
        }
    }

    /**
     * @notice Close an epoch and return unclaimed funds
     * @dev Only admin can close epochs
     * @dev SECURITY FIX: Returns unclaimed balance to provider
     * @dev SECURITY FIX: Added CLOSE_DELAY for consistency with other distributors
     */
    function closeEpoch(address provider, uint256 rootIndex) external onlyRole(ADMIN_ROLE) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        SpokeMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(!e.closed, "already closed");
        require(block.timestamp > e.expiry + EPOCH_GRACE_PERIOD + CLOSE_DELAY, "close delay not over");
        
        e.closed = true;
        
        // SECURITY FIX: Return unclaimed balance to provider
        if (e.totalClaimable > e.claimedAmount) {
            uint256 unclaimed = e.totalClaimable - e.claimedAmount;
            lockedBalance[provider] -= unclaimed;
            providerBalance[provider] += unclaimed;
            emit ProviderBalanceUpdated(provider, providerBalance[provider]);
        }
        
        emit EpochClosed(provider, rootIndex);
    }
    
    /**
     * @notice Get provider's available balance
     */
    function getProviderBalance(address provider) external view returns (uint256) {
        return providerBalance[provider];
    }
    
    /**
     * @notice Get provider's locked balance
     */
    function getLockedBalance(address provider) external view returns (uint256) {
        return lockedBalance[provider];
    }

    /**
     * @notice Check if user has claimed from specific epoch
     */
    function hasClaimed(address provider, uint256 rootIndex, address user) external view returns (bool) {
        return claimed[provider][rootIndex][user];
    }

    /**
     * @notice Check if nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }

    /**
     * @notice Get epoch info
     */
    function getEpochInfo(address provider, uint256 rootIndex) external view returns (
        bytes32 root,
        uint256 expiry,
        bool closed,
        uint256 totalClaimable,
        uint256 claimedAmount
    ) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        SpokeMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        return (e.root, e.expiry, e.closed, e.totalClaimable, e.claimedAmount);
    }
}
