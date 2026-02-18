// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {IOFT} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGlobalSupplyRegistry} from "./IGlobalSupplyRegistry.sol";

/**
 * @title Myntis
 * @notice Canonical omnichain MYNT token - LayerZero V2 OFT
 * @dev Standard LayerZero V2 OFT with cross-chain bridging
 * @dev 1B total supply: 800M emissions + 200M immediate allocation
 * @dev Hub token on Base, spoke tokens on other chains
 * 
 * Features:
 * - Standard OFT send/receive with automatic burn/mint
 * - Shared decimals (6) for cross-chain compatibility  
 * - Configurable burn fee on source chain (no double-fee on cross-chain)
 * - Global supply registry integration
 * - Pausable cross-chain operations
 * 
 * LayerZero V2 Best Practices:
 * - Properly overrides _debit/_credit with correct return values
 * - Respects slippage protection after fee application
 * - Uses OApp's built-in Ownable (no duplicate inheritance)
 * - Implements IOFT interface correctly
 */
contract Myntis is OFT, Pausable {
    // ============ Roles ============
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // ============ Supply Constants ============
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18; // 1B tokens
    uint256 public constant EMISSIONS_ALLOCATION = 800_000_000 * 1e18; // 800M for emissions
    uint256 public constant IMMEDIATE_ALLOCATION = 200_000_000 * 1e18; // 200M immediate
    uint256 public constant MAX_MIGRATION_AMOUNT = 30_000_000 * 1e18; // 30M cap
    
    // ============ State ============
    uint256 public totalMintedEmissions;
    uint256 public totalMintedImmediate;
    
    // Role management
    mapping(bytes32 => mapping(address => bool)) private _roles;
    
    // Fee state (in basis points, 100 = 1%)
    // NOTE: Only burnFee is used (applied in _debit on source chain)
    // No mintFee to prevent double-fee on cross-chain transfers
    uint256 public burnFee;
    address public feeRecipient;
    
    // Global supply registry
    IGlobalSupplyRegistry public globalSupplyRegistry;
    
    // Migration state
    bool public migrationComplete;
    uint256 public totalMigrated;
    
    // Contract metadata URI (ERC-7572) - for token logo, description, etc.
    string public contractURI;
    
    // ============ Events ============
    event EmissionsMinted(address indexed to, uint256 amount, uint256 totalEmissions);
    event ImmediateMinted(address indexed to, uint256 amount, uint256 totalImmediate);
    event BurnFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);
    event GlobalSupplyRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);
    event BalanceMigrated(address indexed recipient, uint256 amount);
    event MigrationCompleted(uint256 totalMigrated);
    event ContractURIUpdated(string oldURI, string newURI);
    
    // ============ Errors ============
    error ExceedsMaxSupply();
    error ExceedsEmissionsAllocation();
    error ExceedsImmediateAllocation();
    error ZeroAddress();
    error ZeroAmount();
    error GlobalCapExceeded();
    error FeeTooHigh();
    error Unauthorized();
    error MigrationAlreadyComplete();
    error ExceedsMigrationCap();
    error LengthMismatch();
    
    // ============ Modifiers ============
    
    modifier onlyRole(bytes32 role) {
        if (!hasRole(role, msg.sender) && msg.sender != owner()) revert Unauthorized();
        _;
    }
    
    /**
     * @notice Constructor for Myntis OFT
     * @param _lzEndpoint LayerZero V2 endpoint address
     * @param _delegate Admin/owner address (OApp delegate)
     * @dev OFT already inherits Ownable via OAppCore - delegate is passed to OFT which
     *      handles Ownable initialization in its inheritance chain
     */
    constructor(
        address _lzEndpoint,
        address _delegate
    ) OFT("Myntis", "MYNT", _lzEndpoint, _delegate) Ownable(_delegate) {
        if (_delegate == address(0)) revert ZeroAddress();
        if (_lzEndpoint == address(0)) revert ZeroAddress();
        
        feeRecipient = _delegate;
        burnFee = 0;

        // Grant roles to delegate
        _roles[MINTER_ROLE][_delegate] = true;
        _roles[PAUSER_ROLE][_delegate] = true;
        
        emit RoleGranted(MINTER_ROLE, _delegate);
        emit RoleGranted(PAUSER_ROLE, _delegate);
    }
    
    // ============ Role Management ============
    
    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }
    
    function grantRole(bytes32 role, address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }
    
    function revokeRole(bytes32 role, address account) external onlyOwner {
        _roles[role][account] = false;
        emit RoleRevoked(role, account);
    }
    
    // ============ OFT Overrides (LayerZero V2 Best Practices) ============
    
    /**
     * @notice Override _debit to add pause check and burn fees
     * @dev CRITICAL: Returns correct values after fee application
     * @dev Burns tokens from sender before cross-chain send
     * @param _from Address to debit from
     * @param _amountLD Amount in local decimals
     * @param _minAmountLD Minimum amount after fees (slippage protection)
     * @param _dstEid Destination endpoint ID
     * @return amountSentLD Actual amount sent (after dust removal)
     * @return amountReceivedLD Amount that will be received on destination (after fees)
     */
    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override whenNotPaused returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        // Get dust-removed amounts from base implementation
        (amountSentLD, ) = _debitView(_amountLD, _minAmountLD, _dstEid);
        
        // Calculate fee on the amount being sent
        uint256 fee = (amountSentLD * burnFee) / 10000;
        
        // Amount received on destination is amount sent minus fee
        amountReceivedLD = amountSentLD - fee;
        
        // CRITICAL: Check slippage AFTER fee application
        // Uses IOFT.SlippageExceeded from LayerZero
        if (amountReceivedLD < _minAmountLD) {
            revert IOFT.SlippageExceeded(amountReceivedLD, _minAmountLD);
        }
        
        // Transfer fee to recipient (if any)
        if (fee > 0 && feeRecipient != address(0)) {
            _transfer(_from, feeRecipient, fee);
        }
        
        // Burn the net amount (what will be minted on destination)
        _burn(_from, amountReceivedLD);
        
        // Record burn in global registry
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordBurn(amountReceivedLD);
        }
        
        // Return correct values: amountSentLD is total taken from user, amountReceivedLD is what arrives
        return (amountSentLD, amountReceivedLD);
    }
    
    /**
     * @notice Override _credit to add pause check and supply cap
     * @dev CRITICAL: Checks MAX_SUPPLY to prevent exceeding 1B via cross-chain
     * @dev Mints tokens to recipient on cross-chain receive
     * @dev NOTE: No fee applied here - fee is already deducted in _debit on source chain
     *      to prevent double-fee charging on cross-chain transfers
     * @param _to Address to credit
     * @param _amountLD Amount in local decimals (from source chain, already net of burnFee)
     * @param _srcEid Source endpoint ID
     * @return amountReceivedLD Amount actually credited (same as input, no additional fee)
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) internal virtual override whenNotPaused returns (uint256 amountReceivedLD) {
        // Handle zero address (LayerZero standard)
        if (_to == address(0x0)) _to = address(0xdead);
        
        // No fee applied here - burnFee was already applied in _debit on source chain
        // This prevents double-fee charging on cross-chain transfers
        amountReceivedLD = _amountLD;
        
        // CRITICAL: Check MAX_SUPPLY before minting
        if (totalSupply() + amountReceivedLD > MAX_SUPPLY) {
            revert ExceedsMaxSupply();
        }
        
        // Check global cap if registry is set
        if (address(globalSupplyRegistry) != address(0)) {
            if (!globalSupplyRegistry.canMint(amountReceivedLD)) revert GlobalCapExceeded();
        }
        
        // Mint full amount to recipient (fee was already taken on source chain)
        _mint(_to, amountReceivedLD);
        
        // Record mint in global registry
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordMint(amountReceivedLD);
        }
        
        return amountReceivedLD;
    }
    
    /**
     * @notice Override _debitView to include fee in quote calculation
     * @dev Provides accurate quote including fees for UI/frontend
     */
    function _debitView(
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal view virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        // Get base dust-removed amount
        (amountSentLD, amountReceivedLD) = super._debitView(_amountLD, _minAmountLD, _dstEid);
        
        // Apply burn fee to get actual received amount
        uint256 fee = (amountSentLD * burnFee) / 10000;
        amountReceivedLD = amountSentLD - fee;
        
        // Note: Base _debitView already checks minAmountLD, but that's before fees
        // The actual check with fees happens in _debit()
    }
    
    // ============ Minting Functions ============
    
    /**
     * @notice Mint tokens from emissions allocation (for staking rewards)
     * @dev Only MINTER_ROLE can call (Emissions contract)
     * @param _to Recipient address
     * @param _amount Amount to mint
     */
    function mint(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mintEmissions(_to, _amount);
    }
    
    /**
     * @notice Mint tokens from emissions allocation (alias for compatibility)
     */
    function mintEmissions(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mintEmissions(_to, _amount);
    }
    
    /**
     * @notice Mint tokens from immediate allocation (team, treasury, etc.)
     * @dev Only owner can call
     * @param _to Recipient address  
     * @param _amount Amount to mint
     */
    function mintImmediate(address _to, uint256 _amount) external onlyOwner whenNotPaused {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (totalMintedImmediate + _amount > IMMEDIATE_ALLOCATION) revert ExceedsImmediateAllocation();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        if (address(globalSupplyRegistry) != address(0)) {
            if (!globalSupplyRegistry.canMint(_amount)) revert GlobalCapExceeded();
        }
        
        totalMintedImmediate += _amount;
        _mint(_to, _amount);
        
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordMint(_amount);
        }
        
        emit ImmediateMinted(_to, _amount, totalMintedImmediate);
    }
    
    // ============ Migration Functions ============
    
    /**
     * @notice Migrate token balances from old contract (one-time operation)
     * @dev Only owner can call. Used to migrate ~12.8M tokens from old contract.
     * @dev Counts migrated tokens against emissions allocation to preserve tokenomics.
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to mint to each recipient
     */
    function migrateMint(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        if (migrationComplete) revert MigrationAlreadyComplete();
        if (recipients.length != amounts.length) revert LengthMismatch();
        
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) continue; // Skip zero amounts

            totalMigrated += amounts[i];
            if (totalMigrated > MAX_MIGRATION_AMOUNT) revert ExceedsMigrationCap();
            
            if (totalSupply() + amounts[i] > MAX_SUPPLY) revert ExceedsMaxSupply();
            if (totalMintedEmissions + amounts[i] > EMISSIONS_ALLOCATION) revert ExceedsEmissionsAllocation();

            if (address(globalSupplyRegistry) != address(0)) {
                if (!globalSupplyRegistry.canMint(amounts[i])) revert GlobalCapExceeded();
                globalSupplyRegistry.recordMint(amounts[i]);
            }
            
            totalMintedEmissions += amounts[i];
            _mint(recipients[i], amounts[i]);
            
            emit BalanceMigrated(recipients[i], amounts[i]);
        }
    }
    
    /**
     * @notice Complete the migration and prevent further migration mints
     * @dev Only owner can call. Should be called after all balances are migrated.
     */
    function completeMigration() external onlyOwner {
        if (migrationComplete) revert MigrationAlreadyComplete();
        migrationComplete = true;
        emit MigrationCompleted(totalMintedEmissions);
    }
    
    /**
     * @notice Burn tokens from sender's balance
     * @param _amount Amount to burn
     */
    function burn(uint256 _amount) external whenNotPaused {
        if (_amount == 0) revert ZeroAmount();
        _burn(msg.sender, _amount);
        
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordBurn(_amount);
        }
    }
    
    /**
     * @notice Burn tokens from specified address (with approval)
     * @param _from Address to burn from
     * @param _amount Amount to burn
     */
    function burnFrom(address _from, uint256 _amount) external whenNotPaused {
        if (_amount == 0) revert ZeroAmount();
        _spendAllowance(_from, msg.sender, _amount);
        _burn(_from, _amount);
        
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordBurn(_amount);
        }
    }
    
    // ============ Admin Functions ============
    
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    function setBurnFee(uint256 _newFee) external onlyOwner {
        if (_newFee > 1000) revert FeeTooHigh(); // Max 10%
        uint256 oldFee = burnFee;
        burnFee = _newFee;
        emit BurnFeeUpdated(oldFee, _newFee);
    }
    
    function setFeeRecipient(address _newRecipient) external onlyOwner {
        if (_newRecipient == address(0)) revert ZeroAddress();
        address oldRecipient = feeRecipient;
        feeRecipient = _newRecipient;
        emit FeeRecipientUpdated(oldRecipient, _newRecipient);
    }
    
    function setGlobalSupplyRegistry(address _registry) external onlyOwner {
        if (_registry == address(0)) revert ZeroAddress();
        require(_registry.code.length > 0, "Registry must be a contract");
        address previous = address(globalSupplyRegistry);
        globalSupplyRegistry = IGlobalSupplyRegistry(_registry);
        emit GlobalSupplyRegistryUpdated(previous, _registry);
    }
    
    /**
     * @notice Set the contract metadata URI (ERC-7572)
     * @param _contractURI URI pointing to JSON metadata (logo, description, etc.)
     * @dev Can be IPFS, HTTPS, or data URI. Example: "ipfs://Qm..." or "https://myntis.com/metadata.json"
     * @dev JSON format: { "name": "Myntis", "symbol": "MYNT", "image": "ipfs://...", "description": "..." }
     */
    function setContractURI(string calldata _contractURI) external onlyOwner {
        string memory oldURI = contractURI;
        contractURI = _contractURI;
        emit ContractURIUpdated(oldURI, _contractURI);
    }
    
    // ============ View Functions ============
    
    function remainingEmissions() external view returns (uint256) {
        return EMISSIONS_ALLOCATION - totalMintedEmissions;
    }
    
    function remainingImmediate() external view returns (uint256) {
        return IMMEDIATE_ALLOCATION - totalMintedImmediate;
    }
    
    function isHub() external pure returns (bool) {
        return true;
    }
    
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

    function _mintEmissions(address _to, uint256 _amount) internal {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (totalMintedEmissions + _amount > EMISSIONS_ALLOCATION) revert ExceedsEmissionsAllocation();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        // Check global supply cap
        if (address(globalSupplyRegistry) != address(0)) {
            if (!globalSupplyRegistry.canMint(_amount)) revert GlobalCapExceeded();
        }
        
        totalMintedEmissions += _amount;
        _mint(_to, _amount);
        
        // Record in global registry
        if (address(globalSupplyRegistry) != address(0)) {
            globalSupplyRegistry.recordMint(_amount);
        }
        
        emit EmissionsMinted(_to, _amount, totalMintedEmissions);
    }
}
