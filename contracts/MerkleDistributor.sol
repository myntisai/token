// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MyntisToken.sol";

/**
 * @title MerkleDistributor
 * @notice Enables providers to submit Merkle roots for newly rewarded messages.
 *         Users can now claim rewards using a single merkle leaf built from (user, totalClaimAmount).
 */
contract MerkleDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    MyntisToken public immutable myntisToken;
    address public stakingContract;

    // Track each provider's available balance (rewards allocated to them but not yet distributed)
    mapping(address => uint256) public providerBalance;

    // Each provider can submit multiple merkle roots (each with an expiry)
    struct EpochMerkleRoot {
        bytes32 root;   // Merkle root for this epoch
        uint256 expiry; // Expiry timestamp
    }

    // provider => array of merkle roots submitted
    mapping(address => EpochMerkleRoot[]) public providerMerkleRoots;

    // Tracks if a user has claimed for a given provider and root index
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;

    // EVENTS
    event StakingContractUpdated(address newStakingContract);
    event MerkleRootSubmitted(address indexed provider, uint256 indexed rootIndex, bytes32 merkleRoot, uint256 expiry);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 totalAmount);
    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);

    constructor(address _myntisToken, address admin) {
        myntisToken = MyntisToken(_myntisToken);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ----------------------------
    //    ADMIN-CONFIG FUNCTIONS
    // ----------------------------

    function setStakingContract(address _stakingContract) external onlyRole(ADMIN_ROLE) {
        require(_stakingContract != address(0), "Invalid address");
        stakingContract = _stakingContract;
        emit StakingContractUpdated(_stakingContract);
    }

    // ----------------------------
    //     REWARD NOTIFICATION
    // ----------------------------

    /**
     * @notice Called by the StakingContract after a provider harvests new tokens.
     */
    function notifyReward(address provider, uint256 amount) external nonReentrant {
        require(msg.sender == stakingContract, "Only StakingContract can notify rewards");
        require(amount > 0, "Invalid reward amount");
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    // ----------------------------
    //   MERKLE ROOT SUBMISSION
    // ----------------------------

    /**
     * @notice Providers create an epoch by submitting a merkle root for newly rewarded tokens.
     * @dev They must have a positive provider balance and the expiry must be in the future.
     */
    function submitMerkleRoot(bytes32 merkleRoot, uint256 expiry) external nonReentrant {
        require(providerBalance[msg.sender] > 0, "No provider balance");
        require(expiry > block.timestamp, "Expiry must be in future");

        providerMerkleRoots[msg.sender].push(EpochMerkleRoot({
            root: merkleRoot,
            expiry: expiry
        }));

        uint256 rootIndex = providerMerkleRoots[msg.sender].length - 1;
        emit MerkleRootSubmitted(msg.sender, rootIndex, merkleRoot, expiry);
    }

    // ----------------------------
    //       CLAIM REWARDS
    // ----------------------------

    /**
     * @notice Allows a user to claim rewards with a single merkle proof.
     * @param provider The provider who submitted the merkle root.
     * @param rootIndex The index of the merkle root in the provider's list.
     * @param totalClaimAmount The total reward amount the user is entitled to claim.
     * @param merkleProof The merkle proof for the leaf computed as keccak256(abi.encodePacked(msg.sender, totalClaimAmount)).
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

        // Ensure the user hasn't already claimed under this provider's epoch.
        require(!claimed[provider][rootIndex][msg.sender], "Reward already claimed");
        claimed[provider][rootIndex][msg.sender] = true;

        // Recreate the leaf from the user's address and totalClaimAmount.
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, totalClaimAmount));
        require(verifyMerkleProof(merkleProof, epoch.root, leaf), "Invalid Merkle proof");

        providerBalance[provider] -= totalClaimAmount;
        IERC20(address(myntisToken)).safeTransfer(msg.sender, totalClaimAmount);

        emit RewardsClaimed(msg.sender, provider, rootIndex, totalClaimAmount);
    }

    // ----------------------------
    //    INTERNAL PROOF UTILS
    // ----------------------------

    function verifyMerkleProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) public pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash < proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        return computedHash == root;
    }
}