// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
}

interface IStakingPool {
    function getTotalStaked() external view returns (uint256);
    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt);
    function notifyReward(address provider, uint256 amount) external;
}

/**
 * @title EmissionsUpgradeable
 * @notice UUPS upgradeable version of Emissions contract with state migration support
 * @dev Production emissions contract with 800M total emissions over 4 years
 * @dev Includes fix for "Emission overrun" bug
 */
contract EmissionsUpgradeable is 
    Initializable,
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    IMyntisToken public token;
    IStakingPool public stakingContract;

    // Production: Proper emission parameters for 1B total supply
    uint256 public constant HALVING_PERIOD = 4 * 365 days; // 4 years per halving
    uint256 public constant AI_HUMAN_EMISSIONS = 700_000_000 * 1e18; // 700M AI-Human rewards
    uint256 public constant AI_AI_EMISSIONS = 100_000_000 * 1e18;    // 100M AI-AI rewards
    uint256 public constant TOTAL_EMISSIONS = 800_000_000 * 1e18;    // 800M total emissions
    
    // Initial emission rate (400M over 4 years, then halving)
    uint256 public constant INITIAL_EMISSION_RATE = (TOTAL_EMISSIONS / 2) / HALVING_PERIOD;

    uint256 public startTime;
    uint256 public lastRewardTime;

    // Accumulated reward per share, scaled by 1e12
    uint256 public accRewardPerShare;

    // Total emitted by schedule, undistributed carry, and total minted to staking
    uint256 public totalEmitted;       // <= TOTAL_EMISSIONS (800M)
    uint256 public unaccounted;        // emissions accrued while totalStake == 0
    uint256 public mintedEmissions;    // minted out via harvests

    // Events
    event StakingContractUpdated(address newStakingContract);
    event EmissionsUpdated(uint256 timeElapsed, uint256 emitted, uint256 carry, uint256 newAcc);
    event ProviderRewardsMinted(address indexed provider, uint256 amount);
    event StateMigrated(
        uint256 startTime,
        uint256 lastRewardTime,
        uint256 accRewardPerShare,
        uint256 totalEmitted,
        uint256 unaccounted,
        uint256 mintedEmissions
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize with fresh state (for new deployments)
     * @param _token The token contract address
     * @param _stakingContract The staking contract address
     * @param admin The admin address
     */
    function initialize(
        address _token,
        address _stakingContract,
        address admin
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        token = IMyntisToken(_token);
        stakingContract = IStakingPool(_stakingContract);
        
        startTime = block.timestamp;
        lastRewardTime = block.timestamp;
        
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    /**
     * @notice Initialize with migrated state from old contract
     * @param _token The token contract address
     * @param _stakingContract The staking contract address
     * @param admin The admin address
     * @param _startTime Original start time from old contract
     * @param _lastRewardTime Last reward time from old contract
     * @param _accRewardPerShare Accumulated reward per share from old contract
     * @param _totalEmitted Total emitted from old contract
     * @param _unaccounted Unaccounted emissions from old contract
     * @param _mintedEmissions Minted emissions from old contract
     */
    function initializeWithMigration(
        address _token,
        address _stakingContract,
        address admin,
        uint256 _startTime,
        uint256 _lastRewardTime,
        uint256 _accRewardPerShare,
        uint256 _totalEmitted,
        uint256 _unaccounted,
        uint256 _mintedEmissions
    ) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        token = IMyntisToken(_token);
        stakingContract = IStakingPool(_stakingContract);
        
        // Migrate state from old contract
        startTime = _startTime;
        lastRewardTime = _lastRewardTime;
        accRewardPerShare = _accRewardPerShare;
        totalEmitted = _totalEmitted;
        unaccounted = _unaccounted;
        mintedEmissions = _mintedEmissions;
        
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        emit StateMigrated(
            _startTime,
            _lastRewardTime,
            _accRewardPerShare,
            _totalEmitted,
            _unaccounted,
            _mintedEmissions
        );
    }

    /**
     * @notice Update the staking contract address
     */
    function setStakingContract(address _stakingContract) external onlyRole(ADMIN_ROLE) {
        stakingContract = IStakingPool(_stakingContract);
        emit StakingContractUpdated(_stakingContract);
    }

    /**
     * @notice Get current emission rate based on halving schedule
     * @dev Production: Returns proper emission rate for 800M total emissions
     */
    function getCurrentEmissionRate() public view returns (uint256) {
        if (block.timestamp <= startTime) return 0;
        
        unchecked {
            uint256 elapsed = block.timestamp - startTime;
            uint256 periods = elapsed / HALVING_PERIOD;
            
            // Safety cap at 25 halvings (rate would be negligible anyway)
            if (periods >= 25) return 0;
            
            // Right shift is safe for periods < 256
            return INITIAL_EMISSION_RATE >> periods;
        }
    }

    /**
     * @notice Update emissions and distribute to stakers
     * @dev Production: Proper overflow protection and 800M supply validation
     */
    function updateEmissions() public {
        if (block.timestamp <= lastRewardTime) return;

        uint256 emissionRate = getCurrentEmissionRate();
        uint256 timeElapsed = block.timestamp - lastRewardTime;
        
        // CRITICAL FIX: Overflow protection
        require(
            emissionRate == 0 || timeElapsed <= type(uint256).max / emissionRate,
            "Overflow in emission calculation"
        );
        
        uint256 toEmit = emissionRate * timeElapsed;

        // Production: Cap against TOTAL_EMISSIONS (800M)
        if (totalEmitted + toEmit > TOTAL_EMISSIONS) {
            toEmit = TOTAL_EMISSIONS - totalEmitted;
        }

        if (toEmit > 0) {
            totalEmitted += toEmit;
            uint256 totalStake = stakingContract.getTotalStaked();

            if (totalStake == 0) {
                // Carry emissions forward when no stakers
                unaccounted += toEmit;
            } else {
                uint256 distribute = toEmit + unaccounted;
                unaccounted = 0;
                
                // CRITICAL FIX: Check for overflow before division
                require(
                    distribute <= type(uint256).max / 1e12,
                    "Overflow in reward calculation"
                );
                
                uint256 rewardPerShare = (distribute * 1e12) / totalStake;
                
                // Check accRewardPerShare won't overflow
                require(
                    accRewardPerShare <= type(uint256).max - rewardPerShare,
                    "Overflow in accumulated rewards"
                );
                
                accRewardPerShare += rewardPerShare;
            }

            emit EmissionsUpdated(timeElapsed, toEmit, unaccounted, accRewardPerShare);
        }

        lastRewardTime = block.timestamp;
    }

    /**
     * @notice Harvest rewards for a provider
     * @dev Production: Fixed "Emission overrun" bug by capping pending to remainingEmissions
     */
    function harvest(address provider) external nonReentrant returns (uint256 pending) {
        require(msg.sender == address(stakingContract), "Only StakingContract");
        require(provider != address(0), "Invalid provider");

        // Update global state first
        updateEmissions();

        // Get provider info
        (uint256 stake, uint256 rewardDebt) = stakingContract.getProviderInfo(provider);
        
        // CRITICAL FIX: Overflow protection
        require(
            stake == 0 || accRewardPerShare <= type(uint256).max / stake,
            "Overflow in pending calculation"
        );
        
        uint256 accumulated = (stake * accRewardPerShare) / 1e12;
        pending = accumulated > rewardDebt ? accumulated - rewardDebt : 0;

        if (pending > 0) {
            // CRITICAL FIX: Cap pending to remaining emissions
            // Use totalEmitted instead of mintedEmissions for accurate cap enforcement
            // because totalEmitted tracks scheduled emissions, which is the true limit
            uint256 remainingEmissions = totalEmitted > mintedEmissions ? totalEmitted - mintedEmissions : 0;
            
            if (pending > remainingEmissions) {
                // Cap pending to remaining emissions
                pending = remainingEmissions;
            }
            
            // Production: Validate against TOTAL_EMISSIONS (800M)
            require(mintedEmissions + pending <= TOTAL_EMISSIONS, "Emission overrun");
            require(pending <= TOTAL_EMISSIONS, "Exceeds emission supply");
            
            mintedEmissions += pending;

            // Mint tokens to the staking contract and update provider debt
            token.mint(address(stakingContract), pending);
            stakingContract.notifyReward(provider, pending);
            emit ProviderRewardsMinted(provider, pending);
        }
        
        return pending;
    }

    /**
     * @notice Get pending rewards for a provider
     * @dev View function for UI
     */
    function pendingRewards(address provider) external view returns (uint256) {
        (uint256 stake, uint256 rewardDebt) = stakingContract.getProviderInfo(provider);
        
        // Calculate what accRewardPerShare would be after update
        uint256 currentAcc = accRewardPerShare;
        uint256 totalStake = stakingContract.getTotalStaked();
        
        if (totalStake > 0) {
            uint256 emissionRate = getCurrentEmissionRate();
            uint256 timeElapsed = block.timestamp - lastRewardTime;
            uint256 toEmit = emissionRate * timeElapsed;
            
            // Cap against remaining emissions
            uint256 remainingEmissions = TOTAL_EMISSIONS - totalEmitted;
            if (toEmit > remainingEmissions) {
                toEmit = remainingEmissions;
            }
            
            if (toEmit > 0) {
                uint256 distribute = toEmit + unaccounted;
                uint256 rewardPerShare = (distribute * 1e12) / totalStake;
                currentAcc += rewardPerShare;
            }
        }
        
        uint256 accumulated = (stake * currentAcc) / 1e12;
        return accumulated > rewardDebt ? accumulated - rewardDebt : 0;
    }

    /**
     * @notice Get emission statistics
     */
    function getEmissionStats() external view returns (
        uint256 currentRate,
        uint256 totalEmitted_,
        uint256 remainingEmissions,
        uint256 mintedEmissions_,
        uint256 unaccounted_,
        uint256 aiHumanEmissions,
        uint256 aiAiEmissions,
        uint256 totalEmissions
    ) {
        return (
            getCurrentEmissionRate(),
            totalEmitted,
            TOTAL_EMISSIONS - totalEmitted,
            mintedEmissions,
            unaccounted,
            AI_HUMAN_EMISSIONS,
            AI_AI_EMISSIONS,
            TOTAL_EMISSIONS
        );
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}
}


