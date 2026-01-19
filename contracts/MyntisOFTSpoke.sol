// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MyntisOFTSpoke
 * @notice Spoke-side Myntis OFT token for non-hub chains
 * @dev Proper LayerZero V2 OFT implementation
 * @dev Compatible with MyntisOFT hub on Base
 * 
 * Key differences from Hub:
 * - MINTER_ROLE allows SpokeDistributor to mint tokens for claims
 * - AccessControl for role-based permissions
 * - Same OFT standard = full compatibility
 */
contract MyntisOFTSpoke is OFT, Pausable, AccessControl {
    
    // ============ Roles ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // ============ State ============
    uint32 public immutable hubChainEid;  // LayerZero EID of hub chain (Base)
    
    // SECURITY FIX: Track total emergency mints
    uint256 public totalEmergencyMinted;
    
    // ============ Constants ============
    uint256 public constant EMERGENCY_MINT_LIMIT = 1_000_000 * 1e18; // 1M per tx limit
    uint256 public constant MAX_TOTAL_EMERGENCY = 10_000_000 * 1e18; // 10M lifetime cap
    
    // ============ Events ============
    event EmergencyMint(address indexed to, uint256 amount, string reason);
    event EmergencyBurn(address indexed from, uint256 amount, string reason);
    event SupplyChangeRequiresReporting(uint256 newTotalSupply, uint32 hubChainEid);
    
    // ============ Errors ============
    error ZeroAddress();
    error ZeroAmount();
    error ExceedsEmergencyLimit();
    error ExceedsTotalEmergencyLimit();
    error InvalidEndpoint();
    
    /**
     * @notice Constructor for MyntisOFTSpoke
     * @param _lzEndpoint LayerZero V2 endpoint address on this chain
     * @param _delegate Admin/owner address
     * @param _hubChainEid LayerZero EID of the hub chain (Base)
     */
    constructor(
        address _lzEndpoint,
        address _delegate,
        uint32 _hubChainEid
    ) OFT("Myntis", "MYNT", _lzEndpoint, _delegate) Ownable(_delegate) {
        if (_lzEndpoint == address(0)) revert InvalidEndpoint();
        if (_delegate == address(0)) revert ZeroAddress();
        hubChainEid = _hubChainEid;
        
        // Grant admin role to delegate for role management
        _grantRole(DEFAULT_ADMIN_ROLE, _delegate);
    }
    
    // ============ Minting (MINTER_ROLE) ============
    
    /**
     * @notice Mint tokens - used by SpokeDistributor for reward claims
     * @dev Requires MINTER_ROLE (granted to SpokeDistributor)
     * @param _to Recipient address
     * @param _amount Amount to mint
     */
    function mint(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        _mint(_to, _amount);
    }
    
    // ============ Emergency Functions (Admin Only) ============
    
    /**
     * @notice Emergency mint - ONLY for bridge recovery scenarios
     * @dev Should almost never be used - OFT handles minting automatically
     * @dev Limited to 1M tokens per transaction and 10M total lifetime
     * @dev SECURITY FIX: Added global cap and supply reporting
     * @param _to Recipient address
     * @param _amount Amount to mint (max 1M per tx, 10M total)
     * @param _reason Reason for emergency mint (logged)
     */
    function emergencyMint(
        address _to, 
        uint256 _amount, 
        string calldata _reason
    ) external onlyOwner {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (_amount > EMERGENCY_MINT_LIMIT) revert ExceedsEmergencyLimit();
        
        // SECURITY FIX: Check lifetime cap
        if (totalEmergencyMinted + _amount > MAX_TOTAL_EMERGENCY) {
            revert ExceedsTotalEmergencyLimit();
        }
        
        // SECURITY FIX: Track total emergency mints
        totalEmergencyMinted += _amount;
        
        _mint(_to, _amount);
        emit EmergencyMint(_to, _amount, _reason);
        
        // SECURITY FIX: Emit supply change for registry sync
        emit SupplyChangeRequiresReporting(totalSupply(), hubChainEid);
    }
    
    /**
     * @notice Emergency burn from owner's own balance
     * @dev Only owner can burn their own tokens in emergency
     * @dev Cannot burn from other addresses (security)
     * @param _amount Amount to burn
     * @param _reason Reason for emergency burn (logged)
     */
    function emergencyBurn(
        uint256 _amount, 
        string calldata _reason
    ) external onlyOwner {
        if (_amount == 0) revert ZeroAmount();
        
        _burn(msg.sender, _amount);
        emit EmergencyBurn(msg.sender, _amount, _reason);
    }
    
    // ============ User Functions ============
    
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
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get spoke contract info
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint32 hubEid_,
        bool paused_
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            hubChainEid,
            paused()
        );
    }
    
    /**
     * @notice Check if this is a hub or spoke
     * @return isHub Always false for spoke contracts
     */
    function isHub() external pure returns (bool) {
        return false;
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
    
    // ============ Override for AccessControl ============
    
    /**
     * @notice Override supportsInterface to support AccessControl
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

