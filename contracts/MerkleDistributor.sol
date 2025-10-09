// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MerkleDistributor
 * @notice Production Merkle distributor for Myntis rewards
 * @dev Fixed balance exhaustion and CEI pattern issues
 */
contract MerkleDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");

    IERC20 public immutable token;
    
    // Provider balances and locked amounts
    mapping(address => uint256) public providerBalance;
    mapping(address => uint256) public lockedBalance;
    
    // Epoch management
    struct EpochMerkleRoot {
        bytes32 root;
        uint256 expiry;
        bool closed;
        uint256 totalClaimable;
        uint256 claimedAmount;
    }
    
    mapping(address => EpochMerkleRoot[]) public providerMerkleRoots;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;
    
    // Constants
    uint256 public constant MIN_EXPIRY_DURATION = 1 days;
    uint256 public constant EPOCH_GRACE_PERIOD = 2 days; // 48 hours grace period
    
    // Events
    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);
    event MerkleRootSubmitted(address indexed provider, uint256 rootIndex, bytes32 root, uint256 expiry, uint256 totalClaimable);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 amount);
    event EpochClosed(address indexed provider, uint256 rootIndex);
    event ProviderSlashed(address indexed provider, uint256 amount);

    constructor(address _token, address _admin) {
        token = IERC20(_token);
        _grantRole(ADMIN_ROLE, _admin);
    }

    /**
     * @notice Add balance for a provider
     */
    function addProviderBalance(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    /**
     * @notice Submit Merkle root for an epoch
     * @dev Fixed: Prevents balance exhaustion by locking funds
     */
    function submitMerkleRoot(
        bytes32 root,
        uint256 expiry,
        uint256 totalClaimableAmount
    ) external nonReentrant {
        require(providerBalance[msg.sender] >= totalClaimableAmount, "Insufficient balance for claims");
        require(expiry > block.timestamp + MIN_EXPIRY_DURATION, "expiry too soon");
        require(totalClaimableAmount > 0, "zero claimable");

        // Lock the balance for this epoch
        providerBalance[msg.sender] -= totalClaimableAmount;
        lockedBalance[msg.sender] += totalClaimableAmount;

        providerMerkleRoots[msg.sender].push(EpochMerkleRoot({
            root: root,
            expiry: expiry,
            closed: false,
            totalClaimable: totalClaimableAmount,
            claimedAmount: 0
        }));
        
        emit MerkleRootSubmitted(msg.sender, providerMerkleRoots[msg.sender].length - 1, root, expiry, totalClaimableAmount);
    }

    /**
     * @notice Claim rewards using Merkle proof
     * @dev Fixed: CEI pattern and balance exhaustion protection
     */
    function claim(
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(provider != address(0), "invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(amount > 0, "zero amount");
        require(!claimed[provider][rootIndex][msg.sender], "already claimed");

        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(block.timestamp <= e.expiry + EPOCH_GRACE_PERIOD, "expired or grace period passed");
        require(!e.closed, "epoch closed");

        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");

        // Ensure enough locked balance for this specific epoch
        require(e.totalClaimable >= e.claimedAmount + amount, "epoch balance exhausted");

        // Update state AFTER checks and BEFORE transfer (CEI pattern)
        claimed[provider][rootIndex][msg.sender] = true;
        e.claimedAmount += amount; // Track claimed amount for this epoch

        token.safeTransfer(msg.sender, amount); // Actual token transfer
        emit RewardsClaimed(msg.sender, provider, rootIndex, amount);
    }

    /**
     * @notice Batch claim rewards
     */
    function batchClaim(
        address[] calldata providers,
        uint256[] calldata rootIndices,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external nonReentrant {
        require(
            providers.length == rootIndices.length &&
            rootIndices.length == amounts.length &&
            amounts.length == proofs.length,
            "Arrays length mismatch"
        );

        for (uint256 i = 0; i < providers.length; i++) {
            this.claim(providers[i], rootIndices[i], amounts[i], proofs[i]);
        }
    }

    /**
     * @notice Close an epoch and return unclaimed funds
     * @dev Fixed: Only close after grace period
     */
    function closeEpoch(address provider, uint256 rootIndex) external onlyRole(ADMIN_ROLE) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(!e.closed, "already closed");
        require(block.timestamp > e.expiry + EPOCH_GRACE_PERIOD, "grace period not over");
        
        e.closed = true;

        // Return any unclaimed balance to the provider
        if (e.totalClaimable > e.claimedAmount) {
            uint256 unclaimed = e.totalClaimable - e.claimedAmount;
            lockedBalance[provider] -= unclaimed;
            providerBalance[provider] += unclaimed; // Return to general balance
            emit ProviderBalanceUpdated(provider, providerBalance[provider]);
        }
        
        emit EpochClosed(provider, rootIndex);
    }

    /**
     * @notice Slash a provider's balance
     */
    function slashProvider(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount <= providerBalance[provider], "insufficient balance");
        providerBalance[provider] -= amount;
        emit ProviderSlashed(provider, amount);
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
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
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        return (e.root, e.expiry, e.closed, e.totalClaimable, e.claimedAmount);
    }

    /**
     * @notice Check if user has claimed from specific epoch
     */
    function hasClaimed(address provider, uint256 rootIndex, address user) external view returns (bool) {
        return claimed[provider][rootIndex][user];
    }

    /**
     * @notice Notify reward (called by StakingContract)
     */
    function notifyReward(address provider, uint256 amount) external {
        // This function is called by StakingContract when rewards are harvested
        // The rewards are already transferred to this contract
        // We just need to add them to the provider's balance
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
}