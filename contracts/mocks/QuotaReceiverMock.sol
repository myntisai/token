// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface IMyntisSpokeOFT {
    function increaseMintQuota(uint256 amount) external;
}

contract QuotaReceiverMock {
    function increaseQuota(address token, uint256 amount) external {
        IMyntisSpokeOFT(token).increaseMintQuota(amount);
    }
}
