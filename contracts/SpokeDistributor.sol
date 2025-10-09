// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title SpokeDistributor
 * @notice Spoke-side claim handler with GlobalNullifier integration
 * @dev Prevents double-claiming via cross-chain nullifier verification
 */
contract SpokeDistributor is AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");

    // Hub chain information
    uint32 public immutable hubChainId;
    address public immutable hubGlobalNullifier;
    address public immutable spokeToken;
    
    // Claim tracking
    mapping(bytes32 => bool) public nullifiers;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;
    
    // Provider Merkle roots
    struct SpokeMerkleRoot {
        bytes32 root;
        uint256 expiry;
        bool closed;
        uint256 totalClaimable;
        uint256 claimedAmount;
    }
    
    mapping(address => SpokeMerkleRoot[]) public providerMerkleRoots;
    
    // Constants
    uint256 public constant MIN_EXPIRY_DURATION = 1 days;
    uint256 public constant EPOCH_GRACE_PERIOD = 2 days;
    
    // Events
    event MerkleRootSubmitted(address indexed provider, uint256 rootIndex, bytes32 root, uint256 expiry, uint256 totalClaimable);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 amount, bytes32 nullifier);
    event EpochClosed(address indexed provider, uint256 rootIndex);
    event NullifierBurned(bytes32 indexed nullifier, uint32 indexed chainId, address indexed user);

    constructor(
        uint32 _hubChainId,
        address _hubGlobalNullifier,
        address _spokeToken,
        address admin
    ) {
        hubChainId = _hubChainId;
        hubGlobalNullifier = _hubGlobalNullifier;
        spokeToken = _spokeToken;
        
        _grantRole(ADMIN_ROLE, admin);
    }

    /**
     * @notice Submit Merkle root for an epoch
     * @dev Only providers can submit roots
     */
    function submitMerkleRoot(
        bytes32 root,
        uint256 expiry,
        uint256 totalClaimableAmount
    ) external onlyRole(PROVIDER_ROLE) nonReentrant {
        require(expiry > block.timestamp + MIN_EXPIRY_DURATION, "expiry too soon");
        require(totalClaimableAmount > 0, "zero claimable");

        providerMerkleRoots[msg.sender].push(SpokeMerkleRoot({
            root: root,
            expiry: expiry,
            closed: false,
            totalClaimable: totalClaimableAmount,
            claimedAmount: 0
        }));
        
        emit MerkleRootSubmitted(msg.sender, providerMerkleRoots[msg.sender].length - 1, root, expiry, totalClaimableAmount);
    }

    /**
     * @notice Claim rewards using Merkle proof with nullifier verification
     * @dev Prevents double-claiming across chains via GlobalNullifier
     */
    function claim(
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof,
        bytes32 nullifier
    ) external nonReentrant {
        require(provider != address(0), "invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(amount > 0, "zero amount");
        require(!claimed[provider][rootIndex][msg.sender], "already claimed");
        require(!nullifiers[nullifier], "nullifier already used");

        SpokeMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(block.timestamp <= e.expiry + EPOCH_GRACE_PERIOD, "expired or grace period passed");
        require(!e.closed, "epoch closed");

        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");

        // Ensure enough balance for this epoch
        require(e.totalClaimable >= e.claimedAmount + amount, "epoch balance exhausted");

        // Mark as claimed and burn nullifier
        claimed[provider][rootIndex][msg.sender] = true;
        nullifiers[nullifier] = true;
        e.claimedAmount += amount;

        // Mint tokens to user
        (bool success, ) = spokeToken.call(
            abi.encodeWithSignature("mint(address,uint256,string)", msg.sender, amount, "spoke-claim")
        );
        require(success, "mint failed");

        emit RewardsClaimed(msg.sender, provider, rootIndex, amount, nullifier);
        emit NullifierBurned(nullifier, hubChainId, msg.sender);
    }

    /**
     * @notice Batch claim rewards
     */
    function batchClaim(
        address[] calldata providers,
        uint256[] calldata rootIndices,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs,
        bytes32[] calldata nullifierList
    ) external nonReentrant {
        require(
            providers.length == rootIndices.length &&
            rootIndices.length == amounts.length &&
            amounts.length == proofs.length &&
            proofs.length == nullifierList.length,
            "Arrays length mismatch"
        );

        for (uint256 i = 0; i < providers.length; i++) {
            this.claim(providers[i], rootIndices[i], amounts[i], proofs[i], nullifierList[i]);
        }
    }

    /**
     * @notice Close an epoch
     * @dev Only admin can close epochs
     */
    function closeEpoch(address provider, uint256 rootIndex) external onlyRole(ADMIN_ROLE) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        SpokeMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(!e.closed, "already closed");
        require(block.timestamp > e.expiry + EPOCH_GRACE_PERIOD, "grace period not over");
        
        e.closed = true;
        emit EpochClosed(provider, rootIndex);
    }

    /**
     * @notice Check if user has claimed from specific epoch
     */
    function hasClaimed(address provider, uint256 rootIndex, address user) external view returns (bool) {
        return claimed[provider][rootIndex][user];
    }

    /**
     * @notice Check if nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }

    /**
     * @notice Get epoch info
     */
    function getEpochInfo(address provider, uint256 rootIndex) external view returns (
        bytes32 root,
        uint256 expiry,
        bool closed,
        uint256 totalClaimable,
        uint256 claimedAmount
    ) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        SpokeMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        return (e.root, e.expiry, e.closed, e.totalClaimable, e.claimedAmount);
    }

    /**
     * @notice Generate nullifier hash
     * @dev Should match the hub's GlobalNullifier.generateNullifier
     */
    function generateNullifier(
        address user,
        uint256 rootId,
        uint32 chainId
    ) external pure returns (bytes32) {
        return keccak256(abi.encode(user, rootId, chainId));
    }

    /**
     * @notice Get hub chain information
     */
    function getHubInfo() external view returns (uint32 chainId, address globalNullifier) {
        return (hubChainId, hubGlobalNullifier);
    }
}
