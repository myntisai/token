// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IMerkleDistributor {
    function notifyRewardFromBridge(address provider, uint256 amount) external;
}

contract MyntisBridge is OApp {
    IMyntisToken public immutable myntisToken;
    IMerkleDistributor public immutable merkleDistributor;

    mapping(uint16 => bytes32) public remoteBridgeAddresses;

    enum MessageType { Regular, ProviderReward }

    event LogStep(uint8 indexed step, string message);
    event MYNTBridged(address indexed user, uint256 amount, uint16 dstChainId, MessageType messageType);
    event MYNTReceived(bytes32 guid, address indexed recipient, uint256 amount, uint16 srcChainId, MessageType messageType);
    event RemoteBridgeUpdated(uint16 chainId, bytes32 bridgeAddress);

    constructor(
        address _lzEndpoint,
        address _owner,
        address _myntisToken,
        address _merkleDistributor
    ) OApp(_lzEndpoint, _owner) Ownable(_owner) {
        myntisToken = IMyntisToken(_myntisToken);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
    }

    modifier onlyLzOwner() {
        require(msg.sender == owner(), "Not Lz owner");
        _;
    }

    function updateRemoteBridge(uint16 chainId, bytes32 bridgeAddress) external onlyLzOwner {
        remoteBridgeAddresses[chainId] = bridgeAddress;
        emit RemoteBridgeUpdated(chainId, bridgeAddress);
    }
    error BridgeError(string reason);

    // Bridge function using try/catch for all external calls
    function bridgeMYNT(uint16 dstChainId, uint256 amount, address recipient, bool isProviderReward) external payable {
        emit LogStep(1, "Starting bridgeMYNT execution");
        require(amount > 0, "Invalid amount");
        require(remoteBridgeAddresses[dstChainId] != bytes32(0), "Destination not set");
        emit LogStep(2, "Pre-checks passed");

        // Attempt token transfer
        try myntisToken.transferFrom(msg.sender, address(this), amount) returns (bool success) {
            require(success, "Token transfer failed");
            emit LogStep(3, "Token transfer succeeded");
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert("Token transfer failed: Unknown error");
        }

        // Attempt token burn
        try myntisToken.burn(address(this), amount) {
            emit LogStep(4, "Token burn succeeded");
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert("Token burn failed: Unknown error");
        }

        // Prepare payload
        MessageType messageType = isProviderReward ? MessageType.ProviderReward : MessageType.Regular;
        bytes memory payload = abi.encode(messageType, recipient, amount);
        emit LogStep(5, "Payload encoded");

        // Prepare adapter parameters (using abi.encode for proper formatting)
        uint256 gasForDestination = 500000;
        bytes memory adapterParams = abi.encode(uint16(1), gasForDestination);
        emit LogStep(6, "Adapter parameters set");

        // Attempt to send LayerZero message
        try this._sendLayerZero(
            dstChainId,
            payload,
            adapterParams,
            msg.value,
            msg.sender
        ) {
            emit LogStep(7, "LayerZero message sent");
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert("LayerZero message failed: Unknown error");
        }

        emit MYNTBridged(msg.sender, amount, dstChainId, messageType);
        emit LogStep(8, "bridgeMYNT execution completed");
    }
    // A public wrapper function to allow try/catch handling
    function _sendLayerZero(
        uint16 dstChainId,
        bytes memory payload,
        bytes memory adapterParams,
        uint256 fee,
        address refundAddress
    ) public {
        _lzSend(
            dstChainId,
            payload,
            adapterParams,
            MessagingFee(fee, 0),
            payable(refundAddress)
        );
    }
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _payload,
        address, // executor
        bytes calldata // extraData
    ) internal override {
        require(
            remoteBridgeAddresses[uint16(_origin.srcEid)] == _origin.sender,
            "Invalid source"
        );

        (MessageType messageType, address recipient, uint256 amount) = abi.decode(_payload, (MessageType, address, uint256));

        if (messageType == MessageType.Regular) {
            myntisToken.mint(recipient, amount);
        } else if (messageType == MessageType.ProviderReward) {
            myntisToken.mint(address(merkleDistributor), amount);
            merkleDistributor.notifyRewardFromBridge(recipient, amount);
        }

        emit MYNTReceived(_guid, recipient, amount, uint16(_origin.srcEid), messageType);
    }


    // Allow the contract to accept ETH directly.
    receive() external payable {}
    fallback() external payable {}
}
