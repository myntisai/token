// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice Minimal mock staking pool for EmissionsContract and vault tests.
 */
contract MockStakingPool {
    IERC20 public immutable token;

    uint256 public totalStaked;
    uint256 public providerPoolStaked;

    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) public rewardDebtOf;

    uint256 public notifyCount;
    address public lastNotifyProvider;
    uint256 public lastNotifyAmount;

    uint256 public syncCount;

    address public emissionsContract;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function setEmissionsContract(address _emissions) external {
        emissionsContract = _emissions;
    }

    function setTotals(uint256 _totalStaked, uint256 _providerPoolStaked) external {
        totalStaked = _totalStaked;
        providerPoolStaked = _providerPoolStaked;
    }

    function setProvider(address provider, uint256 stake, uint256 rewardDebt) external {
        stakeOf[provider] = stake;
        rewardDebtOf[provider] = rewardDebt;
    }

    function getTotalStaked() external view returns (uint256) {
        return totalStaked;
    }

    function getProviderPoolStaked() external view returns (uint256) {
        return providerPoolStaked;
    }

    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt) {
        return (stakeOf[provider], rewardDebtOf[provider]);
    }

    function notifyReward(address provider, uint256 amount) external {
        notifyCount += 1;
        lastNotifyProvider = provider;
        lastNotifyAmount = amount;
    }

    function syncEmissions() external returns (uint256 totalRewards_) {
        syncCount += 1;
        return token.balanceOf(address(this));
    }

    function callInitializeNewProvider(address provider) external {
        require(emissionsContract != address(0), "emissions not set");
        (bool ok,) = emissionsContract.call(
            abi.encodeWithSignature("initializeNewProvider(address)", provider)
        );
        require(ok, "initializeNewProvider failed");
    }

    function callHarvest(address provider) external {
        require(emissionsContract != address(0), "emissions not set");
        (bool ok,) = emissionsContract.call(
            abi.encodeWithSignature("harvest(address)", provider)
        );
        require(ok, "harvest failed");
    }
}
