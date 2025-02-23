// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IRouterClient} from "@chainlink/contracts/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts/src/v0.8/ccip/libraries/Client.sol";

contract MyntisBridgeL1 {
    using SafeERC20 for IERC20;

    IERC20 public immutable myntisToken;
    IRouterClient public ccipRouter;
    uint64 public l2ChainSelector; // CCIP numeric chain ID for L2
    address public l2Receiver;

    event Deposit(address indexed provider, uint256 amount, uint256 depositId, bytes32 messageId);
    
    uint256 public depositCounter;

    constructor(address _token, address _ccipRouter, uint64 _l2ChainSelector, address _l2Receiver) {
        require(_token != address(0) && _ccipRouter != address(0), "Invalid addresses");
        myntisToken = IERC20(_token);
        ccipRouter = IRouterClient(_ccipRouter);
        l2ChainSelector = _l2ChainSelector;
        l2Receiver = _l2Receiver;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        myntisToken.safeTransferFrom(msg.sender, address(this), amount);
        depositCounter++;

        // Encode the deposit message for CCIP.
        bytes memory messageData = abi.encode(msg.sender, amount, depositCounter);

        // Create an empty array for token transfers.
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](0);

        // Create the message struct using the correct type from the Client library.
        Client.EVM2AnyMessage memory messageStruct = Client.EVM2AnyMessage({
            receiver: abi.encode(l2Receiver),
            data: messageData,
            tokenAmounts: tokenAmounts,
            feeToken: address(0),   // Using address(0) because fee is paid via msg.value.
            extraArgs: ""           // Empty bytes will default to a 200k gas limit.
        });

        // Send the message to L2 using CCIP.
        bytes32 messageId = ccipRouter.ccipSend(l2ChainSelector, messageStruct);
        
        emit Deposit(msg.sender, amount, depositCounter, messageId);
    }
}
