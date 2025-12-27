// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

interface IStakingPool {
    function getTotalStaked() external view returns (uint256);
    function getProviderPoolStaked() external view returns (uint256);
    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt);
    function notifyReward(address provider, uint256 amount) external;
}

/**
 * @title EmissionsContract
 * @notice Manages the emission schedule with halving logic and distributes rewards to providers.
 * @dev Uses the MasterChef pattern for on-demand reward minting.
 * @dev Provider calls harvest() through staking contract to claim rewards.
 */
contract EmissionsContract is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    IMyntisToken public immutable token;
    IStakingPool public stakingContract;

    // Emission parameters
    uint256 public constant HALVING_PERIOD = 4 * 365 days; // 4 years per halving
    uint256 public constant TOTAL_EMISSIONS = 800_000_000 * 1e18; // 800M total emissions
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18; // 1B max token supply
    
    // Initial emission rate (400M over 4 years, then halving)
    // 400M / (4 * 365 * 24 * 60 * 60) ≈ 3.17 tokens per second
    uint256 public constant INITIAL_EMISSION_RATE = (TOTAL_EMISSIONS / 2) / HALVING_PERIOD;
    
    /// @notice Precision multiplier for reward per share calculations
    uint256 public constant PRECISION = 1e12;

    uint256 public immutable startTime;
    uint256 public lastRewardTime;
    uint256 public mintedEmissions; // total minted supply from this contract
    
    // SECURITY FIX: Track emissions added to accRewardPerShare to prevent exceeding cap
    uint256 public accountedEmissions;
    
    // Migration state
    bool public migrationInitialized;

    // Accumulated reward per share, scaled by 1e12
    uint256 public accRewardPerShare;
    
    // CRITICAL FIX: Track provider reward debt internally to prevent double-claiming
    // This separates emission rewards from DualPoolStaking rewards
    mapping(address => uint256) public providerRewardDebt;

    // Events
    event StakingContractUpdated(address indexed oldContract, address indexed newContract);
    event EmissionsUpdated(uint256 timeElapsed, uint256 tokensAccounted, uint256 newAccRewardPerShare);
    event ProviderRewardsHarvested(address indexed provider, uint256 amount);
    event ProviderDebtInitialized(address indexed provider, uint256 debtAmount);
    event ProviderRewardDebtUpdated(address indexed provider, uint256 oldDebt, uint256 newDebt);
    event MigrationInitialized(uint256 mintedEmissions, uint256 accountedEmissions, uint256 accRewardPerShare, uint256 lastRewardTime, uint256 providerCount);

    // Errors
    error ZeroAddress();
    error OnlyStakingContract();
    error ExceedsEmissionsCap(uint256 requested, uint256 remaining);
    error ExceedsMaxSupply(uint256 newSupply, uint256 maxSupply);
    error MigrationAlreadyInitialized();

    constructor(
        address _token,
        address _stakingContract,
        address _admin
    ) {
        if (_token == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        // NOTE: _stakingContract can be address(0) initially for deployment order flexibility
        // It will be set via setStakingContract() after DualPoolStaking is deployed
        
        token = IMyntisToken(_token);
        stakingContract = IStakingPool(_stakingContract);
        _grantRole(ADMIN_ROLE, _admin);

        startTime = block.timestamp;
        lastRewardTime = block.timestamp;
        mintedEmissions = 0;
        accountedEmissions = 0;
    }

    // ----------------------------
    //         ADMIN
    // ----------------------------

    /**
     * @notice Update the staking contract address
     * @param _stakingContract New staking contract address
     */
    function setStakingContract(address _stakingContract) external onlyRole(ADMIN_ROLE) {
        if (_stakingContract == address(0)) revert ZeroAddress();
        address oldContract = address(stakingContract);
        stakingContract = IStakingPool(_stakingContract);
        emit StakingContractUpdated(oldContract, _stakingContract);
    }
    
    /**
     * @notice Initialize emissions state from old contract migration
     * @dev One-time function to migrate state from previous EmissionsContract
     * @param _mintedEmissions Total minted emissions from old contract
     * @param _accountedEmissions Total accounted emissions from old contract
     * @param _accRewardPerShare Accumulated reward per share from old contract
     * @param _lastRewardTime Last reward time from old contract
     * @param _providers Array of provider addresses with existing debt
     * @param _debts Array of corresponding reward debts
     */
    function initializeMigration(
        uint256 _mintedEmissions,
        uint256 _accountedEmissions,
        uint256 _accRewardPerShare,
        uint256 _lastRewardTime,
        address[] calldata _providers,
        uint256[] calldata _debts
    ) external onlyRole(ADMIN_ROLE) {
        if (migrationInitialized) revert MigrationAlreadyInitialized();
        require(_providers.length == _debts.length, "Length mismatch");
        require(_mintedEmissions <= TOTAL_EMISSIONS, "Exceeds emissions cap");
        require(_accountedEmissions <= TOTAL_EMISSIONS, "Exceeds emissions cap");
        require(_accountedEmissions >= _mintedEmissions, "Accounted must be >= minted");
        
        mintedEmissions = _mintedEmissions;
        accountedEmissions = _accountedEmissions;
        accRewardPerShare = _accRewardPerShare;
        lastRewardTime = _lastRewardTime;
        
        for (uint256 i = 0; i < _providers.length; i++) {
            if (_providers[i] != address(0)) {
                providerRewardDebt[_providers[i]] = _debts[i];
                emit ProviderDebtInitialized(_providers[i], _debts[i]);
            }
        }
        
        migrationInitialized = true;
        emit MigrationInitialized(_mintedEmissions, _accountedEmissions, _accRewardPerShare, _lastRewardTime, _providers.length);
    }
    
    /**
     * @notice Initialize provider reward debt for existing stakers
     * @param provider Provider address to initialize
     * @dev SECURITY FIX: Prevents first-claim-gets-all for existing providers
     * @dev Must be called for any provider who was staking before this contract was deployed/updated
     */
    function initializeProviderDebt(address provider) external onlyRole(ADMIN_ROLE) {
        if (provider == address(0)) revert ZeroAddress();
        require(providerRewardDebt[provider] == 0, "Provider debt already initialized");
        
        (uint256 stake, ) = stakingContract.getProviderInfo(provider);
        require(stake > 0, "Provider has no stake");
        
        uint256 debtAmount = (stake * accRewardPerShare) / PRECISION;
        providerRewardDebt[provider] = debtAmount;
        
        emit ProviderDebtInitialized(provider, debtAmount);
    }
    
    /**
     * @notice Batch initialize provider reward debt for multiple providers
     * @param providers Array of provider addresses to initialize
     * @dev SECURITY FIX: Efficient batch initialization for migrations
     */
    function batchInitializeProviderDebt(address[] calldata providers) external onlyRole(ADMIN_ROLE) {
        for (uint256 i = 0; i < providers.length; i++) {
            address provider = providers[i];
            if (provider == address(0)) continue;
            if (providerRewardDebt[provider] != 0) continue;
            
            (uint256 stake, ) = stakingContract.getProviderInfo(provider);
            if (stake == 0) continue;
            
            uint256 debtAmount = (stake * accRewardPerShare) / PRECISION;
            providerRewardDebt[provider] = debtAmount;
            
            emit ProviderDebtInitialized(provider, debtAmount);
        }
    }
    
    /**
     * @notice Initialize new provider's reward debt when they first stake
     * @param provider Provider address
     * @dev CRITICAL FIX: Called by DualPoolStaking when new provider stakes
     * @dev Prevents new providers from stealing accumulated rewards
     * @dev Sets debt based on actual stake to ensure they start with 0 pending rewards
     * @dev MUST be called AFTER the stake is recorded in the staking contract
     */
    function initializeNewProvider(address provider) external {
        if (msg.sender != address(stakingContract)) revert OnlyStakingContract();
        if (provider == address(0)) revert ZeroAddress();
        
        // Only initialize if not already set (prevents re-initialization attack)
        if (providerRewardDebt[provider] == 0) {
            // Update emissions first to get current accRewardPerShare
            updateEmissions();
            
            // CRITICAL: Get actual stake from staking contract
            // This must be called AFTER stake is recorded to correctly initialize debt
            (uint256 stake, ) = stakingContract.getProviderInfo(provider);
            
            // Calculate debt based on actual stake so they start with 0 pending rewards
            // Formula: debt = (stake * accRewardPerShare) / PRECISION
            // This ensures: pending = accumulated - debt = 0 for new providers
            uint256 debtAmount = (stake * accRewardPerShare) / PRECISION;
            
            // Use 1 wei as minimum to mark as initialized (prevents re-initialization)
            providerRewardDebt[provider] = debtAmount > 0 ? debtAmount : 1;
            
            emit ProviderDebtInitialized(provider, providerRewardDebt[provider]);
        }
    }

    // ----------------------------
    //       EMISSION LOGIC
    // ----------------------------

    /**
     * @notice Get the current emission rate based on halving schedule
     * @return rate Tokens per second at current halving period
     */
    function getCurrentEmissionRate() public view returns (uint256) {
        if (block.timestamp <= startTime) return 0;
        uint256 elapsed = block.timestamp - startTime;
        uint256 periods = elapsed / HALVING_PERIOD;
        if (periods >= 25) return 0; // safety cap after ~100 years
        return INITIAL_EMISSION_RATE >> periods;
    }

    /**
     * @notice Get remaining emissions that can still be minted
     * @return remaining Tokens remaining in emission allocation
     */
    function remainingEmissions() external view returns (uint256) {
        return TOTAL_EMISSIONS > mintedEmissions ? TOTAL_EMISSIONS - mintedEmissions : 0;
    }

    /**
     * @notice Update global emission accounting
     * @dev Called internally before any harvest to ensure accRewardPerShare is current
     * @dev SECURITY FIX: Uses provider pool stake only and tracks accountedEmissions
     */
    function updateEmissions() public {
        if (block.timestamp <= lastRewardTime) {
            return;
        }
        
        uint256 emissionRate = getCurrentEmissionRate();
        if (emissionRate == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        // SECURITY FIX: Use provider pool stake only (not total stake including user pool)
        // This ensures emissions are distributed only to providers who can harvest
        uint256 providerStake = stakingContract.getProviderPoolStaked();
        
        // If no provider stakers, just update time and skip emission accounting
        // This prevents first-staker-gets-all attack
        if (providerStake == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - lastRewardTime;
        uint256 tokensToAccount = emissionRate * timeElapsed;

        // SECURITY FIX: Cap at remaining accountable emissions (not just minted)
        // This prevents accRewardPerShare from growing beyond what can be minted
        uint256 remainingAccountable = TOTAL_EMISSIONS - accountedEmissions;
        if (tokensToAccount > remainingAccountable) {
            tokensToAccount = remainingAccountable;
        }

        if (tokensToAccount > 0) {
            // SECURITY FIX: Track accounted emissions to prevent exceeding cap
            accountedEmissions += tokensToAccount;
            // Update accounting (does not mint yet - that happens in harvest)
            accRewardPerShare += (tokensToAccount * PRECISION) / providerStake;
            emit EmissionsUpdated(timeElapsed, tokensToAccount, accRewardPerShare);
        }

        lastRewardTime = block.timestamp;
    }

    /**
     * @notice Harvest rewards for a provider
     * @dev Called by StakingContract on behalf of provider
     * @dev Uses checks-effects-interactions pattern for reentrancy safety
     * @dev CRITICAL FIX: Uses internal providerRewardDebt to prevent double-claiming
     * @param provider Provider address to harvest rewards for
     * @return mintedAmount The amount of tokens minted (0 if no rewards)
     */
    function harvest(address provider) external nonReentrant returns (uint256) {
        // Checks
        if (msg.sender != address(stakingContract)) revert OnlyStakingContract();
        if (provider == address(0)) revert ZeroAddress();

        // Update global emission state
        updateEmissions();

        // CRITICAL FIX: Use internal providerRewardDebt instead of DualPoolStaking's rewardDebt
        // This prevents double-claiming because emission rewards are tracked separately
        (uint256 stake, ) = stakingContract.getProviderInfo(provider);
        uint256 accumulated = (stake * accRewardPerShare) / PRECISION;
        uint256 rewardDebt = providerRewardDebt[provider];
        uint256 pending = accumulated > rewardDebt ? accumulated - rewardDebt : 0;

        if (pending == 0) return 0;

        // Verify emission cap
        if (mintedEmissions + pending > TOTAL_EMISSIONS) {
            revert ExceedsEmissionsCap(pending, TOTAL_EMISSIONS - mintedEmissions);
        }

        // Verify max supply cap
        uint256 currentSupply = token.totalSupply();
        if (currentSupply + pending > MAX_SUPPLY) {
            revert ExceedsMaxSupply(currentSupply + pending, MAX_SUPPLY);
        }

        // Effects - update state BEFORE external calls
        mintedEmissions += pending;
        
        // CRITICAL FIX: Update internal reward debt to prevent double-claiming
        uint256 oldDebt = providerRewardDebt[provider];
        providerRewardDebt[provider] = accumulated;
        
        // SECURITY FIX: Emit event for tracking reward debt changes
        emit ProviderRewardDebtUpdated(provider, oldDebt, accumulated);
        
        // Notify staking contract (informational only - debt is tracked internally now)
        stakingContract.notifyReward(provider, pending);

        // Interactions - external calls last
        // OPTION B: Mint to staking contract (not provider EOA) so staking can fund distributor
        token.mint(address(stakingContract), pending);

        emit ProviderRewardsHarvested(provider, pending);
        return pending;
    }

    /**
     * @notice Get pending rewards for a provider (view function)
     * @param provider Provider address
     * @return pending Pending reward amount
     * @dev CRITICAL FIX: Uses internal providerRewardDebt to prevent double-claiming
     */
    function pendingRewards(address provider) external view returns (uint256) {
        (uint256 stake, ) = stakingContract.getProviderInfo(provider);
        
        // Calculate what accRewardPerShare would be if updated now
        uint256 currentAccReward = accRewardPerShare;
        
        if (block.timestamp > lastRewardTime) {
            // SECURITY FIX: Use provider pool stake only
            uint256 providerStake = stakingContract.getProviderPoolStaked();
            if (providerStake > 0) {
                uint256 emissionRate = getCurrentEmissionRate();
                uint256 timeElapsed = block.timestamp - lastRewardTime;
                uint256 tokensToAccount = emissionRate * timeElapsed;
                
                // SECURITY FIX: Cap check against accountedEmissions
                uint256 remainingAccountable = TOTAL_EMISSIONS - accountedEmissions;
                if (tokensToAccount > remainingAccountable) {
                    tokensToAccount = remainingAccountable;
                }
                
                currentAccReward += (tokensToAccount * PRECISION) / providerStake;
            }
        }
        
        uint256 accumulated = (stake * currentAccReward) / PRECISION;
        // CRITICAL FIX: Use internal providerRewardDebt
        uint256 rewardDebt = providerRewardDebt[provider];
        return accumulated > rewardDebt ? accumulated - rewardDebt : 0;
    }

    /**
     * @notice Get contract info for debugging/UI
     */
    function getContractInfo() external view returns (
        uint256 totalEmissionsCap,
        uint256 totalMinted,
        uint256 currentRate,
        uint256 accReward,
        uint256 lastUpdate
    ) {
        return (
            TOTAL_EMISSIONS,
            mintedEmissions,
            getCurrentEmissionRate(),
            accRewardPerShare,
            lastRewardTime
        );
    }
    
    /**
     * @notice Emergency correction for accountedEmissions
     * @param newAccountedEmissions New value for accountedEmissions
     * @dev SECURITY FIX: Allows admin to correct accounting if emissions were skipped
     * @dev Use with extreme caution - can affect reward distribution
     */
    function correctAccountedEmissions(uint256 newAccountedEmissions) external onlyRole(ADMIN_ROLE) {
        require(newAccountedEmissions <= TOTAL_EMISSIONS, "Exceeds total emissions cap");
        require(newAccountedEmissions >= mintedEmissions, "Cannot be less than minted");
        
        uint256 oldValue = accountedEmissions;
        accountedEmissions = newAccountedEmissions;
        
        emit AccountedEmissionsCorrected(oldValue, newAccountedEmissions);
    }
    
    event AccountedEmissionsCorrected(uint256 oldValue, uint256 newValue);
}
