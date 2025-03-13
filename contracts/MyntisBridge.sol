// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OApp, Origin, MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
/**
 * @dev If you need mint/burn methods, add them here:
 */
interface IMyntisToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

contract MyntisBridge is OApp {
    using SafeERC20 for IERC20;

    IMyntisToken public immutable myntisToken;
    mapping(uint16 => bytes32) public remoteBridgeAddresses;

    event MYNTBridged(address indexed user, uint256 amount, uint16 dstChainId);
    event MYNTReceived(address indexed recipient, uint256 amount, uint16 srcChainId);
    event RemoteBridgeUpdated(uint16 chainId, bytes32 bridgeAddress);

    constructor(
        address _lzEndpoint,
        address _owner,
        address _myntisToken
    )
        OApp(_lzEndpoint, _owner)
        Ownable(_owner)
    {
        myntisToken = IMyntisToken(_myntisToken);
    }

    /**
     * @dev Modifier for owner-only functions.
     */
    modifier onlyLzOwner() {
        require(msg.sender == owner(), "Not Lz owner");
        _;
    }

    /**
     * @dev Update the remote bridge address for a given chainId.
     */
    function updateRemoteBridge(uint16 chainId, bytes32 bridgeAddress) external onlyLzOwner {
        remoteBridgeAddresses[chainId] = bridgeAddress;
        emit RemoteBridgeUpdated(chainId, bridgeAddress);
    }

    /**
     * @dev Bridge MYNT to another chain.
     */
    function bridgeMYNT(uint16 dstChainId, uint256 amount, address recipient) external payable {
        require(amount > 0, "Invalid amount");
        require(remoteBridgeAddresses[dstChainId] != bytes32(0), "Dest. not set");

        // 1) Lock MYNT in this contract
        IERC20(address(myntisToken)).safeTransferFrom(msg.sender, address(this), amount);

        // 2) Encode the payload: (recipient, amount)
        bytes memory payload = abi.encode(recipient, amount);

        // 3) Send the LayerZero message
        _lzSend(
            dstChainId,
            payload,
            bytes(""), // No special extra options
            MessagingFee(msg.value, 0),
            payable(msg.sender)
        );

        emit MYNTBridged(msg.sender, amount, dstChainId);
    }

    /**
     * @dev Receives incoming cross-chain messages.
     */
    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _payload,
        address, // executor (unused)
        bytes calldata  // extraData (unused)
    ) internal override {
        (address recipient, uint256 amount) = abi.decode(_payload, (address, uint256));

        // Unlock MYNT to the recipient
        IERC20(address(myntisToken)).safeTransfer(recipient, amount);

        emit MYNTReceived(recipient, amount, uint16(_origin.srcEid));
    }
}
