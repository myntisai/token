// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
// import { LzLib } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/LzLib.sol"; // Keep commented unless needed
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

    // Using uint32 to represent the full LayerZero endpoint id (EID) instead of truncating to uint16
    mapping(uint32 => bytes32) public remoteBridgeAddresses;

    enum MessageType { Regular, ProviderReward }

    event LogStep(uint8 indexed step, string message);
    // Emitting uint32 for destination EID now
    event MYNTBridged(address indexed user, uint256 amount, uint32 dstEid, MessageType messageType);
    // Emitting uint32 for source EID directly
    event MYNTReceived(bytes32 guid, address indexed recipient, uint256 amount, uint32 srcEid, MessageType messageType);
    event RemoteBridgeUpdated(uint32 eid, bytes32 bridgeAddress);
    // Inherits PeerUpdated event from OApp (which uses EID)

    constructor(
        address _lzEndpoint,
        address _owner,
        address _myntisToken,
        address _merkleDistributor
    ) OApp(_lzEndpoint, _owner) Ownable(_owner) {
        myntisToken = IMyntisToken(_myntisToken);
        merkleDistributor = IMerkleDistributor(_merkleDistributor);
    }

    // Update the remote bridge mapping for a given destination EID
    function updateRemoteBridge(uint32 remoteEid, bytes32 bridgeAddress) external onlyOwner {
        remoteBridgeAddresses[remoteEid] = bridgeAddress;
        emit RemoteBridgeUpdated(remoteEid, bridgeAddress);
    }
    error BridgeError(string reason);

    // Bridge function takes uint32 dstEid (LayerZero endpoint id) directly
    function bridgeMYNT(uint32 dstEid, uint256 amount, address recipient, bool isProviderReward) external payable {
        emit LogStep(1, "Starting bridgeMYNT execution");
        require(amount > 0, "Amount must be greater than zero");

        // Check that the remote bridge is set for the given destination EID
        require(remoteBridgeAddresses[dstEid] != bytes32(0), "Destination remote bridge not set for EID");

        // (Optional) Peer check can be added here if needed. For now, it's omitted.
        emit LogStep(2, "Pre-checks passed (remote bridge configured for EID)");

        // --- Direct Token Burn (Gas Optimized) ---
        try myntisToken.burn(msg.sender, amount) {
            emit LogStep(3, "Token burn succeeded");
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert("Token burn failed: Unknown error");
        }

        // --- Prepare Payload ---
        MessageType messageType = isProviderReward ? MessageType.ProviderReward : MessageType.Regular;
        bytes memory payload = abi.encode(messageType, recipient, amount);
        emit LogStep(4, "Payload encoded");

        // --- Prepare Adapter Parameters ---
        uint256 gasForDestination = 600000;
        // Using abi.encode to match adapter requirements
        bytes memory adapterParams = abi.encode(uint16(1), gasForDestination);
        emit LogStep(5, "Adapter parameters set");

        // --- Dispatch the LayerZero Message ---
        // Convert the full dstEid (uint32) to a uint16 if needed by _lzSend. Depending on OApp,
        // you may need to adjust this. Here we assume _lzSend expects a uint16.
        uint16 dstChainId = uint16(dstEid);
        try this._sendLayerZero(
            dstChainId,       // Pass converted value
            payload,
            adapterParams,
            msg.value,        // Native fee provided
            msg.sender        // Refund address
        ) {
            emit LogStep(6, "LayerZero message dispatch initiated via _sendLayerZero wrapper");
        } catch Error(string memory reason) {
            revert(reason);
        } catch {
            revert("LayerZero message failed: Unknown error during _sendLayerZero call");
        }

        emit MYNTBridged(msg.sender, amount, dstEid, messageType);
        emit LogStep(7, "bridgeMYNT execution completed");
    }

    // Public wrapper function to allow try/catch handling
    function _sendLayerZero(
        uint16 dstChainId,      // Now represents the converted endpoint id (uint16) from dstEid
        bytes memory payload,
        bytes memory adapterParams, // Adapter options
        uint256 fee,            // Native fee
        address refundAddress
    ) public {
        // Calls the inherited _lzSend function from OApp.
        // Make sure these parameters match the expected input for your version of OApp.sol
        _lzSend(
            dstChainId,
            payload,
            adapterParams,
            MessagingFee(fee, 0),
            payable(refundAddress)
        );
    }

    // _lzReceive: Handles incoming LayerZero messages
    function _lzReceive(
        Origin calldata _origin, // Contains srcEid (uint32) and sender (bytes32)
        bytes32 _guid,
        bytes calldata _payload,
        address, // executor (not used)
        bytes calldata // extraData (not used)
    ) internal override {
        // Use the full srcEid as a uint32
        uint32 srcEid = _origin.srcEid;
        require(
            remoteBridgeAddresses[srcEid] == _origin.sender,
            "LZ_RECEIVE_INVALID_REMOTE_SENDER"
        );
        // Peer check using full 32-bit EID
        require(
            peers[srcEid] == _origin.sender,
            "LZ_RECEIVE_INVALID_PEER_SENDER"
        );

        (MessageType messageType, address recipient, uint256 amount) = abi.decode(_payload, (MessageType, address, uint256));

        if (messageType == MessageType.Regular) {
            myntisToken.mint(recipient, amount);
        } else if (messageType == MessageType.ProviderReward) {
            myntisToken.mint(address(merkleDistributor), amount);
            merkleDistributor.notifyRewardFromBridge(recipient, amount);
        }

        emit MYNTReceived(_guid, recipient, amount, srcEid, messageType);
    }

    // Allow contract to accept ETH directly.
    receive() external payable {}
    fallback() external payable {}

    // Helper: View remote bridge address by EID (uint32)
    function getRemoteBridge(uint32 eid) external view returns (bytes32) {
        return remoteBridgeAddresses[eid];
    }
}
