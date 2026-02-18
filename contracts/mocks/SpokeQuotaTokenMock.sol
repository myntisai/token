// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract SpokeQuotaTokenMock {
    uint256 public quota;
    uint256 public lastConfirmed;
    bool public shouldRevertConfirm;

    function setRevertConfirm(bool enabled) external {
        shouldRevertConfirm = enabled;
    }

    function increaseMintQuota(uint256 amount) external {
        quota += amount;
    }

    function confirmQuotaRequest(uint256 nonce) external {
        if (shouldRevertConfirm) {
            revert("confirm revert");
        }
        lastConfirmed = nonce;
    }
}
