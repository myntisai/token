// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "@chainlink/contracts/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

contract MockCCIPRouter is IRouterClient {
    function isChainSupported(uint64 destChainSelector) external pure override returns (bool supported) {
        return true;
    }

    function getFee(uint64 destinationChainSelector, Client.EVM2AnyMessage memory message) external pure override returns (uint256 fee) {
        return 0;
    }

    event CCIPSendCalled(uint64 destinationChainSelector, Client.EVM2AnyMessage message);

    // When the L1 bridge calls ccipSend, we simply emit an event and return a dummy messageId.
    function ccipSend(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message) external payable override returns (bytes32) {
        emit CCIPSendCalled(destinationChainSelector, message);
        // For testing purposes, we return a unique dummy messageId.
        return keccak256(abi.encode(destinationChainSelector, message.receiver, message.data, message.feeToken, message.extraArgs));
    }
}