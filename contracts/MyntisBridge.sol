// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
// import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

// interface IMyntisToken {
//     function mint(address to, uint256 amount) external;
//     function burn(address from, uint256 amount) external;
// }

// interface IMerkleDistributor {
//     function notifyRewardFromBridge(address provider, uint256 amount) external;
// }

// contract MyntisBridge is OApp {
//     IMyntisToken public immutable myntisToken;
//     IMerkleDistributor public immutable merkleDistributor;

//     mapping(uint16 => bytes32) public remoteBridgeAddresses;

//     enum MessageType { Regular, ProviderReward }

//     event MYNTBridged(address indexed user, uint256 amount, uint16 dstChainId, MessageType messageType);
//     event MYNTReceived(bytes32 guid, address indexed recipient, uint256 amount, uint16 srcChainId, MessageType messageType);
//     event RemoteBridgeUpdated(uint16 chainId, bytes32 bridgeAddress);

//     constructor(
//         address _lzEndpoint,
//         address _owner,
//         address _myntisToken,
//         address _merkleDistributor
//     ) OApp(_lzEndpoint, _owner) Ownable(_owner) {
//         myntisToken = IMyntisToken(_myntisToken);
//         merkleDistributor = IMerkleDistributor(_merkleDistributor);
//     }

//     modifier onlyLzOwner() {
//         require(msg.sender == owner(), "Not Lz owner");
//         _;
//     }

//     function updateRemoteBridge(uint16 chainId, bytes32 bridgeAddress) external onlyLzOwner {
//         remoteBridgeAddresses[chainId] = bridgeAddress;
//         emit RemoteBridgeUpdated(chainId, bridgeAddress);
//     }

//     function bridgeMYNT(uint16 dstChainId, uint256 amount, address recipient, bool isProviderReward) external payable {
//         require(amount > 0, "Invalid amount");
//         require(remoteBridgeAddresses[dstChainId] != bytes32(0), "Dest. not set");

//         // Burn MYNT from sender
//         myntisToken.burn(msg.sender, amount);

//         // Encode the payload with message type
//         MessageType messageType = isProviderReward ? MessageType.ProviderReward : MessageType.Regular;
//         bytes memory payload = abi.encode(messageType, recipient, amount);

//         _lzSend(
//             dstChainId,
//             payload,
//             bytes(""),
//             MessagingFee(msg.value, 0),
//             payable(msg.sender)
//         );

//         emit MYNTBridged(msg.sender, amount, dstChainId, messageType);
//     }

//     function _lzReceive(
//         Origin calldata _origin,
//         bytes32 _guid,
//         bytes calldata _payload,
//         address, // executor
//         bytes calldata // extraData
//     ) internal override {
//         require(
//             remoteBridgeAddresses[uint16(_origin.srcEid)] == _origin.sender,
//             "Invalid source"
//         );

//         (MessageType messageType, address recipient, uint256 amount) = abi.decode(_payload, (MessageType, address, uint256));

//         if (messageType == MessageType.Regular) {
//             myntisToken.mint(recipient, amount);
//         } else if (messageType == MessageType.ProviderReward) {
//             myntisToken.mint(address(merkleDistributor), amount);
//             merkleDistributor.notifyRewardFromBridge(recipient, amount);
//         }

//         emit MYNTReceived(_guid, recipient, amount, uint16(_origin.srcEid), messageType);
//     }
// }