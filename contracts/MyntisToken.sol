// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract MyntisToken is ERC20, Pausable, AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // Custom cap variable (immutable so it cannot be changed after deployment)
    uint256 private immutable _cap;

    constructor(address admin) ERC20("Myntis", "MYNT") {
        _cap = 1_000_000_000 * 1e18; // Cap set to 1 billion tokens (with 18 decimals)
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    /// @notice Returns the maximum supply cap.
    function cap() public view returns (uint256) {
        return _cap;
    }

    /**
     * @notice Mints tokens to a specified address.
     * @dev Minting is blocked when the contract is paused.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(!paused(), "Minting is paused");
        require(totalSupply() + amount <= cap(), "Cap exceeded");
        _mint(to, amount);
    }

    /// @notice Pauses all token transfers and minting.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /// @notice Unpauses token transfers and minting.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Override transfer to include a pause check.
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!paused(), "Token transfers are paused");
        return super.transfer(to, amount);
    }

    /// @notice Override transferFrom to include a pause check.
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(!paused(), "Token transfers are paused");
        return super.transferFrom(from, to, amount);
    }
}
