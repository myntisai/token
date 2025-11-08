// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
}

interface IStakingPool {
    function getTotalStaked() external view returns (uint256);
    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt);
    function notifyReward(address provider, uint256 amount) external;
}

/**
 * @title EmissionsContract
 * @notice Manages the emission schedule with halving logic and distributes rewards to providers.
 */
contract EmissionsContract is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    IMyntisToken public immutable token;
    IStakingPool public stakingContract;

    // Emission parameters
    uint256 public constant HALVING_PERIOD = 4 * 365 days; // 4 years per halving
    uint256 public constant TOTAL_EMISSIONS = 800_000_000 * 1e18; // 800M total emissions
    // Initial emission rate (400M over 4 years, then halving)
    uint256 public constant INITIAL_EMISSION_RATE = (TOTAL_EMISSIONS / 2) / HALVING_PERIOD; // 400M first period
    uint256 public constant EMISSION_SUPPLY = 700_000_000 * 1e18;

    uint256 public immutable startTime;
    uint256 public lastRewardTime;
    uint256 public mintedEmissions; // total minted supply from this contract

    // Accumulated reward per share, scaled by 1e12
    uint256 public accRewardPerShare;

    // Events
    event EmissionContractUpdated(address newStakingContract);
    event EmissionsUpdated(uint256 timeElapsed, uint256 tokensToAccount, uint256 newAccRewardPerShare);
    event ProviderRewardsHarvested(address indexed provider, uint256 amount);

    constructor(
        address _token,
        address _stakingContract,
        address _admin
    ) {
        token = IMyntisToken(_token);
        stakingContract = IStakingPool(_stakingContract);
        _grantRole(ADMIN_ROLE, _admin);

        startTime = block.timestamp;
        lastRewardTime = block.timestamp;
        mintedEmissions = 0;
    }

    // ----------------------------
    //         ADMIN
    // ----------------------------

    function setStakingContract(address _stakingContract) external onlyRole(ADMIN_ROLE) {
        require(_stakingContract != address(0), "Invalid contract");
        stakingContract = IStakingPool(_stakingContract);
        emit EmissionContractUpdated(_stakingContract);
    }

    // ----------------------------
    //       EMISSION LOGIC
    // ----------------------------

    function getCurrentEmissionRate() public view returns (uint256) {
        if (block.timestamp <= startTime) return 0;
        uint256 elapsed = block.timestamp - startTime;
        uint256 periods = elapsed / HALVING_PERIOD;
        if (periods >= 25) return 0; // safety cap
        return INITIAL_EMISSION_RATE >> periods;
    }

    function updateEmissions() public {
        if (block.timestamp <= lastRewardTime) {
            return;
        }
        uint256 emissionRate = getCurrentEmissionRate();
        if (emissionRate == 0) {
            lastRewardTime = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - lastRewardTime;
        uint256 tokensToAccount = emissionRate * timeElapsed;

        // Cap at TOTAL_EMISSIONS (800M) but track against EMISSION_SUPPLY (700M) for compatibility
        // Halving schedule: Years 0-4: 400M, Years 4-8: 200M, Years 8-12: 100M, etc.
        uint256 maxEmissions = TOTAL_EMISSIONS;
        if (mintedEmissions + tokensToAccount > maxEmissions) {
            tokensToAccount = maxEmissions - mintedEmissions;
        }

        if (tokensToAccount > 0) {
            uint256 totalStake = stakingContract.getTotalStaked();

            if (totalStake > 0) {
                mintedEmissions += tokensToAccount;
                accRewardPerShare += (tokensToAccount * 1e12) / totalStake;
                emit EmissionsUpdated(timeElapsed, tokensToAccount, accRewardPerShare);
            }
            // Skip emissions when no providers are staked to keep emission schedule aligned
        }

        lastRewardTime = block.timestamp;
    }

    /**
     * @notice Called by StakingContract. Mints tokens based on pending rewards.
     * @dev Removed nonReentrant modifier to avoid nested reentrancy issues.
     */
    function harvest(address provider) external {
        require(msg.sender == address(stakingContract), "Only StakingContract can harvest");
        require(provider != address(0), "Invalid provider");

        // Update global state
        updateEmissions();

        // Calculate pending rewards
        (uint256 stake, uint256 rewardDebt) = stakingContract.getProviderInfo(provider);
        uint256 accumulated = (stake * accRewardPerShare) / 1e12;
        uint256 pending = accumulated > rewardDebt ? accumulated - rewardDebt : 0;

        if (pending > 0) {
            // Mint tokens to the staking contract
            token.mint(address(stakingContract), pending);
            // Let stakingContract update provider's reward debt
            stakingContract.notifyReward(provider, pending);

            emit ProviderRewardsHarvested(provider, pending);
        }
    }
}
