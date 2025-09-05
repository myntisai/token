// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MerkleDistributor
 * @notice Merkle tree-based distributor for provider rewards.
 */
contract MerkleDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE  = DEFAULT_ADMIN_ROLE;
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    IERC20 public immutable token;
    address public stakingContract; // bots staking

    mapping(address => uint256) public providerBalance;

    struct EpochMerkleRoot { 
        bytes32 root; 
        uint256 expiry; 
        bool closed; 
    }
    mapping(address => EpochMerkleRoot[]) public providerMerkleRoots;
    mapping(address => mapping(uint256 => mapping(address => bool))) public claimed;

    event StakingContractUpdated(address staking);
    event ProviderBalanceUpdated(address indexed provider, uint256 newBalance);
    event MerkleRootSubmitted(address indexed provider, uint256 indexed rootIndex, bytes32 root, uint256 expiry);
    event RewardsClaimed(address indexed user, address indexed provider, uint256 rootIndex, uint256 amount);
    event EpochClosed(address indexed provider, uint256 indexed rootIndex);
    event ProviderSlashed(address indexed provider, uint256 amount);

    constructor(address _token, address admin) {
        token = IERC20(_token);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ---- admin ----
    function setStakingContract(address _staking) external onlyRole(ADMIN_ROLE) {
        require(_staking != address(0), "zero");
        stakingContract = _staking;
        emit StakingContractUpdated(_staking);
    }

    // ---- funding ----
    function notifyReward(address provider, uint256 amount) external nonReentrant {
        require(msg.sender == stakingContract, "only staking");
        require(amount > 0, "zero");
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    function notifyRewardFromBridge(address provider, uint256 amount) external nonReentrant onlyRole(BRIDGE_ROLE) {
        require(amount > 0, "zero");
        providerBalance[provider] += amount;
        emit ProviderBalanceUpdated(provider, providerBalance[provider]);
    }

    function selfNotifyReward(uint256 amount) external nonReentrant {
        require(amount > 0, "zero");
        token.safeTransferFrom(msg.sender, address(this), amount);
        providerBalance[msg.sender] += amount;
        emit ProviderBalanceUpdated(msg.sender, providerBalance[msg.sender]);
    }

    // ---- epochs ----
    function submitMerkleRoot(bytes32 root, uint256 expiry) external nonReentrant {
        require(providerBalance[msg.sender] > 0, "no balance");
        require(expiry > block.timestamp, "expired");
        providerMerkleRoots[msg.sender].push(EpochMerkleRoot({root: root, expiry: expiry, closed: false}));
        emit MerkleRootSubmitted(msg.sender, providerMerkleRoots[msg.sender].length - 1, root, expiry);
    }

    function closeEpoch(address provider, uint256 rootIndex) external onlyRole(ADMIN_ROLE) {
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(!providerMerkleRoots[provider][rootIndex].closed, "already closed");
        require(block.timestamp > providerMerkleRoots[provider][rootIndex].expiry, "not expired");
        
        providerMerkleRoots[provider][rootIndex].closed = true;
        emit EpochClosed(provider, rootIndex);
    }

    function slashProvider(address provider, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(amount > 0, "zero amount");
        require(amount <= providerBalance[provider], "insufficient balance");
        
        providerBalance[provider] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit ProviderSlashed(provider, amount);
    }

    // ---- claims ----
    function claim(
        address provider,
        uint256 rootIndex,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(provider != address(0), "bad provider");
        require(rootIndex < providerMerkleRoots[provider].length, "bad index");
        require(!claimed[provider][rootIndex][msg.sender], "already");
        EpochMerkleRoot memory e = providerMerkleRoots[provider][rootIndex];
        require(block.timestamp <= e.expiry, "expired");
        require(!e.closed, "epoch closed");

        bytes32 leaf = keccak256(abi.encode(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, e.root, leaf), "invalid proof");

        require(providerBalance[provider] >= amount, "insufficient");
        providerBalance[provider] -= amount;
        claimed[provider][rootIndex][msg.sender] = true;

        token.safeTransfer(msg.sender, amount);
        emit RewardsClaimed(msg.sender, provider, rootIndex, amount);
    }

    // ---- safety ----
    function rescueERC20(address tkn, address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "zero to");
        IERC20(tkn).safeTransfer(to, amount);
    }
}
