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
    address public stakingContract;
    
    // SECURITY FIX: Recipient for slashed tokens
    address public slashRecipient;
    
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
    event ProviderSlashed(address indexed provider, uint256 amount, address indexed recipient);
    event StakingContractUpdated(address indexed stakingContract);
    event SlashRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event LockedBalanceUpdated(address indexed provider, uint256 newLockedBalance);

    constructor(address _token, address _admin) {
        token = IERC20(_token);
        _grantRole(ADMIN_ROLE, _admin);
        // SECURITY FIX: Set initial slash recipient to admin
        slashRecipient = _admin;
    }

    /**
     * @notice Define the staking contract that can notify rewards.
     */
    function setStakingContract(address staking) external onlyRole(ADMIN_ROLE) {
        require(staking != address(0), "invalid staking");
        stakingContract = staking;
        emit StakingContractUpdated(staking);
    }
    
    /**
     * @notice Set the recipient for slashed tokens
     * @param recipient Address to receive slashed tokens
     * @dev SECURITY FIX: Allows recovery of slashed tokens
     */
    function setSlashRecipient(address recipient) external onlyRole(ADMIN_ROLE) {
        require(recipient != address(0), "invalid recipient");
        address oldRecipient = slashRecipient;
        slashRecipient = recipient;
        emit SlashRecipientUpdated(oldRecipient, recipient);
    }
    
    /**
     * @notice Grant provider role to an address
     * @param provider Address to grant provider role
     */
    function grantProviderRole(address provider) external onlyRole(ADMIN_ROLE) {
        require(provider != address(0), "invalid provider");
        _grantRole(PROVIDER_ROLE, provider);
    }
    
    /**
     * @notice Revoke provider role from an address
     * @param provider Address to revoke provider role from
     */
    function revokeProviderRole(address provider) external onlyRole(ADMIN_ROLE) {
        _revokeRole(PROVIDER_ROLE, provider);
    }

    /**
     * @notice Add balance for a provider
     * @dev Requires actual token transfer to prevent claims without funds
     */
    function addProviderBalance(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "zero amount");
        require(provider != address(0), "invalid provider");
        
        // Require actual token transfer to ensure funds are available
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    /**
     * @notice Submit Merkle root for an epoch
     * @dev SECURITY FIX: Requires PROVIDER_ROLE to submit roots
     * @dev Prevents balance exhaustion by locking funds
     */
    function submitMerkleRoot(
        bytes32 root,
        uint256 expiry,
        uint256 totalClaimableAmount
    ) external nonReentrant onlyRole(PROVIDER_ROLE) {
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
        _claim(msg.sender, provider, rootIndex, amount, merkleProof);
    }

    function _claim(
        address claimant,
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) internal {
        require(provider != address(0), "invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(amount > 0, "zero amount");
        require(!claimed[provider][rootIndex][claimant], "already claimed");

        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(block.timestamp <= e.expiry + EPOCH_GRACE_PERIOD, "expired or grace period passed");
        require(!e.closed, "epoch closed");

        bytes32 leaf = keccak256(abi.encode(claimant, amount));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");

        // Ensure enough locked balance for this specific epoch
        require(e.totalClaimable >= e.claimedAmount + amount, "epoch balance exhausted");

        // Update state AFTER checks and BEFORE transfer (CEI pattern)
        claimed[provider][rootIndex][claimant] = true;
        e.claimedAmount += amount; // Track claimed amount for this epoch
        
        // Update locked balance tracking
        lockedBalance[provider] -= amount;
        emit LockedBalanceUpdated(provider, lockedBalance[provider]);

        token.safeTransfer(claimant, amount); // Actual token transfer
        emit RewardsClaimed(claimant, provider, rootIndex, amount);
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
            _claim(msg.sender, providers[i], rootIndices[i], amounts[i], proofs[i]);
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
     * @dev SECURITY FIX: Transfers slashed tokens to slashRecipient
     */
    function slashProvider(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount <= providerBalance[provider], "insufficient balance");
        require(slashRecipient != address(0), "slash recipient not set");
        
        providerBalance[provider] -= amount;
        
        // SECURITY FIX: Actually transfer slashed tokens to recipient
        token.safeTransfer(slashRecipient, amount);
        
        emit ProviderSlashed(provider, amount, slashRecipient);
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
        require(msg.sender == stakingContract, "unauthorised notifier");
        require(amount > 0, "zero amount");
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
}
