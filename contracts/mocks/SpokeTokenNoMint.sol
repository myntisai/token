// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract SpokeTokenNoMint {
    mapping(address => uint256) private balances;

    function mint(address, uint256) external {
        // Intentionally no-op to trigger mint verification failure.
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }
}
