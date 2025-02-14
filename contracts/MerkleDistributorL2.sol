// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MyntisToken.sol";  // Ensure this is the L2 deployed token

/**
 * @title L2MerkleDistributor
 * @notice Enables providers on L2 to submit Merkle roots for reward distributions.
 *         Providers should have tokens (bridged via the L2 bridge) in their reward pool.
 */
contract L2MerkleDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    MyntisToken public immutable myntisToken;

    // Local reward balance for each provider on L2.
    mapping(address => uint256) public providerBalance;

    // Each provider can submit multiple merkle roots (for different epochs).
    struct EpochMerkleRoot {
        bytes32 root;
        uint256 expiry;
    }
    // Mapping: provider => array of merkle roots.
    mapping(address => EpochMerkleRoot[]) public providerMerkleRoots;
    
    // Tracks if a user has claimed for a specific provider's epoch.
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;

    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);
    event MerkleRootSubmitted(address indexed provider, uint256 indexed rootIndex, bytes32 merkleRoot, uint256 expiry);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 totalAmount);

    constructor(address _myntisToken, address admin) {
        require(_myntisToken != address(0), "Invalid token address");
        myntisToken = MyntisToken(_myntisToken);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @notice Notifies the distributor of new rewards for a provider.
     * Typically called after tokens are bridged to L2.
     */
    function notifyReward(address provider, uint256 amount) external nonReentrant {
        require(provider != address(0), "Invalid provider");
        require(amount > 0, "Amount must be > 0");
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    /**
     * @notice Provider submits a new Merkle root for an epoch.
     * @param merkleRoot The Merkle root representing the distribution.
     * @param expiry The expiry timestamp for this epoch.
     */
    function submitMerkleRoot(bytes32 merkleRoot, uint256 expiry) external nonReentrant {
        require(providerBalance[msg.sender] > 0, "No provider balance on L2");
        require(expiry > block.timestamp, "Expiry must be in the future");
        
        providerMerkleRoots[msg.sender].push(EpochMerkleRoot({
            root: merkleRoot,
            expiry: expiry
        }));
        
        uint256 rootIndex = providerMerkleRoots[msg.sender].length - 1;
        emit MerkleRootSubmitted(msg.sender, rootIndex, merkleRoot, expiry);
    }

    /**
     * @notice Allows a user to claim rewards using a Merkle proof.
     * @param provider The provider who submitted the Merkle root.
     * @param rootIndex The index of the Merkle root.
     * @param totalClaimAmount The total reward amount claimable.
     * @param merkleProof The Merkle proof for verification.
     */
    function claimRewards(
        address provider,
        uint256 rootIndex,
        uint256 totalClaimAmount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(provider != address(0), "Invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "Invalid root index");
        
        EpochMerkleRoot memory epoch = providerMerkleRoots[provider][rootIndex];
        require(block.timestamp <= epoch.expiry, "Merkle root expired");
        require(providerBalance[provider] >= totalClaimAmount, "Provider insufficient balance");
        require(!claimed[provider][rootIndex][msg.sender], "Reward already claimed");
        
        // Verify the Merkle proof.
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, totalClaimAmount));
        require(verifyMerkleProof(merkleProof, epoch.root, leaf), "Invalid Merkle proof");
        
        claimed[provider][rootIndex][msg.sender] = true;
        providerBalance[provider] -= totalClaimAmount;
        myntisToken.transfer(msg.sender, totalClaimAmount);
        
        emit RewardsClaimed(msg.sender, provider, rootIndex, totalClaimAmount);
    }

    /**
     * @notice Verifies a Merkle proof.
     */
    function verifyMerkleProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) public pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            computedHash = computedHash < proofElement
                ? keccak256(abi.encodePacked(computedHash, proofElement))
                : keccak256(abi.encodePacked(proofElement, computedHash));
        }
        return computedHash == root;
    }
}
  