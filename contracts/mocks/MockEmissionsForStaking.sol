// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

/**
 * @notice Minimal emissions mock used to unit test DualPoolStaking's sync logic.
 * @dev Mimics the `mintedEmissions()` counter + "mint rewards to staking" behavior.
 */
contract MockEmissionsForStaking {
    IMintableERC20 public immutable token;
    address public staking;

    uint256 public mintedEmissions;

    constructor(address _token) {
        require(_token != address(0), "invalid token");
        token = IMintableERC20(_token);
    }

    function setStaking(address _staking) external {
        staking = _staking;
    }

    function mintToStaking(uint256 amount) external {
        require(staking != address(0), "staking not set");
        require(amount > 0, "zero amount");
        mintedEmissions += amount;
        token.mint(staking, amount);
    }

    // Compatibility with DualPoolStaking's emissions interface.
    function harvest(address) external pure returns (uint256) {
        return 0;
    }

    function pendingRewards(address) external pure returns (uint256) {
        return 0;
    }

    function initializeNewProvider(address) external pure {}
}

