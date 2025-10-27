// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {
    MessagingParams,
    MessagingReceipt,
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

interface ILzComposableReceiver {
    function lzReceive(
        Origin calldata origin,
        address receiver,
        bytes32 guid,
        bytes calldata message,
        bytes calldata extraData
    ) external payable;
}

/**
 * @title LayerZeroEndpointMock
 * @notice Minimal endpoint mock that synchronously forwards packets to a configured remote receiver.
 * @dev Strictly for unit/integration testing. No safeguards or fee accounting.
 */
contract LayerZeroEndpointMock {
    uint32 public immutable localEid;
    mapping(uint32 eid => address endpoint) public remotes;
    uint64 private _nextNonce = 1;

    constructor(uint32 eid) {
        require(eid != 0, "EndpointMock: eid zero");
        localEid = eid;
    }

    function setRemote(uint32 eid, address receiver) external {
        remotes[eid] = receiver;
    }

    // ----------------------------------------------------------------------
    // ILayerZeroEndpointV2 (subset)
    // ----------------------------------------------------------------------

    function quote(
        MessagingParams calldata,
        address
    ) external pure returns (MessagingFee memory) {
        return MessagingFee({nativeFee: 0, lzTokenFee: 0});
    }

    function send(
        MessagingParams calldata params,
        address
    ) external payable returns (MessagingReceipt memory receipt) {
        address remoteEndpoint = remotes[params.dstEid];
        require(remoteEndpoint != address(0), "EndpointMock: no remote");

        bytes32 guid = keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _nextNonce));
        receipt = MessagingReceipt({
            guid: guid,
            nonce: _nextNonce,
            fee: MessagingFee({nativeFee: msg.value, lzTokenFee: 0})
        });
        _nextNonce += 1;

        LayerZeroEndpointMock(remoteEndpoint).receivePacket(
            Origin({
                srcEid: localEid,
                sender: bytes32(uint256(uint160(msg.sender))),
                nonce: receipt.nonce
            }),
            params,
            guid
        );
    }

    function verifiable(Origin calldata, address) external pure returns (bool) {
        return false;
    }

    function verify(Origin calldata, address, bytes32) external pure {
        revert("EndpointMock: unsupported");
    }

    function initializable(Origin calldata, address) external pure returns (bool) {
        return false;
    }

    function lzReceive(
        Origin calldata,
        address,
        bytes32,
        bytes calldata,
        bytes calldata
    ) external payable {
        revert("EndpointMock: unsupported");
    }

    function clear(address, Origin calldata, bytes32, bytes calldata) external pure {
        revert("EndpointMock: unsupported");
    }

    function setLzToken(address) external pure {
        revert("EndpointMock: unsupported");
    }

    function lzToken() external pure returns (address) {
        return address(0);
    }

    function nativeToken() external pure returns (address) {
        return address(0);
    }

    function setDelegate(address) external pure {
        // no-op for tests
    }

    // ----------------------------------------------------------------------
    // Test helper
    // ----------------------------------------------------------------------

    function receivePacket(
        Origin memory origin,
        MessagingParams memory params,
        bytes32 guid
    ) external {
        address allowed = remotes[origin.srcEid];
        require(allowed == msg.sender, "EndpointMock: unauthorized sender");

        address receiver = bytes32ToAddress(params.receiver);
        ILzComposableReceiver(receiver).lzReceive(origin, receiver, guid, params.message, "");
    }

    // ----------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------

    function bytes32ToAddress(bytes32 data) private pure returns (address) {
        return address(uint160(uint256(data)));
    }
}
