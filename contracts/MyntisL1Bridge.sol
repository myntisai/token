// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract MyntisBridgeL1 is AccessControl {
    using SafeERC20 for IERC20;
    
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    IERC20 public immutable myntisToken;

    // Event emitted when tokens are deposited for bridging.
    event Deposit(address indexed provider, uint256 amount, uint256 depositId);
    
    uint256 public depositCounter;
    // Track processed deposits to avoid double spending.
    mapping(uint256 => bool) public processedDeposits;

    constructor(address _myntisToken, address admin) {
        require(_myntisToken != address(0), "Invalid token address");
        myntisToken = IERC20(_myntisToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    /**
     * @notice Provider deposits tokens to bridge to an L2.
     * Tokens are locked in this contract.
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        myntisToken.safeTransferFrom(msg.sender, address(this), amount);
        depositCounter++;
        emit Deposit(msg.sender, amount, depositCounter);
    }
    
    /**
     * @notice Operator unlocks tokens for withdrawal back to L1 (if needed).
     * This function is used in the withdrawal process.
     */
    function unlock(address user, uint256 amount, uint256 depositId) external onlyRole(OPERATOR_ROLE) {
        require(!processedDeposits[depositId], "Deposit already processed");
        processedDeposits[depositId] = true;
        myntisToken.safeTransfer(user, amount);
    }
}
