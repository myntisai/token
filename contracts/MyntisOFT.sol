// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MyntisOFT
 * @notice Official Myntis token with LayerZero V2 OFT standard
 * @dev Hub token deployed on Base - handles minting/emissions
 * @dev Spoke tokens on other chains receive/send via OFT standard
 * 
 * Tokenomics:
 * - Total Supply Cap: 1,000,000,000 MYNT (1 Billion)
 * - 800M via emissions (minted over time)
 * - 200M immediate allocation (team, treasury, etc.)
 */
contract MyntisOFT is OFT, AccessControl, Pausable {
    
    // ============ Roles ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // ============ Supply Constants ============
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18; // 1B tokens
    uint256 public constant EMISSIONS_ALLOCATION = 800_000_000 * 1e18; // 800M for emissions
    uint256 public constant IMMEDIATE_ALLOCATION = 200_000_000 * 1e18; // 200M immediate
    
    // ============ State ============
    uint256 public totalMintedEmissions;
    uint256 public totalMintedImmediate;
    
    // ============ Events ============
    event EmissionsMinted(address indexed to, uint256 amount, uint256 totalEmissions);
    event ImmediateMinted(address indexed to, uint256 amount, uint256 totalImmediate);
    
    // ============ Errors ============
    error ExceedsMaxSupply();
    error ExceedsEmissionsAllocation();
    error ExceedsImmediateAllocation();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidEndpoint();
    
    /**
     * @notice Constructor for MyntisOFT
     * @param _lzEndpoint LayerZero V2 endpoint address
     * @param _delegate Admin address for OApp configuration
     */
    constructor(
        address _lzEndpoint,
        address _delegate
    ) OFT("Myntis", "MYNT", _lzEndpoint, _delegate) Ownable(_delegate) {
        if (_lzEndpoint == address(0)) revert InvalidEndpoint();
        if (_delegate == address(0)) revert ZeroAddress();
        
        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _delegate);
        _grantRole(MINTER_ROLE, _delegate);
        _grantRole(PAUSER_ROLE, _delegate);
    }
    
    // ============ Minting Functions ============
    
    /**
     * @notice Mint tokens from emissions allocation (for staking rewards)
     * @dev Only MINTER_ROLE can call (Emissions contract)
     * @param _to Recipient address
     * @param _amount Amount to mint
     */
    function mintEmissions(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (totalMintedEmissions + _amount > EMISSIONS_ALLOCATION) revert ExceedsEmissionsAllocation();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        totalMintedEmissions += _amount;
        _mint(_to, _amount);
        
        emit EmissionsMinted(_to, _amount, totalMintedEmissions);
    }
    
    /**
     * @notice Mint tokens from immediate allocation (team, treasury, etc.)
     * @dev Only DEFAULT_ADMIN_ROLE can call
     * @param _to Recipient address  
     * @param _amount Amount to mint
     */
    function mintImmediate(address _to, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (totalMintedImmediate + _amount > IMMEDIATE_ALLOCATION) revert ExceedsImmediateAllocation();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        totalMintedImmediate += _amount;
        _mint(_to, _amount);
        
        emit ImmediateMinted(_to, _amount, totalMintedImmediate);
    }
    
    /**
     * @notice Legacy mint function for backward compatibility
     * @dev Uses emissions allocation by default
     */
    function mint(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (totalMintedEmissions + _amount > EMISSIONS_ALLOCATION) revert ExceedsEmissionsAllocation();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        totalMintedEmissions += _amount;
        _mint(_to, _amount);
        
        emit EmissionsMinted(_to, _amount, totalMintedEmissions);
    }
    
    /**
     * @notice Burn tokens from sender's balance
     * @param _amount Amount to burn
     */
    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
    
    /**
     * @notice Burn tokens from specified address (with approval)
     * @param _from Address to burn from
     * @param _amount Amount to burn
     */
    function burnFrom(address _from, uint256 _amount) external {
        _spendAllowance(_from, msg.sender, _amount);
        _burn(_from, _amount);
    }
    
    // ============ Pause Functions ============
    
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get remaining emissions allocation
     */
    function remainingEmissions() external view returns (uint256) {
        return EMISSIONS_ALLOCATION - totalMintedEmissions;
    }
    
    /**
     * @notice Get remaining immediate allocation
     */
    function remainingImmediate() external view returns (uint256) {
        return IMMEDIATE_ALLOCATION - totalMintedImmediate;
    }
    
    /**
     * @notice Check if this is a hub or spoke
     * @return isHub Always true for hub contract
     */
    function isHub() external pure returns (bool) {
        return true;
    }
    
    /**
     * @notice Get contract info for UI/debugging
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint256 maxSupply_,
        uint256 emissionsMinted_,
        uint256 immediateMinted_,
        bool paused_
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            MAX_SUPPLY,
            totalMintedEmissions,
            totalMintedImmediate,
            paused()
        );
    }
    
    // ============ Override for Pausable ============
    
    /**
     * @notice Override _debit to check pause state before cross-chain send
     */
    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override whenNotPaused returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        return super._debit(_from, _amountLD, _minAmountLD, _dstEid);
    }
    
    /**
     * @notice Override _credit to check pause state before receiving cross-chain
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) internal virtual override whenNotPaused returns (uint256 amountReceivedLD) {
        return super._credit(_to, _amountLD, _srcEid);
    }
    
    // ============ ERC165 Support ============
    
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

