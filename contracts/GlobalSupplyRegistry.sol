// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    ILayerZeroEndpointV2,
    MessagingParams,
    MessagingReceipt,
    MessagingFee,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

/**
 * @title GlobalSupplyRegistry
 * @notice Tracks total token supply across all chains
 * @dev Deployed on hub chain, receives supply updates from spokes via LayerZero
 * @dev Enforces global cap (1B) across all chains
 */
contract GlobalSupplyRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant SPOKE_ROLE = keccak256("SPOKE_ROLE");
    bytes32 public constant TOKEN_ROLE = keccak256("TOKEN_ROLE"); // For hub/spoke token contracts
    
    ILayerZeroEndpointV2 public immutable endpoint;
    mapping(uint32 eid => bytes32 peer) public peers;
    mapping(uint32 eid => bytes32 quotaReceivers) public quotaReceivers;
    
    // Global supply tracking
    uint256 public globalCap; // e.g., 1B tokens
    mapping(uint32 eid => uint256) public chainSupply; // Per-chain supply
    uint256 public totalCrossChainSupply; // Sum of all chain supplies
    mapping(uint32 eid => uint256) public chainQuota; // Remaining mint quota per chain
    uint256 public totalReservedQuota; // Sum of all remaining quotas

    // Message types for LZ payloads
    uint8 public constant MSG_SUPPLY_UPDATE = 1;
    uint8 public constant MSG_QUOTA_REQUEST = 2;
    uint8 public constant MSG_QUOTA_UPDATE = 3;
    
    struct QuotaRequest {
        uint32 chainId;
        uint256 requestedQuota;
        uint256 newTotalSupply;
        uint256 nonce;
        uint256 consumedQuota;
    }
    
    struct QuotaUpdate {
        uint32 chainId;
        uint256 grantedQuota;
        uint256 nonce;
    }
    
    struct SupplyUpdate {
        uint32 chainId;
        uint256 supplyDelta; // Positive for mint, negative for burn
        uint256 newTotalSupply;
        uint256 nonce; // SECURITY FIX: Added nonce for ordering
    }
    
    // SECURITY FIX: Nonce tracking per chain to prevent stale updates
    mapping(uint32 => uint256) public chainNonce;
    
    event SupplyUpdated(uint32 indexed chainId, uint256 supplyDelta, uint256 newTotalSupply, uint256 totalCrossChainSupply);
    event PeerUpdated(uint32 indexed eid, bytes32 indexed peer);
    event CapUpdated(uint256 oldCap, uint256 newCap);
    event ChainReseeded(uint32 indexed chainId, uint256 oldSupply, uint256 newSupply);
    event StaleUpdateRejected(uint32 indexed chainId, uint256 providedNonce, uint256 expectedNonce);
    event QuotaReceiverUpdated(uint32 indexed eid, bytes32 indexed receiver);
    event QuotaGranted(uint32 indexed chainId, uint256 requested, uint256 granted, uint256 newChainQuota, uint256 totalReserved);
    event QuotaConsumed(uint32 indexed chainId, uint256 amount, uint256 remainingChainQuota, uint256 totalReserved);
    event QuotaUpdateOptionsSet(bytes options, address refundAddress);
    event QuotaUpdateSkipped(uint32 indexed chainId, uint256 amount, uint256 requiredFee, uint256 balance);
    event ChainQuotaUpdated(uint32 indexed chainId, uint256 oldQuota, uint256 newQuota, uint256 totalReserved);
    
    error UnknownPeer(uint32 eid);
    error InvalidEndpoint();
    error InvalidPeer();
    error CapExceeded(uint256 current, uint256 cap);
    
    constructor(address endpoint_, address admin_) {
        require(endpoint_ != address(0), "GlobalSupplyRegistry: endpoint zero");
        require(admin_ != address(0), "GlobalSupplyRegistry: admin zero");
        
        endpoint = ILayerZeroEndpointV2(endpoint_);
        _grantRole(ADMIN_ROLE, admin_);
        globalCap = 1_000_000_000 * 1e18; // 1B default
    }
    
    /**
     * @notice Register a spoke chain
     */
    function registerSpoke(uint32 eid, bytes32 peer) external onlyRole(ADMIN_ROLE) {
        require(peer != bytes32(0), "GlobalSupplyRegistry: zero peer");
        peers[eid] = peer;
        _grantRole(SPOKE_ROLE, address(uint160(uint256(peer))));
        emit PeerUpdated(eid, peer);
    }

    /**
     * @notice Register the quota receiver on a spoke chain
     */
    function registerQuotaReceiver(uint32 eid, bytes32 receiver) external onlyRole(ADMIN_ROLE) {
        require(receiver != bytes32(0), "GlobalSupplyRegistry: zero receiver");
        quotaReceivers[eid] = receiver;
        emit QuotaReceiverUpdated(eid, receiver);
    }

    /**
     * @notice Register a token contract (hub or spoke) to allow direct supply reporting
     */
    function registerToken(address token) external onlyRole(ADMIN_ROLE) {
        require(token != address(0), "GlobalSupplyRegistry: zero token");
        _grantRole(TOKEN_ROLE, token);
    }
    
    /**
     * @notice Update supply from spoke chain (called via LayerZero)
     * @dev SECURITY FIX: Validates nonce to prevent stale updates from overwriting newer ones
     */
    function lzReceive(
        Origin calldata origin,
        address receiver,
        bytes32 /* guid */,
        bytes calldata message,
        bytes calldata /* extraData */
    ) external payable nonReentrant {
        if (msg.sender != address(endpoint)) revert InvalidEndpoint();
        if (receiver != address(this)) revert InvalidEndpoint();
        
        bytes32 expectedPeer = peers[origin.srcEid];
        if (expectedPeer == bytes32(0) || expectedPeer != origin.sender) revert InvalidPeer();

        uint8 msgType;
        assembly {
            msgType := shr(248, calldataload(message.offset))
        }
        
        if (msgType == MSG_SUPPLY_UPDATE) {
            (, SupplyUpdate memory update) = abi.decode(message, (uint8, SupplyUpdate));
            _handleSupplyUpdate(origin.srcEid, update);
        } else if (msgType == MSG_QUOTA_REQUEST) {
            (, QuotaRequest memory request) = abi.decode(message, (uint8, QuotaRequest));
            _handleQuotaRequest(origin.srcEid, request);
        } else {
            revert("GlobalSupplyRegistry: unknown message type");
        }
    }

    function _handleSupplyUpdate(uint32 srcEid, SupplyUpdate memory update) internal {
        uint32 chainId = update.chainId;
        uint256 supplyDelta = update.supplyDelta;
        uint256 newChainSupply = update.newTotalSupply;
        
        require(chainId == srcEid, "GlobalSupplyRegistry: chainId mismatch");
        
        if (update.nonce <= chainNonce[chainId]) {
            emit StaleUpdateRejected(chainId, update.nonce, chainNonce[chainId]);
            return;
        }
        chainNonce[chainId] = update.nonce;
        
        _applySupplyUpdate(chainId, supplyDelta, newChainSupply);
    }

    function _handleQuotaRequest(uint32 srcEid, QuotaRequest memory request) internal {
        uint32 chainId = request.chainId;
        require(chainId == srcEid, "GlobalSupplyRegistry: chainId mismatch");
        
        if (request.nonce <= chainNonce[chainId]) {
            emit StaleUpdateRejected(chainId, request.nonce, chainNonce[chainId]);
            return;
        }
        chainNonce[chainId] = request.nonce;
        
        uint256 oldChainSupply = chainSupply[chainId];
        uint256 newChainSupply = request.newTotalSupply;
        
        // Update supply first
        _applySupplyUpdate(chainId, newChainSupply > oldChainSupply ? newChainSupply - oldChainSupply : oldChainSupply - newChainSupply, newChainSupply);
        
        // Consume reported quota usage (spoke-enforced)
        if (request.consumedQuota > 0) {
            uint256 remaining = chainQuota[chainId];
            uint256 consumed = request.consumedQuota <= remaining ? request.consumedQuota : remaining;
            chainQuota[chainId] = remaining - consumed;
            totalReservedQuota -= consumed;
            emit QuotaConsumed(chainId, consumed, chainQuota[chainId], totalReservedQuota);
        }
        
        // Grant new quota based on remaining global cap
        uint256 available = globalCap - totalCrossChainSupply - totalReservedQuota;
        uint256 grant = request.requestedQuota <= available ? request.requestedQuota : available;
        
        if (grant > 0) {
            chainQuota[chainId] += grant;
            totalReservedQuota += grant;
        }
        
        emit QuotaGranted(chainId, request.requestedQuota, grant, chainQuota[chainId], totalReservedQuota);
        
        bytes32 receiver = quotaReceivers[chainId];
        if (receiver != bytes32(0) && grant > 0) {
            _sendQuotaUpdate(chainId, receiver, grant, chainNonce[chainId]);
        }
    }

    function _applySupplyUpdate(uint32 chainId, uint256 supplyDelta, uint256 newChainSupply) internal {
        uint256 oldChainSupply = chainSupply[chainId];
        chainSupply[chainId] = newChainSupply;
        totalCrossChainSupply = totalCrossChainSupply - oldChainSupply + newChainSupply;
        
        if (totalCrossChainSupply > globalCap) {
            revert CapExceeded(totalCrossChainSupply, globalCap);
        }
        
        emit SupplyUpdated(chainId, supplyDelta, newChainSupply, totalCrossChainSupply);
    }

    function _sendQuotaUpdate(uint32 chainId, bytes32 receiver, uint256 amount, uint256 nonce) internal {
        QuotaUpdate memory update = QuotaUpdate({
            chainId: chainId,
            grantedQuota: amount,
            nonce: nonce
        });
        
        require(quotaUpdateRefundAddress != address(0), "GlobalSupplyRegistry: refund not set");
        bytes memory payload = abi.encode(MSG_QUOTA_UPDATE, update);
        MessagingParams memory params = MessagingParams({
            dstEid: chainId,
            receiver: receiver,
            message: payload,
            options: quotaUpdateOptions,
            payInLzToken: false
        });
        
        uint256 nativeFee = endpoint.quote(params, address(this)).nativeFee;
        if (address(this).balance < nativeFee) {
            emit QuotaUpdateSkipped(chainId, amount, nativeFee, address(this).balance);
            return;
        }
        endpoint.send{value: nativeFee}(params, quotaUpdateRefundAddress);
    }
    
    /**
     * @notice Get total supply across all chains
     */
    function getGlobalSupply() external view returns (uint256) {
        return totalCrossChainSupply;
    }
    
    /**
     * @notice Record a mint on the hub chain (direct call, not via LayerZero)
     * @param amount Amount minted
     */
    function recordMint(uint256 amount) external onlyRole(TOKEN_ROLE) nonReentrant {
        require(amount > 0, "GlobalSupplyRegistry: zero amount");
        uint32 chainId = uint32(block.chainid);
        uint256 oldChainSupply = chainSupply[chainId];
        uint256 newChainSupply = oldChainSupply + amount;
        
        // Check cap before updating
        uint256 newTotal = totalCrossChainSupply - oldChainSupply + newChainSupply;
        if (newTotal > globalCap) {
            revert CapExceeded(newTotal, globalCap);
        }
        
        chainSupply[chainId] = newChainSupply;
        totalCrossChainSupply = newTotal;
        
        emit SupplyUpdated(chainId, amount, newChainSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Record a burn on the hub chain (direct call, not via LayerZero)
     * @param amount Amount burned (net amount after fees)
     * @dev Emits amount as delta; newTotalSupply will be lower, indicating a burn
     */
    function recordBurn(uint256 amount) external onlyRole(TOKEN_ROLE) nonReentrant {
        require(amount > 0, "GlobalSupplyRegistry: zero amount");
        uint32 chainId = uint32(block.chainid);
        uint256 oldChainSupply = chainSupply[chainId];
        require(oldChainSupply >= amount, "GlobalSupplyRegistry: burn exceeds supply");
        
        uint256 newChainSupply = oldChainSupply - amount;
        chainSupply[chainId] = newChainSupply;
        totalCrossChainSupply = totalCrossChainSupply - amount;
        
        // Emit amount as delta; the reduction is clear from newTotalSupply < oldChainSupply
        emit SupplyUpdated(chainId, amount, newChainSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Check if minting would exceed global cap
     */
    function canMint(uint256 amount) external view returns (bool) {
        return totalCrossChainSupply + amount <= globalCap;
    }
    
    /**
     * @notice Seed initial supply for a chain (for existing deployments)
     * @param chainId Chain ID to seed
     * @param initialSupply Initial supply on that chain
     */
    function seedChainSupply(uint32 chainId, uint256 initialSupply) external onlyRole(ADMIN_ROLE) {
        require(chainSupply[chainId] == 0, "GlobalSupplyRegistry: chain already seeded");
        require(initialSupply <= globalCap, "GlobalSupplyRegistry: initial supply exceeds cap");
        
        chainSupply[chainId] = initialSupply;
        totalCrossChainSupply += initialSupply;
        
        require(totalCrossChainSupply <= globalCap, "GlobalSupplyRegistry: total exceeds cap");
        
        emit SupplyUpdated(chainId, initialSupply, initialSupply, totalCrossChainSupply);
    }

    /**
     * @notice Update global cap (admin only)
     */
    function updateCap(uint256 newCap) external onlyRole(ADMIN_ROLE) {
        require(newCap >= totalCrossChainSupply, "GlobalSupplyRegistry: cap < current supply");
        uint256 oldCap = globalCap;
        globalCap = newCap;
        emit CapUpdated(oldCap, newCap);
    }

    /**
     * @notice Set default options/refund for quota updates
     */
    function setQuotaUpdateOptions(bytes calldata options, address refundAddress) external onlyRole(ADMIN_ROLE) {
        require(refundAddress != address(0), "GlobalSupplyRegistry: refund zero");
        quotaUpdateOptions = options;
        quotaUpdateRefundAddress = refundAddress;
        emit QuotaUpdateOptionsSet(options, refundAddress);
    }

    /**
     * @notice Update chain quota (admin recovery)
     */
    function setChainQuota(uint32 chainId, uint256 newQuota) external onlyRole(ADMIN_ROLE) {
        uint256 oldQuota = chainQuota[chainId];
        if (newQuota > oldQuota) {
            totalReservedQuota += (newQuota - oldQuota);
        } else if (oldQuota > newQuota) {
            totalReservedQuota -= (oldQuota - newQuota);
        }
        chainQuota[chainId] = newQuota;
        emit ChainQuotaUpdated(chainId, oldQuota, newQuota, totalReservedQuota);
    }

    /**
     * @notice Re-seed chain supply and quota in one call (admin recovery)
     * @param chainId Chain ID to reseed
     * @param newSupply Corrected supply for that chain
     * @param newQuota Corrected remaining quota for that chain
     * @param newNonce New nonce to set (should be higher than any pending messages)
     * @dev Ensures supply + quota remain consistent with global cap
     */
    function reseedChainSupplyAndQuota(
        uint32 chainId,
        uint256 newSupply,
        uint256 newQuota,
        uint256 newNonce
    ) external onlyRole(ADMIN_ROLE) {
        uint256 oldSupply = chainSupply[chainId];
        uint256 oldQuota = chainQuota[chainId];

        uint256 newTotalSupply = totalCrossChainSupply - oldSupply + newSupply;
        uint256 newTotalReserved = totalReservedQuota;
        if (newQuota > oldQuota) {
            newTotalReserved += (newQuota - oldQuota);
        } else if (oldQuota > newQuota) {
            newTotalReserved -= (oldQuota - newQuota);
        }

        require(newTotalSupply + newTotalReserved <= globalCap, "GlobalSupplyRegistry: would exceed cap");

        chainSupply[chainId] = newSupply;
        totalCrossChainSupply = newTotalSupply;

        chainQuota[chainId] = newQuota;
        totalReservedQuota = newTotalReserved;

        chainNonce[chainId] = newNonce;

        emit ChainReseeded(chainId, oldSupply, newSupply);
        emit ChainQuotaUpdated(chainId, oldQuota, newQuota, totalReservedQuota);
        emit SupplyUpdated(chainId, newSupply > oldSupply ? newSupply - oldSupply : oldSupply - newSupply, newSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Re-seed chain supply for error correction (admin only)
     * @param chainId Chain ID to reseed
     * @param newSupply Corrected supply for that chain
     * @param newNonce New nonce to set (should be higher than any pending messages)
     * @dev SECURITY FIX: Allows admin to correct seeding errors
     * @dev SECURITY FIX: Resets nonce to prevent replay attacks after reseed
     */
    function reseedChainSupply(uint32 chainId, uint256 newSupply, uint256 newNonce) external onlyRole(ADMIN_ROLE) {
        uint256 oldSupply = chainSupply[chainId];
        
        // Calculate new total
        uint256 newTotal = totalCrossChainSupply - oldSupply + newSupply;
        require(newTotal <= globalCap, "GlobalSupplyRegistry: would exceed cap");
        
        chainSupply[chainId] = newSupply;
        totalCrossChainSupply = newTotal;
        
        // SECURITY FIX: Reset nonce to prevent replay attacks with old messages
        chainNonce[chainId] = newNonce;
        
        emit ChainReseeded(chainId, oldSupply, newSupply);
        emit SupplyUpdated(chainId, newSupply > oldSupply ? newSupply - oldSupply : oldSupply - newSupply, newSupply, totalCrossChainSupply);
    }
    
    /**
     * @notice Get current nonce for a chain
     * @param chainId Chain ID to query
     * @return Current nonce for the chain
     */
    function getChainNonce(uint32 chainId) external view returns (uint256) {
        return chainNonce[chainId];
    }
    
    /**
     * @notice Force accept next supply update for a chain (admin recovery)
     * @param chainId Chain ID to reset nonce for
     * @dev SECURITY FIX: Allows recovery from out-of-order message scenarios
     * @dev Sets nonce to 0 so next update will be accepted regardless of its nonce
     * @dev Use with caution - can allow replay of old messages
     */
    function resetChainNonce(uint32 chainId) external onlyRole(ADMIN_ROLE) {
        uint256 oldNonce = chainNonce[chainId];
        uint256 newNonce = oldNonce + 1;
        chainNonce[chainId] = newNonce;
        emit ChainNonceReset(chainId, oldNonce);
        emit ChainNonceAdvanced(chainId, oldNonce, newNonce);
    }
    
    /**
     * @notice Force synchronize supply from a chain (bypass LayerZero)
     * @param chainId Chain ID
     * @param newSupply New supply value
     * @param minNonce Optional minimum nonce to set (0 to keep current)
     * @dev SECURITY FIX: Emergency recovery when LZ messages are stuck/lost
     * @dev SECURITY FIX: Optionally sets minNonce to reject old in-flight messages
     */
    function forceSupplySync(uint32 chainId, uint256 newSupply, uint256 minNonce) external onlyRole(ADMIN_ROLE) {
        uint256 oldSupply = chainSupply[chainId];
        uint256 newTotal = totalCrossChainSupply - oldSupply + newSupply;
        require(newTotal <= globalCap, "GlobalSupplyRegistry: would exceed cap");
        
        chainSupply[chainId] = newSupply;
        totalCrossChainSupply = newTotal;
        
        // SECURITY FIX: Optionally update nonce to reject old in-flight messages
        if (minNonce > chainNonce[chainId]) {
            chainNonce[chainId] = minNonce;
        }
        
        emit SupplyUpdated(chainId, newSupply > oldSupply ? newSupply - oldSupply : oldSupply - newSupply, newSupply, totalCrossChainSupply);
    }
    
    event ChainNonceReset(uint32 indexed chainId, uint256 oldNonce);
    event ChainNonceAdvanced(uint32 indexed chainId, uint256 oldNonce, uint256 newNonce);
    bytes public quotaUpdateOptions;
    address public quotaUpdateRefundAddress;
}
