// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    Origin
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {OAppCore} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import {OAppReceiver} from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";

interface ISpokeQuotaToken {
    function increaseMintQuota(uint256 amount) external;
    function confirmQuotaRequest(uint256 nonce) external;
}

/**
 * @title SpokeQuotaReceiver
 * @notice Receives quota updates from GlobalSupplyRegistry via LayerZero
 */
contract SpokeQuotaReceiver is OAppReceiver, AccessControl {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    uint8 public constant MSG_QUOTA_UPDATE = 3;

    uint32 public immutable hubChainId;
    uint32 public immutable localChainEid;
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
        uint32 _localChainEid,
        bytes32 _registryPeer,
        address _spokeToken,
        address admin
    )
        OAppCore(_endpoint, admin)
        Ownable(admin)
    {
        require(_endpoint != address(0), "SpokeQuotaReceiver: endpoint zero");
        require(_hubChainId != 0, "SpokeQuotaReceiver: hub chain zero");
        require(_localChainEid != 0, "SpokeQuotaReceiver: local chain zero");
        require(_registryPeer != bytes32(0), "SpokeQuotaReceiver: registry peer zero");
        require(_spokeToken != address(0), "SpokeQuotaReceiver: spoke token zero");
        require(_spokeToken.code.length > 0, "SpokeQuotaReceiver: spoke token not contract");
        require(admin != address(0), "SpokeQuotaReceiver: admin zero");

        hubChainId = _hubChainId;
        localChainEid = _localChainEid;
        registryPeer = _registryPeer;
        spokeToken = _spokeToken;

        _grantRole(ADMIN_ROLE, admin);

        // OAppReceiver expects peers[srcEid] == origin.sender for trusted paths.
        _setPeer(_hubChainId, _registryPeer);
    }

    function setRegistryPeer(bytes32 _registryPeer) external onlyRole(ADMIN_ROLE) {
        require(_registryPeer != bytes32(0), "SpokeQuotaReceiver: registry peer zero");
        bytes32 oldPeer = registryPeer;
        registryPeer = _registryPeer;
        _setPeer(hubChainId, _registryPeer);
        emit RegistryPeerUpdated(oldPeer, _registryPeer);
    }

    function setSpokeToken(address _spokeToken) external onlyRole(ADMIN_ROLE) {
        require(_spokeToken != address(0), "SpokeQuotaReceiver: spoke token zero");
        require(_spokeToken.code.length > 0, "SpokeQuotaReceiver: spoke token not contract");
        address oldToken = spokeToken;
        spokeToken = _spokeToken;
        emit SpokeTokenUpdated(oldToken, _spokeToken);
    }

    function lzReceive(
        Origin calldata origin,
        bytes32 guid,
        bytes calldata message,
        address executor,
        bytes calldata extraData
    ) public payable override {
        // Keep legacy revert strings for "invalid endpoint" before OAppReceiver checks.
        require(msg.sender == address(endpoint), "SpokeQuotaReceiver: invalid endpoint");
        // Delegate peer check + dispatch to OAppReceiver.
        super.lzReceive(origin, guid, message, executor, extraData);
    }

    function _lzReceive(
        Origin calldata /*origin*/,
        bytes32 /*guid*/,
        bytes calldata message,
        address /*executor*/,
        bytes calldata /*extraData*/
    ) internal override {
        uint8 msgType;
        assembly {
            msgType := byte(31, calldataload(message.offset))
        }
        require(msgType == MSG_QUOTA_UPDATE, "SpokeQuotaReceiver: invalid msg type");

        (, QuotaUpdate memory update) = abi.decode(message, (uint8, QuotaUpdate));
        // The registry uses LayerZero EIDs in its payloads (not EVM chain IDs).
        require(update.chainId == localChainEid, "SpokeQuotaReceiver: chain mismatch");
        require(update.nonce > lastQuotaNonce, "SpokeQuotaReceiver: stale quota");

        lastQuotaNonce = update.nonce;
        ISpokeQuotaToken(spokeToken).increaseMintQuota(update.grantedQuota);
        // Acknowledge the request so the spoke can roll its consumed counter forward.
        try ISpokeQuotaToken(spokeToken).confirmQuotaRequest(update.nonce) {} catch {}
        emit QuotaReceived(update.grantedQuota, update.nonce);
    }
}
