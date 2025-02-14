// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IMyntisToken {
    function mint(address to, uint256 amount) external;
}

contract MyntisBridgeL2 is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    IMyntisToken public immutable myntisToken;
    
    // Mapping to track processed deposit IDs to prevent double minting.
    mapping(uint256 => bool) public processedDeposits;

    event Minted(address indexed provider, uint256 amount, uint256 depositId);

    constructor(address _myntisToken, address admin) {
        require(_myntisToken != address(0), "Invalid token address");
        myntisToken = IMyntisToken(_myntisToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    /**
     * @notice Operator completes a deposit from L1 by minting tokens on L2.
     * @param provider The provider who deposited tokens on L1.
     * @param amount The amount to mint.
     * @param depositId The unique deposit ID from L1.
     */
    function completeDeposit(address provider, uint256 amount, uint256 depositId) external onlyRole(OPERATOR_ROLE) {
        require(!processedDeposits[depositId], "Deposit already processed");
        processedDeposits[depositId] = true;
        myntisToken.mint(provider, amount);
        emit Minted(provider, amount, depositId);
    }
}
