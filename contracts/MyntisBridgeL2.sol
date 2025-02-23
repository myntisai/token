// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "@chainlink/contracts/src/v0.8/ccip/interfaces/IRouterClient.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
}

contract MyntisBridgeL2 {
    IRouterClient public ccipRouter;
    IMyntisToken public immutable myntisToken;

    mapping(uint256 => bool) public processedDeposits;

    event Minted(address indexed provider, uint256 amount, uint256 depositId);

    constructor(address _token, address _ccipRouter) {
        require(_token != address(0) && _ccipRouter != address(0), "Invalid addresses");
        myntisToken = IMyntisToken(_token);
        ccipRouter = IRouterClient(_ccipRouter);
    }

    function ccipReceive(bytes calldata message) external {
        (address provider, uint256 amount, uint256 depositId) = abi.decode(message, (address, uint256, uint256));

        require(!processedDeposits[depositId], "Deposit already processed");
        processedDeposits[depositId] = true;

        myntisToken.mint(provider, amount);
        emit Minted(provider, amount, depositId);
    }
}
