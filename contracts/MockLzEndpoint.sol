// contracts/MockLzEndpoint.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockLzEndpoint {
    event LzSend(uint16 indexed dstChainId, bytes payload, uint256 fee, address sender);

    // Simulate the send function called by _lzSend in OApp
    function send(
        uint16 _dstChainId,
        bytes calldata _payload,
        uint256 _fee
    ) external payable {
        emit LzSend(_dstChainId, _payload, _fee, msg.sender);
    }

    // Dummy implementation of getChainId (or any function OApp may call)
    function getChainId() external pure returns (uint16) {
        return 100; // Return a dummy chain id
    }

    // Fallback to catch any unimplemented calls
    fallback() external payable {}
    receive() external payable {}
}
