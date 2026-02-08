// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Myntis} from "../Myntis.sol";

/**
 * @notice Test harness for Myntis internal functions.
 */
contract MyntisHarness is Myntis {
    constructor(address _lzEndpoint, address _delegate) Myntis(_lzEndpoint, _delegate) {}

    function exposedDebit(
        address from,
        uint256 amount,
        uint256 minAmount,
        uint32 dstEid
    ) external returns (uint256 amountSent, uint256 amountReceived) {
        return _debit(from, amount, minAmount, dstEid);
    }

    function exposedCredit(
        address to,
        uint256 amount,
        uint32 srcEid
    ) external returns (uint256 amountReceived) {
        return _credit(to, amount, srcEid);
    }

    function exposedDebitView(
        uint256 amount,
        uint256 minAmount,
        uint32 dstEid
    ) external view returns (uint256 amountSent, uint256 amountReceived) {
        return _debitView(amount, minAmount, dstEid);
    }
}
