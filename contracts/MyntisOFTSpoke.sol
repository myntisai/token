// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {
    MessagingParams,
    MessagingReceipt,
    MessagingFee
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
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
    uint32 public immutable hubChainEid;   // LayerZero EID of hub chain (Base)
    uint32 public immutable localChainEid; // LayerZero EID of this spoke chain

    struct SupplyUpdate {
        uint32 chainId;
        uint256 supplyDelta;
        uint256 newTotalSupply;
        uint256 nonce;
    }

    struct QuotaRequest {
        uint32 chainId;
        uint256 requestedQuota;
        uint256 newTotalSupply;
        uint256 nonce;
        uint256 consumedQuota;
    }

    // Registry + quota tracking
    uint256 public supplyUpdateNonce;
    uint256 public mintQuota;
    address public quotaReceiver;
    uint256 public quotaReceiverUpdateDelay;
    address public pendingQuotaReceiver;
    uint256 public pendingQuotaReceiverEta;
    uint256 public quotaConsumedSinceLastRequest;
    uint256 public pendingQuotaRequestNonce;
    uint256 public pendingQuotaConsumed;
    bytes32 public registryPeer; // GlobalSupplyRegistry address on hub chain

    // Optional auto-reporting of supply updates
    bool public autoReportSupply;
    bytes public supplyUpdateOptions;
    address public supplyUpdateRefundAddress;
    
    // SECURITY FIX: Track total emergency mints
    uint256 public totalEmergencyMinted;
    bool public enforceSupplyReporting;
    uint256 public maxQuotaIncrease;
    
    // ============ Constants ============
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18; // 1B global cap
    uint256 public constant EMERGENCY_MINT_LIMIT = 1_000_000 * 1e18; // 1M per tx limit
    uint256 public constant MAX_TOTAL_EMERGENCY = 10_000_000 * 1e18; // 10M lifetime cap
    
    // ============ Events ============
    event EmergencyMint(address indexed to, uint256 amount, string reason);
    event EmergencyBurn(address indexed from, uint256 amount, string reason);
    event SupplyChangeRequiresReporting(uint256 newTotalSupply, uint32 hubChainEid);
    event SupplyUpdateSkipped(uint32 indexed chainId, uint256 totalSupply, uint256 requiredFee, uint256 availableBalance);
    event SupplyUpdateOptionsSet(bytes options, address refundAddress);
    event AutoReportSupplyUpdated(bool enabled);
    event MintQuotaIncreased(uint256 amount, uint256 newQuota);
    event MintQuotaUsed(uint256 amount, uint256 remainingQuota);
    event QuotaReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    event QuotaReceiverUpdateScheduled(address indexed newReceiver, uint256 eta);
    event QuotaReceiverUpdateDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event PendingQuotaRequestCleared(uint256 nonce, uint256 consumed);
    event MaxQuotaIncreaseUpdated(uint256 oldValue, uint256 newValue);
    event SupplyReportingEnforcedUpdated(bool enabled);
    
    // ============ Errors ============
    error ZeroAddress();
    error ZeroAmount();
    error ExceedsEmergencyLimit();
    error ExceedsTotalEmergencyLimit();
    error ExceedsMaxSupply();
    error InvalidEndpoint();
    error RegistryNotSet();
    error InvalidQuotaReceiver();
    error UnauthorizedQuotaReceiver();
    error InvalidQuotaNonce();
    error InsufficientFee(uint256 required, uint256 provided);
    error InsufficientReportingFee(uint256 required, uint256 available);
    error QuotaExceeded(uint256 requested, uint256 available);
    error QuotaIncreaseTooLarge(uint256 requested, uint256 max);
    error PendingQuotaRequest(uint256 nonce);
    error NoPendingQuotaRequest();
    error NoPendingQuotaReceiver();
    error QuotaReceiverUpdateNotReady(uint256 eta);
    error SupplyReportingDisabled();
    error SupplyReportingConfigMissing();

    uint8 public constant MSG_SUPPLY_UPDATE = 1;
    uint8 public constant MSG_QUOTA_REQUEST = 2;
    
    /**
     * @notice Constructor for MyntisOFTSpoke
     * @param _lzEndpoint LayerZero V2 endpoint address on this chain
     * @param _delegate Admin/owner address
     * @param _hubChainEid LayerZero EID of the hub chain (Base)
     */
    constructor(
        address _lzEndpoint,
        address _delegate,
        uint32 _hubChainEid,
        uint32 _localChainEid
    ) OFT("Myntis", "MYNT", _lzEndpoint, _delegate) Ownable(_delegate) {
        if (_lzEndpoint == address(0)) revert InvalidEndpoint();
        if (_delegate == address(0)) revert ZeroAddress();
        if (_hubChainEid == 0 || _localChainEid == 0) revert InvalidEndpoint();
        hubChainEid = _hubChainEid;
        localChainEid = _localChainEid;
        
        // Grant admin role to delegate for role management
        _grantRole(DEFAULT_ADMIN_ROLE, _delegate);
        quotaReceiverUpdateDelay = 1 days;
        enforceSupplyReporting = true;
        maxQuotaIncrease = 50_000_000 * 1e18;
    }
    
    // ============ Minting (MINTER_ROLE) ============
    
    /**
     * @notice Mint tokens - used by SpokeDistributor for reward claims
     * @dev Requires MINTER_ROLE (granted to SpokeDistributor)
     * @param _to Recipient address
     * @param _amount Amount to mint
     */
    function mint(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        if (_to == address(0)) revert ZeroAddress();
        if (_amount == 0) revert ZeroAmount();
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        _consumeQuota(_amount);
        _mint(_to, _amount);
        _notifySupplyChange();
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
        if (totalSupply() + _amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        
        // SECURITY FIX: Check lifetime cap
        if (totalEmergencyMinted + _amount > MAX_TOTAL_EMERGENCY) {
            revert ExceedsTotalEmergencyLimit();
        }
        
        // SECURITY FIX: Track total emergency mints
        totalEmergencyMinted += _amount;
        _consumeQuota(_amount);
        _mint(_to, _amount);
        emit EmergencyMint(_to, _amount, _reason);

        // SECURITY FIX: Emit supply change for registry sync
        _notifySupplyChange();
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
        _notifySupplyChange();
    }
    
    // ============ User Functions ============
    
    /**
     * @notice Burn tokens from sender's balance
     * @param _amount Amount to burn
     */
    function burn(uint256 _amount) external whenNotPaused {
        _burn(msg.sender, _amount);
        _notifySupplyChange();
    }
    
    /**
     * @notice Burn tokens from specified address (with approval)
     * @param _from Address to burn from
     * @param _amount Amount to burn
     */
    function burnFrom(address _from, uint256 _amount) external whenNotPaused {
        _spendAllowance(_from, msg.sender, _amount);
        _burn(_from, _amount);
        _notifySupplyChange();
    }

    // ============ Registry / Quota Config ============

    function setRegistryPeer(bytes32 _registryPeer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        registryPeer = _registryPeer;
    }

    function setSupplyUpdateOptions(bytes calldata options, address refundAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (refundAddress == address(0)) revert ZeroAddress();
        supplyUpdateOptions = options;
        supplyUpdateRefundAddress = refundAddress;
        emit SupplyUpdateOptionsSet(options, refundAddress);
    }

    function setAutoReportSupply(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        autoReportSupply = enabled;
        emit AutoReportSupplyUpdated(enabled);
    }

    function setEnforceSupplyReporting(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        enforceSupplyReporting = enabled;
        emit SupplyReportingEnforcedUpdated(enabled);
    }

    function setMaxQuotaIncrease(uint256 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMax > 0, "Max quota increase zero");
        uint256 oldValue = maxQuotaIncrease;
        maxQuotaIncrease = newMax;
        emit MaxQuotaIncreaseUpdated(oldValue, newMax);
    }

    function setQuotaReceiverUpdateDelay(uint256 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldDelay = quotaReceiverUpdateDelay;
        quotaReceiverUpdateDelay = newDelay;
        emit QuotaReceiverUpdateDelayUpdated(oldDelay, newDelay);
    }

    function setQuotaReceiver(address _quotaReceiver) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_quotaReceiver == address(0)) revert ZeroAddress();
        if (_quotaReceiver.code.length == 0) revert InvalidQuotaReceiver();

        if (quotaReceiver == address(0) || quotaReceiverUpdateDelay == 0) {
            address oldReceiver = quotaReceiver;
            quotaReceiver = _quotaReceiver;
            pendingQuotaReceiver = address(0);
            pendingQuotaReceiverEta = 0;
            emit QuotaReceiverUpdated(oldReceiver, _quotaReceiver);
            return;
        }

        pendingQuotaReceiver = _quotaReceiver;
        pendingQuotaReceiverEta = block.timestamp + quotaReceiverUpdateDelay;
        emit QuotaReceiverUpdateScheduled(_quotaReceiver, pendingQuotaReceiverEta);
    }

    function executeQuotaReceiverUpdate() external onlyRole(DEFAULT_ADMIN_ROLE) {
        address newReceiver = pendingQuotaReceiver;
        if (newReceiver == address(0)) revert NoPendingQuotaReceiver();
        if (block.timestamp < pendingQuotaReceiverEta) {
            revert QuotaReceiverUpdateNotReady(pendingQuotaReceiverEta);
        }
        address oldReceiver = quotaReceiver;
        quotaReceiver = newReceiver;
        pendingQuotaReceiver = address(0);
        pendingQuotaReceiverEta = 0;
        emit QuotaReceiverUpdated(oldReceiver, newReceiver);
    }

    // ============ Registry / Quota Actions ============

    function reportSupplyUpdate(
        bytes calldata options,
        address refundAddress
    ) public payable returns (MessagingReceipt memory receipt) {
        if (registryPeer == bytes32(0)) revert RegistryNotSet();
        if (refundAddress == address(0)) revert ZeroAddress();

        uint256 currentSupply = totalSupply();
        supplyUpdateNonce++;

        SupplyUpdate memory update = SupplyUpdate({
            chainId: localChainEid,
            supplyDelta: 0,
            newTotalSupply: currentSupply,
            nonce: supplyUpdateNonce
        });

        bytes memory payload = abi.encode(MSG_SUPPLY_UPDATE, update);
        MessagingParams memory params = MessagingParams({
            dstEid: hubChainEid,
            receiver: registryPeer,
            message: payload,
            options: options,
            payInLzToken: false
        });

        MessagingFee memory fee = endpoint.quote(params, msg.sender);
        if (msg.value < fee.nativeFee) revert InsufficientFee(fee.nativeFee, msg.value);
        receipt = endpoint.send{value: msg.value}(params, refundAddress);
    }

    function requestMintQuota(
        uint256 requestedQuota,
        bytes calldata options,
        address refundAddress
    ) external payable returns (MessagingReceipt memory receipt) {
        if (registryPeer == bytes32(0)) revert RegistryNotSet();
        if (requestedQuota == 0) revert ZeroAmount();
        if (refundAddress == address(0)) revert ZeroAddress();
        if (pendingQuotaRequestNonce != 0) revert PendingQuotaRequest(pendingQuotaRequestNonce);

        uint256 currentSupply = totalSupply();
        supplyUpdateNonce++;

        QuotaRequest memory request = QuotaRequest({
            chainId: localChainEid,
            requestedQuota: requestedQuota,
            newTotalSupply: currentSupply,
            nonce: supplyUpdateNonce,
            consumedQuota: quotaConsumedSinceLastRequest
        });

        bytes memory payload = abi.encode(MSG_QUOTA_REQUEST, request);
        MessagingParams memory params = MessagingParams({
            dstEid: hubChainEid,
            receiver: registryPeer,
            message: payload,
            options: options,
            payInLzToken: false
        });

        MessagingFee memory fee = endpoint.quote(params, msg.sender);
        if (msg.value < fee.nativeFee) revert InsufficientFee(fee.nativeFee, msg.value);
        receipt = endpoint.send{value: msg.value}(params, refundAddress);

        pendingQuotaRequestNonce = supplyUpdateNonce;
        pendingQuotaConsumed = quotaConsumedSinceLastRequest;
    }

    function increaseMintQuota(uint256 amount) external {
        if (msg.sender != quotaReceiver) revert UnauthorizedQuotaReceiver();
        if (amount > maxQuotaIncrease) revert QuotaIncreaseTooLarge(amount, maxQuotaIncrease);
        mintQuota += amount;
        emit MintQuotaIncreased(amount, mintQuota);
    }

    function confirmQuotaRequest(uint256 nonce) external {
        if (msg.sender != quotaReceiver) revert UnauthorizedQuotaReceiver();
        if (nonce != pendingQuotaRequestNonce) revert InvalidQuotaNonce();
        if (pendingQuotaConsumed > 0 && quotaConsumedSinceLastRequest >= pendingQuotaConsumed) {
            quotaConsumedSinceLastRequest -= pendingQuotaConsumed;
        } else {
            quotaConsumedSinceLastRequest = 0;
        }
        pendingQuotaRequestNonce = 0;
        pendingQuotaConsumed = 0;
    }

    function clearPendingQuotaRequest() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (pendingQuotaRequestNonce == 0) revert NoPendingQuotaRequest();
        uint256 oldNonce = pendingQuotaRequestNonce;
        uint256 oldConsumed = pendingQuotaConsumed;
        pendingQuotaRequestNonce = 0;
        pendingQuotaConsumed = 0;
        emit PendingQuotaRequestCleared(oldNonce, oldConsumed);
    }
    
    // ============ Pause Functions ============
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }

    // Accept ETH funding for auto-reporting fees.
    receive() external payable {}
    
    // ============ View Functions ============
    
    /**
     * @notice Get spoke contract info
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint32 hubEid_,
        uint32 localEid_,
        bool paused_
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            hubChainEid,
            localChainEid,
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
        (amountSentLD, amountReceivedLD) = super._debit(_from, _amountLD, _minAmountLD, _dstEid);
        _notifySupplyChange();
        return (amountSentLD, amountReceivedLD);
    }
    
    /**
     * @notice Override _credit to check pause state before receiving cross-chain
     */
    function _credit(
        address _to,
        uint256 _amountLD,
        uint32 _srcEid
    ) internal virtual override whenNotPaused returns (uint256 amountReceivedLD) {
        if (totalSupply() + _amountLD > MAX_SUPPLY) {
            revert ExceedsMaxSupply();
        }
        amountReceivedLD = super._credit(_to, _amountLD, _srcEid);
        _notifySupplyChange();
        return amountReceivedLD;
    }

    function _consumeQuota(uint256 amount) internal {
        if (amount > mintQuota) {
            revert QuotaExceeded(amount, mintQuota);
        }
        mintQuota -= amount;
        quotaConsumedSinceLastRequest += amount;
        emit MintQuotaUsed(amount, mintQuota);
    }

    function _notifySupplyChange() internal {
        if (registryPeer == bytes32(0)) return;
        uint256 currentSupply = totalSupply();
        emit SupplyChangeRequiresReporting(currentSupply, hubChainEid);
        if (!autoReportSupply) {
            emit SupplyUpdateSkipped(localChainEid, currentSupply, 0, address(this).balance);
            return;
        }
        _maybeAutoReportSupply();
    }

    function _maybeAutoReportSupply() internal {
        if (!autoReportSupply) return;
        if (registryPeer == bytes32(0)) return;
        uint256 currentSupply = totalSupply();
        if (supplyUpdateRefundAddress == address(0)) {
            emit SupplyUpdateSkipped(localChainEid, currentSupply, 0, address(this).balance);
            return;
        }

        supplyUpdateNonce++;

        SupplyUpdate memory update = SupplyUpdate({
            chainId: localChainEid,
            supplyDelta: 0,
            newTotalSupply: currentSupply,
            nonce: supplyUpdateNonce
        });

        bytes memory payload = abi.encode(MSG_SUPPLY_UPDATE, update);
        MessagingParams memory params = MessagingParams({
            dstEid: hubChainEid,
            receiver: registryPeer,
            message: payload,
            options: supplyUpdateOptions,
            payInLzToken: false
        });

        uint256 nativeFee = endpoint.quote(params, address(this)).nativeFee;
        if (address(this).balance < nativeFee) {
            emit SupplyUpdateSkipped(localChainEid, currentSupply, nativeFee, address(this).balance);
            return;
        }
        endpoint.send{value: nativeFee}(params, supplyUpdateRefundAddress);
    }
    
    // ============ Override for AccessControl ============
    
    /**
     * @notice Override supportsInterface to support AccessControl
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
