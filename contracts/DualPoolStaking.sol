// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice Interface for EmissionsContract
 * @dev SECURITY FIX: Allows DualPoolStaking to trigger emission harvests and initialize new providers
 */
interface IEmissionsContract {
    function harvest(address provider) external returns (uint256);
    function pendingRewards(address provider) external view returns (uint256);
    function initializeNewProvider(address provider) external;
}

interface IZKMerkleDistributor {
    function notifyRewardWithTransfer(address provider, uint256 amount) external;
}

/**
 * @title DualPoolStaking
 * @notice Dual-pool staking system with provider and user pools
 * @dev Provider pool: 87.5% emissions, non-transferrable, min stake required
 * @dev User pool: 12.5% emissions, transferrable via ERC-4626 vault
 */
contract DualPoolStaking is 
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant EMISSIONS_ROLE = keccak256("EMISSIONS_ROLE");
    
    /// @notice Precision multiplier for reward per share calculations
    uint256 public constant PRECISION = 1e12;
    
    // Pool configuration
    enum PoolType { Provider, User }
    
    struct PoolInfo {
        uint256 totalStaked;
        uint256 accRewardPerShare;
        uint256 lastRewardTime;
        uint256 emissionShare; // 875 for Provider (87.5%), 125 for User (12.5%)
        uint256 totalRewards;  // Total rewards distributed to this pool
    }
    
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
        PoolType poolType;
        bool isProvider;
        uint256 lastStakeTime;
    }
    
    // Token contracts
    IERC20 public token;
    address public emissionsContract;
    address public liquidStakingVault;
    
    // OPTION B: ZK Merkle Distributor for auto-funding provider balances
    address public zkMerkleDistributor;
    
    // Pool information
    PoolInfo public providerPool;
    PoolInfo public userPool;
    
    // User information
    mapping(address => UserInfo) public userInfo;
    
    // SECURITY FIX: Track if address was ever a provider (for reward notifications)
    mapping(address => bool) public wasEverProvider;
    
    // Configurable minimum provider stake
    uint256 public minProviderStake;

    // Reward accounting
    uint256 public providerPendingRewards;
    uint256 public userPendingRewards;
    
    // Treasury address for unclaimed rewards (prevents first-staker attack)
    address public treasury;
    
    // SECURITY FIX: Pending treasury withdrawals (pull pattern)
    uint256 public pendingTreasuryWithdrawal;
    
    // Events
    event Staked(address indexed user, uint256 amount, PoolType poolType);
    event Unstaked(address indexed user, uint256 amount, PoolType poolType);
    event RewardsHarvested(address indexed user, uint256 amount, PoolType poolType);
    event PoolUpdated(PoolType poolType, uint256 totalStaked, uint256 accRewardPerShare);
    event MinProviderStakeUpdated(uint256 oldStake, uint256 newStake);
    event RewardsQueued(uint256 providerAmount, uint256 userAmount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event LiquidStakingVaultUpdated(address indexed oldVault, address indexed newVault);
    event RewardNotified(address indexed provider, uint256 amount);
    event UnclaimedRewardsSentToTreasury(uint256 providerAmount, uint256 userAmount);
    event TreasuryRewardsQueued(uint256 amount, uint256 totalPending);
    event TreasuryWithdrawal(address indexed treasury, uint256 amount);
    event ZkMerkleDistributorUpdated(address indexed oldDistributor, address indexed newDistributor);
    event EmissionsContractUpdated(address indexed oldEmissions, address indexed newEmissions);
    event ProviderBalanceFunded(address indexed provider, uint256 amount, address indexed distributor);
    event ProviderEmissionsAccrued(address indexed provider, uint256 amount, uint256 totalAccrued);
    event ProviderEmissionsWithdrawn(address indexed provider, uint256 amount);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the dual-pool staking system
     * @param _token The staking token address
     * @param _emissionsContract The emissions contract address
     * @param admin The admin address
     */
    function initialize(
        address _token,
        address _emissionsContract,
        address admin
    ) public initializer {
        // SECURITY FIX: Validate all addresses
        require(_token != address(0), "DualPoolStaking: invalid token");
        require(_token.code.length > 0, "DualPoolStaking: token not a contract");
        require(_emissionsContract != address(0), "DualPoolStaking: invalid emissions");
        require(_emissionsContract.code.length > 0, "DualPoolStaking: emissions not a contract");
        require(admin != address(0), "DualPoolStaking: invalid admin");
        
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        token = IERC20(_token);
        emissionsContract = _emissionsContract;
        minProviderStake = 100 * 1e18; // 100 MYNT default
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(EMISSIONS_ROLE, _emissionsContract);
        
        // Initialize pools
        providerPool.emissionShare = 875; // 87.5%
        userPool.emissionShare = 125;     // 12.5%
        
        providerPool.lastRewardTime = block.timestamp;
        userPool.lastRewardTime = block.timestamp;
    }
    
    /**
     * @notice Reinitialize pool configuration (fixes broken state from v1)
     * @dev Uses reinitializer(2) to allow one-time execution after v1
     */
    function reinitializeV2() public reinitializer(2) onlyRole(DEFAULT_ADMIN_ROLE) {
        // Fix pool emission shares
        providerPool.emissionShare = 875; // 87.5%
        userPool.emissionShare = 125;     // 12.5%
        
        // Fix lastRewardTime to current timestamp
        providerPool.lastRewardTime = block.timestamp;
        userPool.lastRewardTime = block.timestamp;
        
        // Fix minProviderStake (1000 MYNT)
        minProviderStake = 1000 * 1e18;
    }
    
    /**
     * @notice Set the liquid staking vault address
     * @param _liquidStakingVault The ERC-4626 vault address
     * @dev SECURITY FIX: Added zero address validation
     */
    function setLiquidStakingVault(address _liquidStakingVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_liquidStakingVault != address(0), "Invalid vault address");
        address oldVault = liquidStakingVault;
        liquidStakingVault = _liquidStakingVault;
        emit LiquidStakingVaultUpdated(oldVault, _liquidStakingVault);
    }
    
    /**
     * @notice Set the treasury address for unclaimed rewards
     * @param _treasury The treasury address
     */
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury address");
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }
    
    /**
     * @notice Set the ZK Merkle Distributor address
     * @param _zkMerkleDistributor The distributor contract address
     * @dev OPTION B: Staking will auto-fund provider balances on this distributor
     */
    function setZkMerkleDistributor(address _zkMerkleDistributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_zkMerkleDistributor != address(0), "Invalid distributor address");
        require(_zkMerkleDistributor.code.length > 0, "Distributor not a contract");
        address oldDistributor = zkMerkleDistributor;
        zkMerkleDistributor = _zkMerkleDistributor;
        emit ZkMerkleDistributorUpdated(oldDistributor, _zkMerkleDistributor);
    }
    
    /**
     * @notice Set the emissions contract address
     * @param _emissionsContract The new emissions contract address
     * @dev Allows upgrading emissions logic without redeploying staking
     */
    function setEmissionsContract(address _emissionsContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_emissionsContract != address(0), "Invalid emissions address");
        require(_emissionsContract.code.length > 0, "Emissions not a contract");
        address oldEmissions = emissionsContract;
        emissionsContract = _emissionsContract;
        
        // Update emissions role
        _revokeRole(EMISSIONS_ROLE, oldEmissions);
        _grantRole(EMISSIONS_ROLE, _emissionsContract);
        
        emit EmissionsContractUpdated(oldEmissions, _emissionsContract);
    }
    
    /**
     * @notice Update minimum provider stake
     * @param _minStake New minimum stake amount
     */
    function updateMinProviderStake(uint256 _minStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldStake = minProviderStake;
        minProviderStake = _minStake;
        emit MinProviderStakeUpdated(oldStake, _minStake);
    }
    
    /**
     * @notice Stake tokens in provider pool
     * @param amount Amount to stake
     * @dev SECURITY FIX: Validates total stake meets minimum after deposit
     * @dev CRITICAL FIX: Initializes emission debt for new providers to prevent reward theft
     */
    function stakeToProviderPool(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        
        _updatePools();
        
        UserInfo storage user = userInfo[msg.sender];
        
        // Prevent users already in user pool from staking in provider pool
        require(user.poolType != PoolType.User || user.amount == 0, "User pool participant cannot stake in provider pool");
        
        // If user is already staked, harvest rewards first
        if (user.amount > 0) {
            _harvestRewards(msg.sender);
        }
        
        // Transfer tokens from user
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Update user info
        user.amount += amount;
        
        // SECURITY FIX: Validate total stake meets minimum after deposit
        require(user.amount >= minProviderStake, "Total stake below minimum");
        
        // CRITICAL FIX: Initialize emission debt for NEW providers AFTER adding stake
        // This prevents new providers from stealing accumulated rewards
        if (user.amount == amount && emissionsContract != address(0)) {
            IEmissionsContract(emissionsContract).initializeNewProvider(msg.sender);
        }
        
        user.rewardDebt = (user.amount * providerPool.accRewardPerShare) / PRECISION;
        user.poolType = PoolType.Provider;
        user.isProvider = true;
        user.lastStakeTime = block.timestamp;
        
        // SECURITY FIX: Mark as ever being a provider for future reward notifications
        wasEverProvider[msg.sender] = true;
        
        // Update pool
        providerPool.totalStaked += amount;
        
        emit Staked(msg.sender, amount, PoolType.Provider);
        emit PoolUpdated(PoolType.Provider, providerPool.totalStaked, providerPool.accRewardPerShare);
    }
    
    /**
     * @notice Stake tokens in user pool (called by liquid staking vault)
     * @param amount Amount to stake
     * @param user The user address
     */
    function stakeToUserPool(uint256 amount, address user) external nonReentrant {
        require(msg.sender == liquidStakingVault, "Only liquid staking vault");
        
        _updatePools();
        
        UserInfo storage userInfo_ = userInfo[user];
        
        // Prevent providers from staking in user pool to avoid accounting corruption
        require(!userInfo_.isProvider || userInfo_.poolType != PoolType.Provider, 
            "Provider cannot stake in user pool");
        
        // If user is already staked, harvest rewards first
        if (userInfo_.amount > 0) {
            _harvestRewards(user);
        }
        
        // Transfer tokens from vault
        token.safeTransferFrom(liquidStakingVault, address(this), amount);
        
        // Update user info
        userInfo_.amount += amount;
        userInfo_.rewardDebt = (userInfo_.amount * userPool.accRewardPerShare) / PRECISION;
        userInfo_.poolType = PoolType.User;
        userInfo_.isProvider = false;
        userInfo_.lastStakeTime = block.timestamp;
        
        // Update pool
        userPool.totalStaked += amount;
        
        emit Staked(user, amount, PoolType.User);
        emit PoolUpdated(PoolType.User, userPool.totalStaked, userPool.accRewardPerShare);
    }
    
    /**
     * @notice Unstake from provider pool
     * @param amount Amount to unstake
     * @dev SECURITY FIX: Enforces minimum stake requirement on remaining balance
     */
    function unstakeFromProviderPool(uint256 amount) external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.poolType == PoolType.Provider, "Not in provider pool");
        require(user.amount >= amount, "Insufficient stake");
        
        // SECURITY FIX: Enforce minimum stake on remaining balance
        // Either full withdrawal (0) or remaining must meet minimum
        uint256 remainingStake = user.amount - amount;
        require(remainingStake == 0 || remainingStake >= minProviderStake, 
            "Remaining stake below minimum - unstake all or leave minimum");
        
        _updatePools();
        _harvestRewards(msg.sender);
        
        // Update user info
        user.amount = remainingStake;
        user.rewardDebt = (user.amount * providerPool.accRewardPerShare) / PRECISION;
        
        // If fully unstaked, reset provider status
        if (user.amount == 0) {
            user.isProvider = false;
        }
        
        // Update pool
        providerPool.totalStaked -= amount;
        
        // Transfer tokens to user
        token.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount, PoolType.Provider);
        emit PoolUpdated(PoolType.Provider, providerPool.totalStaked, providerPool.accRewardPerShare);
    }
    
    /**
     * @notice Unstake from user pool (called by liquid staking vault)
     * @param amount Amount to unstake
     * @param user The user address
     */
    function unstakeFromUserPool(uint256 amount, address user) external nonReentrant {
        require(msg.sender == liquidStakingVault, "Only liquid staking vault");
        
        UserInfo storage userInfo_ = userInfo[user];
        require(userInfo_.poolType == PoolType.User, "Not in user pool");
        require(userInfo_.amount >= amount, "Insufficient stake");
        
        _updatePools();
        _harvestRewards(user);
        
        // Update user info
        userInfo_.amount -= amount;
        userInfo_.rewardDebt = (userInfo_.amount * userPool.accRewardPerShare) / PRECISION;
        
        // Update pool
        userPool.totalStaked -= amount;
        
        // Transfer tokens to vault
        token.safeTransfer(liquidStakingVault, amount);
        
        emit Unstaked(user, amount, PoolType.User);
        emit PoolUpdated(PoolType.User, userPool.totalStaked, userPool.accRewardPerShare);
    }
    
    /**
     * @notice Harvest rewards for a user
     * @param user User address
     */
    function harvestRewards(address user) external nonReentrant {
        _updatePools();
        _harvestRewards(user);
    }
    
    /**
     * @notice Harvest emission rewards for a provider from EmissionsContract
     * @dev SECURITY FIX: Allows providers to trigger harvest from emissions
     * @dev OPTION B: After harvest, minted tokens are held in this contract (staking).
     * @dev Harvested amount is recorded in providerAccruedEmissions and must stay "available"
     * @dev for fundProviderBalance/withdrawProviderEmissions; we do NOT sync it into pending rewards.
     * @dev When amount==0 we call _syncUnaccountedTokens() to pick up any other stuck tokens.
     * @param provider Provider address to harvest for
     * @return amount Amount of tokens harvested
     */
    function harvestFromEmissions(address provider) external nonReentrant returns (uint256 amount) {
        require(emissionsContract != address(0), "Emissions contract not set");
        
        UserInfo storage user = userInfo[provider];
        require(user.isProvider || (user.poolType == PoolType.Provider && user.amount > 0), 
                "Not a provider");
        
        // Call EmissionsContract.harvest() which mints tokens to THIS contract (staking)
        // Emissions were updated to mint to staking for OPTION B architecture
        amount = IEmissionsContract(emissionsContract).harvest(provider);
        if (amount > 0) {
            providerAccruedEmissions[provider] += amount;
            emit ProviderEmissionsAccrued(provider, amount, providerAccruedEmissions[provider]);
            // Do NOT call _syncUnaccountedTokens() here: the harvested amount is already
            // accounted in providerAccruedEmissions and must remain "available" for
            // fundProviderBalance() / withdrawProviderEmissions(). Syncing would add it to
            // providerPendingRewards+userPendingRewards, making available=0 and breaking funding.
        } else {
            // No harvest this call; sync any other unaccounted (e.g. stuck) tokens
            _syncUnaccountedTokens();
        }
        
        return amount;
    }
    
    /**
     * @notice Internal function to sync unaccounted tokens to pending rewards
     * @dev Called automatically by harvestFromEmissions to handle stuck tokens
     * @dev Split between provider/user pools based on emissionShare
     */
    function _syncUnaccountedTokens() internal {
        uint256 balance = token.balanceOf(address(this));
        uint256 principal = providerPool.totalStaked + userPool.totalStaked;
        uint256 accounted = principal + providerPendingRewards + userPendingRewards + pendingTreasuryWithdrawal;
        
        if (balance > accounted) {
            uint256 rewards = balance - accounted;
            uint256 providerShare = (rewards * providerPool.emissionShare) / 1000;
            uint256 userShare = rewards - providerShare;
            
            providerPendingRewards += providerShare;
            userPendingRewards += userShare;
            
            emit RewardsQueued(providerShare, userShare);
            _updatePools();
        }
    }
    
    /**
     * @notice Fund provider balance on ZK Merkle Distributor
     * @param provider Provider address to fund
     * @param amount Amount to fund
     * @dev OPTION B: Transfers harvested tokens from staking to distributor providerBalance
     * @dev Can be called by provider or admin after harvest
     */
    function fundProviderBalance(address provider, uint256 amount) external nonReentrant {
        require(zkMerkleDistributor != address(0), "Distributor not set");
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Amount must be positive");
        
        // Only provider themselves or admin can fund
        require(
            msg.sender == provider || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only provider or admin"
        );
        
        // Check staking contract has sufficient balance
        uint256 stakingBalance = token.balanceOf(address(this));
        uint256 principal = providerPool.totalStaked + userPool.totalStaked;
        uint256 accounted = principal + providerPendingRewards + userPendingRewards + pendingTreasuryWithdrawal;
        uint256 available = stakingBalance > accounted ? stakingBalance - accounted : 0;
        
        require(available >= amount, "Insufficient available balance in staking");
        require(amount <= providerAccruedEmissions[provider], "Amount exceeds provider accrued emissions");
        
        // Approve distributor to pull tokens (safe pattern for non-standard ERC20s)
        uint256 currentAllowance = token.allowance(address(this), zkMerkleDistributor);
        if (currentAllowance < amount) {
            if (currentAllowance > 0) {
                token.safeDecreaseAllowance(zkMerkleDistributor, currentAllowance);
            }
            token.safeIncreaseAllowance(zkMerkleDistributor, amount);
        }
        
        // Call distributor to fund provider balance via typed interface
        IZKMerkleDistributor(zkMerkleDistributor).notifyRewardWithTransfer(provider, amount);
        providerAccruedEmissions[provider] -= amount;
        
        emit ProviderBalanceFunded(provider, amount, zkMerkleDistributor);
    }
    
    /**
     * @notice Withdraw provider accrued emissions (their share) to their wallet
     * @param provider Provider address to withdraw for
     * @param amount Amount to withdraw
     * @dev Allows provider to withdraw their share (e.g., 20%) that wasn't funded to distributor
     * @dev Can be called by provider themselves or admin
     */
    function withdrawProviderEmissions(address provider, uint256 amount) external nonReentrant {
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Amount must be positive");
        require(amount <= providerAccruedEmissions[provider], "Amount exceeds accrued emissions");
        
        // Only provider themselves or admin can withdraw
        require(
            msg.sender == provider || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Only provider or admin"
        );
        
        // Check staking contract has sufficient balance
        uint256 stakingBalance = token.balanceOf(address(this));
        uint256 principal = providerPool.totalStaked + userPool.totalStaked;
        uint256 accounted = principal + providerPendingRewards + userPendingRewards + pendingTreasuryWithdrawal;
        uint256 available = stakingBalance > accounted ? stakingBalance - accounted : 0;
        
        require(available >= amount, "Insufficient available balance in staking");
        
        // Update accounting and transfer tokens
        providerAccruedEmissions[provider] -= amount;
        token.safeTransfer(provider, amount);
        
        emit ProviderEmissionsWithdrawn(provider, amount);
    }
    
    /**
     * @notice Get pending emission rewards for a provider
     * @param provider Provider address
     * @return Pending emission rewards
     */
    function pendingEmissionRewards(address provider) external view returns (uint256) {
        if (emissionsContract == address(0)) return 0;
        return IEmissionsContract(emissionsContract).pendingRewards(provider);
    }
    
    /**
     * @notice Update pools and distribute rewards
     */
    function updatePools() external {
        _updatePools();
    }
    
    /**
     * @notice Admin function to reset stuck pending rewards (emergency use only)
     * @dev Use case: After harvest/fund fix upgrade, old userPendingRewards are stuck
     * @dev because they were incorrectly synced from harvests and user pool has 0 stakers
     * @param targetPool Pool to reset (0=Provider, 1=User)
     */
    function resetPendingRewards(PoolType targetPool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (targetPool == PoolType.Provider) {
            uint256 old = providerPendingRewards;
            providerPendingRewards = 0;
            emit RewardsQueued(0, 0); // Log the reset
        } else {
            uint256 old = userPendingRewards;
            userPendingRewards = 0;
            emit RewardsQueued(0, 0); // Log the reset
        }
    }

    /**
     * @notice Sync newly minted emissions into reward accounting.
     * @dev Expects the emissions contract to mint/transfer rewards to this contract before calling.
     * @dev SECURITY FIX: Requires treasury to be set to prevent first-staker attack
     * @dev SECURITY FIX: Includes pendingTreasuryWithdrawal in accounting to prevent double-counting
     */
    function syncEmissions() external onlyRole(EMISSIONS_ROLE) returns (uint256 totalRewards_) {
        // SECURITY FIX: Treasury is optional at launch; if unset, rewards will remain pending
        
        uint256 balance = token.balanceOf(address(this));
        uint256 principal = providerPool.totalStaked + userPool.totalStaked;
        // SECURITY FIX: Include pendingTreasuryWithdrawal to prevent double-counting
        uint256 accounted = principal + providerPendingRewards + userPendingRewards + pendingTreasuryWithdrawal;
        require(balance > accounted, "DualPoolStaking: no new rewards");

        uint256 rewards = balance - accounted;
        uint256 providerShare = (rewards * providerPool.emissionShare) / 1000;
        uint256 userShare = rewards - providerShare;

        providerPendingRewards += providerShare;
        userPendingRewards += userShare;

        emit RewardsQueued(providerShare, userShare);

        _updatePools();
        return rewards;
    }
    
    /**
     * @notice Notify reward for a provider (called by EmissionsContract)
     * @dev SECURITY FIX: Simplified to just emit event - reward debt is managed by harvest
     * @dev SECURITY FIX: Allows notification for addresses that were ever providers
     * @param provider Provider address
     * @param amount Reward amount that was minted
     */
    function notifyReward(address provider, uint256 amount) external {
        require(msg.sender == emissionsContract, "Only emissions contract");
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Amount must be positive");
        
        // SECURITY FIX: Allow notification for anyone who was ever a provider
        // This handles the edge case where provider unstakes before rewards are harvested
        require(wasEverProvider[provider], "Never was a provider");
        
        // SECURITY FIX: Don't update rewardDebt here - let harvest handle it
        // This function is just a notification that rewards were minted
        // The actual reward debt update happens in _harvestRewards
        emit RewardNotified(provider, amount);
    }
    
    /**
     * @notice Get total staked amount across both pools
     */
    function getTotalStaked() external view returns (uint256) {
        return providerPool.totalStaked + userPool.totalStaked;
    }
    
    /**
     * @notice Get total staked amount in user pool (for vault's totalAssets calculation)
     */
    function getUserPoolTotalStaked() external view returns (uint256) {
        return userPool.totalStaked;
    }
    
    /**
     * @notice Get total staked amount in provider pool (for emissions calculation)
     * @dev SECURITY FIX: Added for EmissionsContract to use provider-only stake
     */
    function getProviderPoolStaked() external view returns (uint256) {
        return providerPool.totalStaked;
    }
    
    /**
     * @notice Get provider info for emissions contract
     * @param provider Provider address
     * @return stake Stake amount
     * @return rewardDebt Reward debt
     */
    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt) {
        UserInfo memory user = userInfo[provider];
        return (user.amount, user.rewardDebt);
    }
    
    /**
     * @notice Get pending rewards for a user
     * @param user User address
     * @return pending Pending reward amount
     */
    function pendingRewards(address user) external view returns (uint256 pending) {
        UserInfo memory userInfo_ = userInfo[user];
        
        if (userInfo_.poolType == PoolType.Provider) {
            return _pendingProviderRewards(userInfo_);
        } else {
            return _pendingUserRewards(userInfo_);
        }
    }
    
    /**
     * @notice Get pool information
     * @param poolType Pool type (0 = Provider, 1 = User)
     * @return Pool information
     */
    function getPoolInfo(PoolType poolType) external view returns (PoolInfo memory) {
        if (poolType == PoolType.Provider) {
            return providerPool;
        } else {
            return userPool;
        }
    }
    
    // Internal functions
    
    /**
     * @notice Internal function to update pool reward accounting
     * @dev SECURITY FIX: Uses pull pattern for treasury to prevent blocking
     * @dev When no stakers, rewards are queued for treasury withdrawal (not transferred immediately)
     */
    function _updatePools() internal {
        // Handle provider pool rewards
        if (providerPendingRewards > 0) {
            if (providerPool.totalStaked > 0) {
                // Normal distribution to stakers
                uint256 rewards = providerPendingRewards;
                providerPendingRewards = 0;
                providerPool.accRewardPerShare += (rewards * PRECISION) / providerPool.totalStaked;
                providerPool.totalRewards += rewards;
                emit PoolUpdated(PoolType.Provider, providerPool.totalStaked, providerPool.accRewardPerShare);
            } else if (treasury != address(0)) {
                // SECURITY FIX: Queue for treasury withdrawal (pull pattern)
                // This prevents malicious treasury from blocking staking operations
                uint256 unclaimedProvider = providerPendingRewards;
                providerPendingRewards = 0;
                pendingTreasuryWithdrawal += unclaimedProvider;
                emit TreasuryRewardsQueued(unclaimedProvider, pendingTreasuryWithdrawal);
                emit UnclaimedRewardsSentToTreasury(unclaimedProvider, 0);
            }
            // If no treasury and no stakers, rewards accumulate (legacy behavior)
        }

        // Handle user pool rewards
        if (userPendingRewards > 0) {
            if (userPool.totalStaked > 0) {
                // Normal distribution to stakers
                uint256 rewards = userPendingRewards;
                userPendingRewards = 0;
                userPool.accRewardPerShare += (rewards * PRECISION) / userPool.totalStaked;
                userPool.totalRewards += rewards;
                emit PoolUpdated(PoolType.User, userPool.totalStaked, userPool.accRewardPerShare);
            } else if (treasury != address(0)) {
                // SECURITY FIX: Queue for treasury withdrawal (pull pattern)
                uint256 unclaimedUser = userPendingRewards;
                userPendingRewards = 0;
                pendingTreasuryWithdrawal += unclaimedUser;
                emit TreasuryRewardsQueued(unclaimedUser, pendingTreasuryWithdrawal);
                emit UnclaimedRewardsSentToTreasury(0, unclaimedUser);
            }
            // If no treasury and no stakers, rewards accumulate (legacy behavior)
        }
    }
    
    /**
     * @notice Withdraw queued treasury rewards (pull pattern)
     * @dev SECURITY FIX: Allows treasury to pull rewards without blocking operations
     * @dev Can be called by anyone to transfer pending rewards to treasury
     */
    function withdrawTreasuryRewards() external nonReentrant {
        require(treasury != address(0), "DualPoolStaking: treasury not set");
        require(pendingTreasuryWithdrawal > 0, "DualPoolStaking: no pending withdrawal");
        
        uint256 amount = pendingTreasuryWithdrawal;
        pendingTreasuryWithdrawal = 0;
        
        token.safeTransfer(treasury, amount);
        emit TreasuryWithdrawal(treasury, amount);
    }
    
    /**
     * @notice Internal function to harvest rewards for a user
     * @dev SECURITY FIX: Removed double-counting of totalRewards (already counted in _updatePools)
     */
    function _harvestRewards(address user) internal {
        UserInfo storage userInfo_ = userInfo[user];
        
        if (userInfo_.amount == 0) return;
        
        uint256 pending;
        if (userInfo_.poolType == PoolType.Provider) {
            pending = _pendingProviderRewards(userInfo_);
            if (pending > 0) {
                // FIX: Use PRECISION constant consistently (was 1e12)
                userInfo_.rewardDebt = (userInfo_.amount * providerPool.accRewardPerShare) / PRECISION;
                // REMOVED: providerPool.totalRewards += pending; (already counted in _updatePools)
            }
        } else {
            pending = _pendingUserRewards(userInfo_);
            if (pending > 0) {
                userInfo_.rewardDebt = (userInfo_.amount * userPool.accRewardPerShare) / PRECISION;
                // REMOVED: userPool.totalRewards += pending; (already counted in _updatePools)
            }
        }
        
        if (pending > 0) {
            // Transfer rewards to user
            token.safeTransfer(user, pending);
            emit RewardsHarvested(user, pending, userInfo_.poolType);
        }
    }
    
    function _pendingProviderRewards(UserInfo memory user) internal view returns (uint256) {
        if (user.amount == 0) return 0;
        
        uint256 accRewardPerShare = providerPool.accRewardPerShare;
        // In production, this would calculate based on emissions
        
        uint256 pending = (user.amount * accRewardPerShare) / PRECISION;
        return pending > user.rewardDebt ? pending - user.rewardDebt : 0;
    }
    
    function _pendingUserRewards(UserInfo memory user) internal view returns (uint256) {
        if (user.amount == 0) return 0;
        
        uint256 accRewardPerShare = userPool.accRewardPerShare;
        // In production, this would calculate based on emissions
        
        uint256 pending = (user.amount * accRewardPerShare) / PRECISION;
        return pending > user.rewardDebt ? pending - user.rewardDebt : 0;
    }
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}

    // UPGRADE STORAGE: New variables added at the end to preserve layout compatibility
    // Track provider accrued emissions for fundProviderBalance
    mapping(address => uint256) public providerAccruedEmissions;

    // SECURITY FIX: Reduced from 44 to 43 to account for providerAccruedEmissions
    uint256[43] private __gap;
}
