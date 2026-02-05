// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ILayerZeroEndpointV2,
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

interface ISpokeQuotaToken {
    function increaseMintQuota(uint256 amount) external;
    function confirmQuotaRequest(uint256 nonce) external;
}

/**
 * @title SpokeQuotaReceiver
 * @notice Receives quota updates from GlobalSupplyRegistry via LayerZero
 */
contract SpokeQuotaReceiver is AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    uint8 public constant MSG_QUOTA_UPDATE = 3;

    ILayerZeroEndpointV2 public immutable endpoint;
    uint32 public immutable hubChainId;
    bytes32 public registryPeer;
    address public spokeToken;
    uint256 public lastQuotaNonce;

    event RegistryPeerUpdated(bytes32 indexed oldPeer, bytes32 indexed newPeer);
    event SpokeTokenUpdated(address indexed oldToken, address indexed newToken);
    event QuotaReceived(uint256 amount, uint256 newNonce);

    struct QuotaUpdate {
        uint32 chainId;
        uint256 grantedQuota;
        uint256 nonce;
    }

    constructor(
        address _endpoint,
        uint32 _hubChainId,
        bytes32 _registryPeer,
        address _spokeToken,
        address admin
    ) {
        require(_endpoint != address(0), "SpokeQuotaReceiver: endpoint zero");
        require(_hubChainId != 0, "SpokeQuotaReceiver: hub chain zero");
        require(_registryPeer != bytes32(0), "SpokeQuotaReceiver: registry peer zero");
        require(_spokeToken != address(0), "SpokeQuotaReceiver: spoke token zero");
        require(admin != address(0), "SpokeQuotaReceiver: admin zero");

        endpoint = ILayerZeroEndpointV2(_endpoint);
        hubChainId = _hubChainId;
        registryPeer = _registryPeer;
        spokeToken = _spokeToken;

        _grantRole(ADMIN_ROLE, admin);
    }

    function setRegistryPeer(bytes32 _registryPeer) external onlyRole(ADMIN_ROLE) {
        require(_registryPeer != bytes32(0), "SpokeQuotaReceiver: registry peer zero");
        bytes32 oldPeer = registryPeer;
        registryPeer = _registryPeer;
        emit RegistryPeerUpdated(oldPeer, _registryPeer);
    }

    function setSpokeToken(address _spokeToken) external onlyRole(ADMIN_ROLE) {
        require(_spokeToken != address(0), "SpokeQuotaReceiver: spoke token zero");
        address oldToken = spokeToken;
        spokeToken = _spokeToken;
        emit SpokeTokenUpdated(oldToken, _spokeToken);
    }

    function lzReceive(
        Origin calldata origin,
        address receiver,
        bytes32 /* guid */,
        bytes calldata message,
        bytes calldata /* extraData */
    ) external payable {
        require(msg.sender == address(endpoint), "SpokeQuotaReceiver: invalid endpoint");
        require(receiver == address(this), "SpokeQuotaReceiver: invalid receiver");
        require(origin.srcEid == hubChainId, "SpokeQuotaReceiver: invalid source");
        require(origin.sender == registryPeer, "SpokeQuotaReceiver: invalid peer");

        uint8 msgType;
        assembly {
            msgType := shr(248, calldataload(message.offset))
        }
        require(msgType == MSG_QUOTA_UPDATE, "SpokeQuotaReceiver: invalid msg type");

        (, QuotaUpdate memory update) = abi.decode(message, (uint8, QuotaUpdate));
        require(update.chainId == uint32(block.chainid), "SpokeQuotaReceiver: chain mismatch");
        require(update.nonce > lastQuotaNonce, "SpokeQuotaReceiver: stale quota");

        lastQuotaNonce = update.nonce;
        ISpokeQuotaToken(spokeToken).increaseMintQuota(update.grantedQuota);
        // Acknowledge the request so the spoke can roll its consumed counter forward.
        try ISpokeQuotaToken(spokeToken).confirmQuotaRequest(update.nonce) {} catch {}
        emit QuotaReceived(update.grantedQuota, update.nonce);
    }
}
