// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @notice Minimal token mock for EmissionsContract coverage.
 */
contract MockMyntisToken {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function setTotalSupply(uint256 amount) external {
        totalSupply = amount;
    }
}
