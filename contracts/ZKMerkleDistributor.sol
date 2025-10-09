// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {RewardClaimVerifier} from "./RewardClaimVerifier.sol";

/**
 * @title ZKMerkleDistributor
 * @notice ZK-verified Merkle distributor for privacy-preserving reward claims
 * @dev Integrates ZK proof verification with Merkle tree distribution
 * @dev Prevents double-claiming through nullifier tracking
 */
contract ZKMerkleDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");
    
    // Token contract
    IERC20 public immutable token;
    
    // ZK verifier contract
    RewardClaimVerifier public immutable verifier;
    
    // Provider balances and locked amounts
    mapping(address => uint256) public providerBalance;
    mapping(address => uint256) public lockedBalance;
    
    // Epoch management
    struct EpochMerkleRoot {
        bytes32 root;
        uint256 expiry;
        bool closed;
        uint256 totalClaimable;
        uint256 claimedAmount;
        bool zkEnabled; // Whether ZK proofs are required for this epoch
    }
    
    mapping(address => EpochMerkleRoot[]) public providerMerkleRoots;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;
    
    // ZK claim tracking
    mapping(bytes32 => bool) public zkClaimed; // nullifier => claimed
    mapping(address => uint256) public zkClaimCount; // user => claim count
    
    // Constants
    uint256 public constant MIN_EXPIRY_DURATION = 1 days;
    uint256 public constant EPOCH_GRACE_PERIOD = 2 days;
    
    // Events
    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);
    event MerkleRootSubmitted(
        address indexed provider, 
        uint256 rootIndex, 
        bytes32 root, 
        uint256 expiry, 
        uint256 totalClaimable,
        bool zkEnabled
    );
    event ZKRewardsClaimed(
        address indexed user, 
        address indexed provider, 
        uint256 rootIndex, 
        uint256 amount,
        bytes32 nullifier
    );
    event RewardsClaimed(
        address indexed user, 
        address indexed provider, 
        uint256 rootIndex, 
        uint256 amount
    );
    event EpochClosed(address indexed provider, uint256 rootIndex);
    event ProviderSlashed(address indexed provider, uint256 amount);
    
    constructor(address _token, address _verifier, address admin) {
        token = IERC20(_token);
        verifier = RewardClaimVerifier(_verifier);
        _grantRole(ADMIN_ROLE, admin);
    }
    
    /**
     * @notice Add balance for a provider
     * @param provider Provider address
     * @param amount Amount to add
     */
    function addProviderBalance(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
    
    /**
     * @notice Submit Merkle root for an epoch with ZK option
     * @param root Merkle root
     * @param expiry Expiry timestamp
     * @param totalClaimableAmount Total claimable amount
     * @param zkEnabled Whether ZK proofs are required
     */
    function submitMerkleRoot(
        bytes32 root,
        uint256 expiry,
        uint256 totalClaimableAmount,
        bool zkEnabled
    ) external nonReentrant {
        require(providerBalance[msg.sender] >= totalClaimableAmount, "Insufficient balance for claims");
        require(expiry > block.timestamp + MIN_EXPIRY_DURATION, "expiry too soon");
        require(totalClaimableAmount > 0, "zero claimable");
        
        // Lock the balance for this epoch
        providerBalance[msg.sender] -= totalClaimableAmount;
        lockedBalance[msg.sender] += totalClaimableAmount;
        
        providerMerkleRoots[msg.sender].push(EpochMerkleRoot({
            root: root,
            expiry: expiry,
            closed: false,
            totalClaimable: totalClaimableAmount,
            claimedAmount: 0,
            zkEnabled: zkEnabled
        }));
        
        emit MerkleRootSubmitted(
            msg.sender, 
            providerMerkleRoots[msg.sender].length - 1, 
            root, 
            expiry, 
            totalClaimableAmount,
            zkEnabled
        );
    }
    
    /**
     * @notice Claim rewards with ZK proof
     * @param provider Provider address
     * @param rootIndex Merkle root index
     * @param amount Claim amount
     * @param merkleProof Merkle proof
     * @param zkProof ZK proof
     * @param publicInputs Public inputs [merkleRoot, nullifier, claimAmount]
     */
    function claimWithZK(
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof,
        RewardClaimVerifier.Proof memory zkProof,
        uint256[3] memory publicInputs
    ) external nonReentrant {
        require(provider != address(0), "invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(amount > 0, "zero amount");
        require(!claimed[provider][rootIndex][msg.sender], "already claimed");
        
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(e.zkEnabled, "ZK not enabled for this epoch");
        require(block.timestamp <= e.expiry + EPOCH_GRACE_PERIOD, "expired or grace period passed");
        require(!e.closed, "epoch closed");
        
        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");
        
        // Verify ZK proof
        require(verifier.verifyAndUseProof(zkProof, publicInputs), "invalid ZK proof");
        
        // Check nullifier
        bytes32 nullifier = bytes32(publicInputs[1]);
        require(!zkClaimed[nullifier], "nullifier already used");
        
        // Ensure enough locked balance for this specific epoch
        require(e.totalClaimable >= e.claimedAmount + amount, "epoch balance exhausted");
        
        // Update state
        claimed[provider][rootIndex][msg.sender] = true;
        e.claimedAmount += amount;
        zkClaimed[nullifier] = true;
        zkClaimCount[msg.sender]++;
        
        // Transfer tokens
        token.safeTransfer(msg.sender, amount);
        
        emit ZKRewardsClaimed(msg.sender, provider, rootIndex, amount, nullifier);
    }
    
    /**
     * @notice Claim rewards without ZK proof (legacy support)
     * @param provider Provider address
     * @param rootIndex Merkle root index
     * @param amount Claim amount
     * @param merkleProof Merkle proof
     */
    function claimWithoutZK(
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(provider != address(0), "invalid provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(amount > 0, "zero amount");
        require(!claimed[provider][rootIndex][msg.sender], "already claimed");
        
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(!e.zkEnabled, "ZK required for this epoch");
        require(block.timestamp <= e.expiry + EPOCH_GRACE_PERIOD, "expired or grace period passed");
        require(!e.closed, "epoch closed");
        
        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");
        
        // Ensure enough locked balance for this specific epoch
        require(e.totalClaimable >= e.claimedAmount + amount, "epoch balance exhausted");
        
        // Update state
        claimed[provider][rootIndex][msg.sender] = true;
        e.claimedAmount += amount;
        
        // Transfer tokens
        token.safeTransfer(msg.sender, amount);
        
        emit RewardsClaimed(msg.sender, provider, rootIndex, amount);
    }
    
    /**
     * @notice Batch claim rewards with ZK proofs
     * @param providers Provider addresses
     * @param rootIndices Merkle root indices
     * @param amounts Claim amounts
     * @param merkleProofs Merkle proofs
     * @param zkProofs ZK proofs
     * @param publicInputsList Public inputs for each claim
     */
    function batchClaimWithZK(
        address[] calldata providers,
        uint256[] calldata rootIndices,
        uint256[] calldata amounts,
        bytes32[][] calldata merkleProofs,
        RewardClaimVerifier.Proof[] memory zkProofs,
        uint256[3][] memory publicInputsList
    ) external nonReentrant {
        require(
            providers.length == rootIndices.length &&
            rootIndices.length == amounts.length &&
            amounts.length == merkleProofs.length &&
            merkleProofs.length == zkProofs.length &&
            zkProofs.length == publicInputsList.length,
            "Arrays length mismatch"
        );
        
        for (uint256 i = 0; i < providers.length; i++) {
            this.claimWithZK(
                providers[i], 
                rootIndices[i], 
                amounts[i], 
                merkleProofs[i], 
                zkProofs[i], 
                publicInputsList[i]
            );
        }
    }
    
    /**
     * @notice Close an epoch and return unclaimed funds
     * @param provider Provider address
     * @param rootIndex Merkle root index
     */
    function closeEpoch(address provider, uint256 rootIndex) external onlyRole(ADMIN_ROLE) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        require(!e.closed, "already closed");
        require(block.timestamp > e.expiry + EPOCH_GRACE_PERIOD, "grace period not over");
        
        e.closed = true;
        
        // Return any unclaimed balance to the provider
        if (e.totalClaimable > e.claimedAmount) {
            uint256 unclaimed = e.totalClaimable - e.claimedAmount;
            lockedBalance[provider] -= unclaimed;
            providerBalance[provider] += unclaimed;
            emit ProviderBalanceUpdated(provider, providerBalance[provider]);
        }
        
        emit EpochClosed(provider, rootIndex);
    }
    
    /**
     * @notice Slash a provider's balance
     * @param provider Provider address
     * @param amount Amount to slash
     */
    function slashProvider(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount <= providerBalance[provider], "insufficient balance");
        providerBalance[provider] -= amount;
        emit ProviderSlashed(provider, amount);
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }
    
    /**
     * @notice Get provider's available balance
     * @param provider Provider address
     * @return Available balance
     */
    function getProviderBalance(address provider) external view returns (uint256) {
        return providerBalance[provider];
    }
    
    /**
     * @notice Get provider's locked balance
     * @param provider Provider address
     * @return Locked balance
     */
    function getLockedBalance(address provider) external view returns (uint256) {
        return lockedBalance[provider];
    }
    
    /**
     * @notice Get epoch info
     * @param provider Provider address
     * @param rootIndex Merkle root index
     * @return Epoch information
     */
    function getEpochInfo(address provider, uint256 rootIndex) external view returns (
        bytes32 root,
        uint256 expiry,
        bool closed,
        uint256 totalClaimable,
        uint256 claimedAmount,
        bool zkEnabled
    ) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        EpochMerkleRoot storage e = providerMerkleRoots[provider][rootIndex];
        return (e.root, e.expiry, e.closed, e.totalClaimable, e.claimedAmount, e.zkEnabled);
    }
    
    /**
     * @notice Check if user has claimed from specific epoch
     * @param provider Provider address
     * @param rootIndex Merkle root index
     * @param user User address
     * @return True if user has claimed
     */
    function hasClaimed(address provider, uint256 rootIndex, address user) external view returns (bool) {
        return claimed[provider][rootIndex][user];
    }
    
    /**
     * @notice Check if nullifier has been used
     * @param nullifier Nullifier to check
     * @return True if nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return zkClaimed[nullifier];
    }
    
    /**
     * @notice Get user's ZK claim count
     * @param user User address
     * @return Number of ZK claims made
     */
    function getZKClaimCount(address user) external view returns (uint256) {
        return zkClaimCount[user];
    }
}
