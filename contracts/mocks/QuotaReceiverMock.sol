// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

interface ISpokeQuotaToken {
    function increaseMintQuota(uint256 amount) external;
    function confirmQuotaRequest(uint256 nonce) external;
}

contract QuotaReceiverMock {
    function increaseQuota(address token, uint256 amount) external {
        ISpokeQuotaToken(token).increaseMintQuota(amount);
    }

    function confirmQuota(address token, uint256 nonce) external {
        ISpokeQuotaToken(token).confirmQuotaRequest(nonce);
    }
}
