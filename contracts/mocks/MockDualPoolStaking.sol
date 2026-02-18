// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockDualPoolStaking {
    IERC20 public immutable token;
    uint256 public userPoolTotal;
    mapping(address => uint256) public staked;
    uint256 public pendingRewardsValue;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function setPendingRewards(uint256 amount) external {
        pendingRewardsValue = amount;
    }

    function stakeToUserPool(uint256 amount, address user) external {
        userPoolTotal += amount;
        staked[user] += amount;
        token.transferFrom(msg.sender, address(this), amount);
    }

    function unstakeFromUserPool(uint256 amount, address user) external {
        require(staked[user] >= amount, "insufficient stake");
        staked[user] -= amount;
        userPoolTotal -= amount;
        token.transfer(msg.sender, amount);
    }

    function getUserPoolTotalStaked() external view returns (uint256) {
        return userPoolTotal;
    }

    function harvestRewards(address user) external {
        if (pendingRewardsValue > 0) {
            token.transfer(user, pendingRewardsValue);
            pendingRewardsValue = 0;
        }
    }

    function pendingRewards(address) external view returns (uint256) {
        return pendingRewardsValue;
    }
}
