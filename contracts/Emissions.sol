// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
}

interface IStakingPool {
    function getTotalStaked() external view returns (uint256);
    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt);
}

/**
 * @title Emissions
 * @notice Production emissions contract with 800M total emissions over 4 years
 * @dev 1B total supply = 800M emissions + 200M immediate allocation
 */
contract Emissions is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    IMyntisToken public immutable token;
    IStakingPool public stakingContract;

    // Production: Proper emission parameters for 1B total supply
    uint256 public constant HALVING_PERIOD = 4 * 365 days; // 4 years per halving
    uint256 public constant AI_HUMAN_EMISSIONS = 700_000_000 * 1e18; // 700M AI-Human rewards
    uint256 public constant AI_AI_EMISSIONS = 100_000_000 * 1e18;    // 100M AI-AI rewards
    uint256 public constant TOTAL_EMISSIONS = 800_000_000 * 1e18;    // 800M total emissions
    
    // Initial emission rate (400M over 4 years, then halving)
    uint256 public constant INITIAL_EMISSION_RATE = (TOTAL_EMISSIONS / 2) / HALVING_PERIOD;

    uint256 public immutable startTime;
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

    constructor(address _token, address _stakingContract, address _admin) {
        token = IMyntisToken(_token);
        stakingContract = IStakingPool(_stakingContract);
        
        startTime = block.timestamp;
        lastRewardTime = block.timestamp;
        
        _grantRole(ADMIN_ROLE, _admin);
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
     * @dev Production: Better overflow protection and 800M supply validation
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
            // Production: Validate against TOTAL_EMISSIONS (800M)
            require(mintedEmissions + pending <= TOTAL_EMISSIONS, "Emission overrun");
            require(pending <= TOTAL_EMISSIONS, "Exceeds emission supply");
            
            mintedEmissions += pending;

            // Mint tokens to the staking contract
            token.mint(address(stakingContract), pending);
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
}
