// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title IBurnableToken
 * @notice Interface for tokens that support burning
 */
interface IBurnableToken is IERC20 {
    function burn(uint256 amount) external;
}

/**
 * @title MerkleDistributor
 * @notice Production Merkle distributor for Myntis rewards
 * @dev Fixed balance exhaustion and CEI pattern issues
 */
contract MerkleDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IBurnableToken;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");

    // Token contract (must support burning for Option B architecture)
    IBurnableToken public immutable token;
    
    // Provider balances and locked amounts
    // NOTE: In Option B, these are accounting-only - actual tokens are burned on deposit
    mapping(address => uint256) public providerBalance;
    mapping(address => uint256) public lockedBalance;
    address public stakingContract;
    
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
    uint256 public constant CLOSE_DELAY = 1 hours; // SECURITY FIX: Delay after grace period before closing
    uint256 public constant MAX_BATCH_SIZE = 20; // SECURITY FIX: Prevent gas griefing
    
    // Events
    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);
    event MerkleRootSubmitted(address indexed provider, uint256 rootIndex, bytes32 root, uint256 expiry, uint256 totalClaimable);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 amount);
    event EpochClosed(address indexed provider, uint256 rootIndex);
    event ProviderSlashed(address indexed provider, uint256 amount);
    event StakingContractUpdated(address indexed stakingContract);
    event LockedBalanceUpdated(address indexed provider, uint256 newLockedBalance);

    constructor(address _token, address _admin) {
        token = IBurnableToken(_token);
        _grantRole(ADMIN_ROLE, _admin);
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
     * @notice Add balance for a provider (Option B: burns tokens to reserve supply for spoke mints)
     * @param provider Provider address
     * @param amount Amount to add
     * @dev OPTION B ARCHITECTURE:
     *      - Tokens are burned on hub to reserve supply for spoke mints
     *      - providerBalance is accounting only - actual tokens are burned
     *      - When user claims on spoke, SpokeDistributor mints fresh tokens
     *      - GlobalSupplyRegistry tracks total supply across chains
     */
    function addProviderBalance(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "zero amount");
        require(provider != address(0), "invalid provider");
        
        // Transfer tokens from sender to this contract
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // OPTION B: Burn tokens to reserve supply for spoke mints
        // This ensures tokens don't exist on hub AND spokes simultaneously
        token.burn(amount);
        
        // Update accounting (providerBalance represents claimable amount on spokes)
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
    
    /**
     * @notice Deposit tokens to fund your own provider balance
     * @param amount Amount to deposit
     * @dev Allows providers to deposit their harvested rewards without needing ADMIN_ROLE
     * @dev Provider must approve this contract first, then call depositBalance
     * @dev OPTION B ARCHITECTURE: Tokens are burned on deposit
     */
    function depositBalance(uint256 amount) external onlyRole(PROVIDER_ROLE) {
        require(amount > 0, "zero amount");
        
        // Transfer tokens from provider to this contract
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // OPTION B: Burn tokens to reserve supply for spoke mints
        token.burn(amount);
        
        // Update accounting for the calling provider
        providerBalance[msg.sender] += amount;
        emit ProviderBalanceUpdated(msg.sender, providerBalance[msg.sender]);
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

        // Verify Merkle proof with chainId in leaf
        // This prevents cross-chain double-claims - proof only valid on this chain
        bytes32 leaf = keccak256(abi.encode(claimant, amount, block.chainid));
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
     * @dev SECURITY FIX: Limited to MAX_BATCH_SIZE to prevent gas griefing
     */
    function batchClaim(
        address[] calldata providers,
        uint256[] calldata rootIndices,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external nonReentrant {
        // SECURITY FIX: Limit batch size to prevent gas griefing
        require(providers.length <= MAX_BATCH_SIZE, "Batch too large");
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
     * @notice Close an epoch - unclaimed tokens are permanently burned
     * @param provider Provider address
     * @param rootIndex Merkle root index
     * @dev OPTION B ARCHITECTURE:
     *      - Tokens were burned on addProviderBalance
     *      - Unclaimed tokens are NOT returned - they remain burned permanently
     *      - This incentivizes providers to submit accurate merkle roots
     */
    function closeEpoch(address provider, uint256 rootIndex) external onlyRole(ADMIN_ROLE) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(!e.closed, "already closed");
        require(block.timestamp > e.expiry + EPOCH_GRACE_PERIOD + CLOSE_DELAY, "close delay not over");
        
        e.closed = true;

        // OPTION B: Do NOT return unclaimed tokens - they are permanently burned
        // This is intentional: tokens were burned on deposit, and unclaimed portions
        // are lost. This incentivizes accurate merkle root submissions.
        if (e.totalClaimable > e.claimedAmount) {
            uint256 unclaimed = e.totalClaimable - e.claimedAmount;
            lockedBalance[provider] -= unclaimed;
            // Note: unclaimed tokens remain burned - not returned to providerBalance
            emit LockedBalanceUpdated(provider, lockedBalance[provider]);
        }
        
        emit EpochClosed(provider, rootIndex);
    }

    /**
     * @notice Slash a provider's balance (reduces claimable amount)
     * @param provider Provider address
     * @param amount Amount to slash
     * @dev OPTION B ARCHITECTURE:
     *      - Tokens were already burned on deposit
     *      - Slashing just reduces the provider's claimable accounting balance
     *      - Slashed amount represents tokens that will never be minted on spokes
     */
    function slashProvider(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount <= providerBalance[provider], "insufficient balance");
        
        // OPTION B: Just reduce accounting - tokens were already burned
        // The slashed amount will never be mintable on spokes
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
     * @notice Notify reward with token transfer from staking contract (Option B: burns tokens)
     * @param provider Provider address
     * @param amount Amount to transfer, burn, and add to balance
     * @dev OPTION B ARCHITECTURE:
     *      - Receives tokens from staking contract
     *      - Burns tokens to reserve supply for spoke mints
     *      - Updates accounting balance for provider
     */
    function notifyRewardWithTransfer(address provider, uint256 amount) external {
        require(msg.sender == stakingContract, "unauthorised notifier");
        require(amount > 0, "zero amount");
        require(provider != address(0), "invalid provider");
        
        // Transfer tokens from staking contract
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // OPTION B: Burn tokens to reserve supply for spoke mints
        token.burn(amount);
        
        // Update accounting balance
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
    
    /**
     * @notice Notify reward - DEPRECATED, use notifyRewardWithTransfer
     * @dev WARNING: Only updates accounting, requires tokens to be sent AND burned separately
     * @dev Kept for backwards compatibility but should be avoided
     */
    function notifyReward(address provider, uint256 amount) external {
        require(msg.sender == stakingContract, "unauthorised notifier");
        require(amount > 0, "zero amount");
        
        // WARNING: Only updates accounting - caller must ensure tokens were burned
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
}
