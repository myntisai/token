// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    
    // Pool information
    PoolInfo public providerPool;
    PoolInfo public userPool;
    
    // User information
    mapping(address => UserInfo) public userInfo;
    
    // Configurable minimum provider stake
    uint256 public minProviderStake;

    // Reward accounting
    uint256 public providerPendingRewards;
    uint256 public userPendingRewards;
    
    // Events
    event Staked(address indexed user, uint256 amount, PoolType poolType);
    event Unstaked(address indexed user, uint256 amount, PoolType poolType);
    event RewardsHarvested(address indexed user, uint256 amount, PoolType poolType);
    event PoolUpdated(PoolType poolType, uint256 totalStaked, uint256 accRewardPerShare);
    event MinProviderStakeUpdated(uint256 oldStake, uint256 newStake);
    event RewardsQueued(uint256 providerAmount, uint256 userAmount);
    
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
     * @notice Set the liquid staking vault address
     * @param _liquidStakingVault The ERC-4626 vault address
     */
    function setLiquidStakingVault(address _liquidStakingVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        liquidStakingVault = _liquidStakingVault;
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
     */
    function stakeToProviderPool(uint256 amount) external nonReentrant {
        require(amount >= minProviderStake, "Below minimum stake");
        
        _updatePools();
        
        UserInfo storage user = userInfo[msg.sender];
        
        // If user is already staked, harvest rewards first
        if (user.amount > 0) {
            _harvestRewards(msg.sender);
        }
        
        // Transfer tokens from user
        token.safeTransferFrom(msg.sender, address(this), amount);
        
        // Update user info
        user.amount += amount;
        user.rewardDebt = (user.amount * providerPool.accRewardPerShare) / 1e12;
        user.poolType = PoolType.Provider;
        user.isProvider = true;
        user.lastStakeTime = block.timestamp;
        
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
        
        // If user is already staked, harvest rewards first
        if (userInfo_.amount > 0) {
            _harvestRewards(user);
        }
        
        // Transfer tokens from vault
        token.safeTransferFrom(liquidStakingVault, address(this), amount);
        
        // Update user info
        userInfo_.amount += amount;
        userInfo_.rewardDebt = (userInfo_.amount * userPool.accRewardPerShare) / 1e12;
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
     */
    function unstakeFromProviderPool(uint256 amount) external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.poolType == PoolType.Provider, "Not in provider pool");
        require(user.amount >= amount, "Insufficient stake");
        
        _updatePools();
        _harvestRewards(msg.sender);
        
        // Update user info
        user.amount -= amount;
        user.rewardDebt = (user.amount * providerPool.accRewardPerShare) / 1e12;
        
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
        userInfo_.rewardDebt = (userInfo_.amount * userPool.accRewardPerShare) / 1e12;
        
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
     * @notice Update pools and distribute rewards
     */
    function updatePools() external {
        _updatePools();
    }

    /**
     * @notice Sync newly minted emissions into reward accounting.
     * @dev Expects the emissions contract to mint/transfer rewards to this contract before calling.
     */
    function syncEmissions() external onlyRole(EMISSIONS_ROLE) returns (uint256 totalRewards_) {
        uint256 balance = token.balanceOf(address(this));
        uint256 principal = providerPool.totalStaked + userPool.totalStaked;
        uint256 accounted = principal + providerPendingRewards + userPendingRewards;
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
     * @notice Get total staked amount across both pools
     */
    function getTotalStaked() external view returns (uint256) {
        return providerPool.totalStaked + userPool.totalStaked;
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
    
    function _updatePools() internal {
        if (providerPendingRewards > 0 && providerPool.totalStaked > 0) {
            uint256 rewards = providerPendingRewards;
            providerPendingRewards = 0;
            providerPool.accRewardPerShare += (rewards * 1e12) / providerPool.totalStaked;
            providerPool.totalRewards += rewards;
            emit PoolUpdated(PoolType.Provider, providerPool.totalStaked, providerPool.accRewardPerShare);
        }

        if (userPendingRewards > 0 && userPool.totalStaked > 0) {
            uint256 rewards = userPendingRewards;
            userPendingRewards = 0;
            userPool.accRewardPerShare += (rewards * 1e12) / userPool.totalStaked;
            userPool.totalRewards += rewards;
            emit PoolUpdated(PoolType.User, userPool.totalStaked, userPool.accRewardPerShare);
        }
    }
    
    function _harvestRewards(address user) internal {
        UserInfo storage userInfo_ = userInfo[user];
        
        if (userInfo_.amount == 0) return;
        
        uint256 pending;
        if (userInfo_.poolType == PoolType.Provider) {
            pending = _pendingProviderRewards(userInfo_);
            if (pending > 0) {
                userInfo_.rewardDebt = (userInfo_.amount * providerPool.accRewardPerShare) / 1e12;
                providerPool.totalRewards += pending;
            }
        } else {
            pending = _pendingUserRewards(userInfo_);
            if (pending > 0) {
                userInfo_.rewardDebt = (userInfo_.amount * userPool.accRewardPerShare) / 1e12;
                userPool.totalRewards += pending;
            }
        }
        
        if (pending > 0) {
            // Mint rewards to user (in production, this would be handled by emissions contract)
            token.safeTransfer(user, pending);
            emit RewardsHarvested(user, pending, userInfo_.poolType);
        }
    }
    
    function _pendingProviderRewards(UserInfo memory user) internal view returns (uint256) {
        if (user.amount == 0) return 0;
        
        uint256 accRewardPerShare = providerPool.accRewardPerShare;
        // In production, this would calculate based on emissions
        
        uint256 pending = (user.amount * accRewardPerShare) / 1e12;
        return pending > user.rewardDebt ? pending - user.rewardDebt : 0;
    }
    
    function _pendingUserRewards(UserInfo memory user) internal view returns (uint256) {
        if (user.amount == 0) return 0;
        
        uint256 accRewardPerShare = userPool.accRewardPerShare;
        // In production, this would calculate based on emissions
        
        uint256 pending = (user.amount * accRewardPerShare) / 1e12;
        return pending > user.rewardDebt ? pending - user.rewardDebt : 0;
    }
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}

    uint256[45] private __gap;
}
