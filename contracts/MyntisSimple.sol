// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MyntisSimple
 * @notice Simple non-upgradeable version of Myntis for testing
 * @dev 1B total supply: 800M emissions + 200M immediate allocation
 */
contract MyntisSimple is ERC20, Pausable, AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // Production: 1 Billion total supply
    uint256 private _cap;
    uint256 private _maxSupply;
    uint256 private _mintFee; // Fee for minting (in basis points)
    uint256 private _burnFee; // Fee for burning (in basis points)
    address private _feeRecipient;
    
    // Events
    event CapUpdated(uint256 oldCap, uint256 newCap);
    event MintFeeUpdated(uint256 oldFee, uint256 newFee);
    event BurnFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event TokensMinted(address indexed to, uint256 amount, uint256 fee);
    event TokensBurned(address indexed from, uint256 amount, uint256 fee);

    constructor(
        address admin,
        uint256 cap_,
        uint256 maxSupply_
    ) ERC20("Myntis", "MYNT") {
        // Production: 1 Billion total supply
        require(cap_ == 1_000_000_000 * 1e18, "Cap must be 1B");
        require(maxSupply_ == 1_000_000_000 * 1e18, "Max supply must be 1B");
        require(cap_ <= maxSupply_, "Cap exceeds max supply");
        
        _cap = cap_;
        _maxSupply = maxSupply_;
        _mintFee = 0; // 0% fee by default
        _burnFee = 0; // 0% fee by default
        _feeRecipient = admin;

        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(BURNER_ROLE, admin);
    }

    /**
     * @notice Mint tokens with fee
     * @dev Only authorized minters can mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(!paused(), "Minting is paused");
        require(totalSupply() + amount <= _cap, "Cap exceeded");
        
        uint256 fee = (amount * _mintFee) / 10000;
        uint256 netAmount = amount - fee;
        
        _mint(to, netAmount);
        
        if (fee > 0) {
            _mint(_feeRecipient, fee);
        }
        
        emit TokensMinted(to, amount, fee);
    }

    /**
     * @notice Burn tokens with fee
     * @dev Only authorized burners can burn
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        require(!paused(), "Burning is paused");
        
        if (from != msg.sender) {
            uint256 currentAllowance = allowance(from, msg.sender);
            require(currentAllowance >= amount, "insufficient allowance");
            unchecked { _approve(from, msg.sender, currentAllowance - amount); }
        }
        
        uint256 fee = (amount * _burnFee) / 10000;
        uint256 netAmount = amount - fee;
        
        _burn(from, netAmount);
        
        if (fee > 0) {
            _burn(_feeRecipient, fee);
        }
        
        emit TokensBurned(from, amount, fee);
    }

    /**
     * @notice Update the token cap
     */
    function updateCap(uint256 newCap) external onlyRole(ADMIN_ROLE) {
        require(newCap <= _maxSupply, "Cap exceeds max supply");
        uint256 oldCap = _cap;
        _cap = newCap;
        emit CapUpdated(oldCap, newCap);
    }

    /**
     * @notice Update minting fee
     */
    function updateMintFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1000, "Fee cannot exceed 10%");
        uint256 oldFee = _mintFee;
        _mintFee = newFee;
        emit MintFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Update burning fee
     */
    function updateBurnFee(uint256 newFee) external onlyRole(ADMIN_ROLE) {
        require(newFee <= 1000, "Fee cannot exceed 10%");
        uint256 oldFee = _burnFee;
        _burnFee = newFee;
        emit BurnFeeUpdated(oldFee, newFee);
    }

    /**
     * @notice Update fee recipient
     */
    function updateFeeRecipient(address newRecipient) external onlyRole(ADMIN_ROLE) {
        require(newRecipient != address(0), "Invalid recipient");
        address oldRecipient = _feeRecipient;
        _feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Override transfer to include pause check
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!paused(), "Token transfers are paused");
        return super.transfer(to, amount);
    }

    /**
     * @notice Override transferFrom to include pause check
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(!paused(), "Token transfers are paused");
        return super.transferFrom(from, to, amount);
    }

    // View functions
    function cap() public view returns (uint256) { return _cap; }
    function maxSupply() public view returns (uint256) { return _maxSupply; }
    function mintFee() public view returns (uint256) { return _mintFee; }
    function burnFee() public view returns (uint256) { return _burnFee; }
    function feeRecipient() public view returns (address) { return _feeRecipient; }

    /**
     * @notice Get contract information
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint256 cap_,
        uint256 maxSupply_,
        bool paused_,
        address admin
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            cap(),
            maxSupply(),
            paused(),
            address(0) // Admin address - would need to be tracked separately
        );
    }
}
