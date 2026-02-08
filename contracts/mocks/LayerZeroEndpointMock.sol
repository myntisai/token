// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {
    MessagingParams,
    MessagingReceipt,
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

interface ILzReceiver {
    function lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external payable;
}

/**
 * @title LayerZeroEndpointMock
 * @notice Minimal mock used by tests; does not perform real messaging.
 */
contract LayerZeroEndpointMock {
    uint32 public immutable eid;
    mapping(uint32 => address) public remotes;
    address public delegate;
    uint256 public nativeFee;

    constructor(uint32 _eid) {
        eid = _eid;
    }

    function setRemote(uint32 _eid, address _remote) external {
        remotes[_eid] = _remote;
    }

    function setDelegate(address _delegate) external {
        delegate = _delegate;
    }

    function quote(MessagingParams calldata, address) external view returns (MessagingFee memory) {
        return MessagingFee({nativeFee: nativeFee, lzTokenFee: 0});
    }

    function send(
        MessagingParams calldata params,
        address
    ) external payable returns (MessagingReceipt memory) {
        bytes32 guid = keccak256(
            abi.encode(params.dstEid, params.receiver, params.message, block.number, msg.sender)
        );
        return MessagingReceipt({
            guid: guid,
            nonce: 0,
            fee: MessagingFee({nativeFee: 0, lzTokenFee: 0})
        });
    }

    function setNativeFee(uint256 fee) external {
        nativeFee = fee;
    }

    function deliver(address receiver, Origin calldata origin, bytes calldata message) external {
        ILzReceiver(receiver).lzReceive(origin, bytes32(0), message, address(0), "");
    }
}
