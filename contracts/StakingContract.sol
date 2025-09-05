// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IEmissionContract {
    function harvest(address provider) external;
    function accRewardPerShare() external view returns (uint256);
}

interface IMerkleDistributorLike {
    function notifyReward(address provider, uint256 amount) external;
}

contract StakingContract is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    IERC20 public immutable token;
    IEmissionContract public emissionContract;
    IMerkleDistributorLike public merkleDistributor;

    uint256 public minimumStake = 1_000 * 1e18;
    uint256 public totalStake;

    struct Info { uint256 stake; uint256 rewardDebt; }
    mapping(address => Info) public providers;
    mapping(address => bool) private registered;
    address[] public allProviders;

    event MinimumStakeUpdated(uint256 amount);
    event EmissionContractUpdated(address emissionContract);
    event MerkleDistributorUpdated(address newMerkleDistributor);
    event ProviderRegistered(address indexed provider, uint256 amount);
    event StakeIncreased(address indexed provider, uint256 amount, uint256 newStake);
    event StakeWithdrawn(address indexed provider, uint256 amount, uint256 remaining);
    event Harvested(address indexed provider, uint256 amount);
    event EmergencyWithdrawal(address indexed provider, uint256 amount);

    constructor(address _token, address _emissionContract, address _merkleDistributor, address _admin) {
        token = IERC20(_token);
        emissionContract = IEmissionContract(_emissionContract);
        merkleDistributor = IMerkleDistributorLike(_merkleDistributor);
        _grantRole(ADMIN_ROLE, _admin);
    }

    // ---- admin ----
    function setMinimumStake(uint256 amount) external onlyRole(ADMIN_ROLE) {
        minimumStake = amount;
        emit MinimumStakeUpdated(amount);
    }
    function setEmissionContract(address _emissionContract) external onlyRole(ADMIN_ROLE) {
        require(_emissionContract != address(0), "Invalid address");
        emissionContract = IEmissionContract(_emissionContract);
        emit EmissionContractUpdated(_emissionContract);
    }

    function setMerkleDistributor(address _merkleDistributor) external onlyRole(ADMIN_ROLE) {
        require(_merkleDistributor != address(0), "Invalid address");
        merkleDistributor = IMerkleDistributorLike(_merkleDistributor);
        emit MerkleDistributorUpdated(_merkleDistributor);
    }

    // ---- staking ----
    function registerProvider(uint256 amount) external nonReentrant {
        require(!registered[msg.sender], "already");
        require(amount >= minimumStake, "below min");
        token.safeTransferFrom(msg.sender, address(this), amount);
        providers[msg.sender] = Info({stake: amount, rewardDebt: 0});
        totalStake += amount;
        registered[msg.sender] = true;
        allProviders.push(msg.sender);
        emit ProviderRegistered(msg.sender, amount);
    }

    function increaseStake(uint256 amount) external nonReentrant {
        require(registered[msg.sender], "not reg");
        require(amount > 0, "zero");
        token.safeTransferFrom(msg.sender, address(this), amount);
        Info storage i = providers[msg.sender];
        i.stake += amount;
        totalStake += amount;
        emit StakeIncreased(msg.sender, amount, i.stake);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        require(registered[msg.sender], "not reg");
        Info storage i = providers[msg.sender];
        require(i.stake >= amount, "insufficient");
        i.stake -= amount;
        totalStake -= amount;
        token.safeTransfer(msg.sender, amount);
        if (i.stake == 0) { registered[msg.sender] = false; }
        emit StakeWithdrawn(msg.sender, amount, i.stake);
    }

    // ---- rewards ----
    function harvestRewards() external nonReentrant {
        require(registered[msg.sender], "not reg");
        uint256 beforeBal = token.balanceOf(address(this));
        emissionContract.harvest(msg.sender);
        uint256 afterBal = token.balanceOf(address(this));
        uint256 harvested = afterBal - beforeBal;
        require(harvested > 0, "no rewards");

        // Update reward debt after harvest
        Info storage i = providers[msg.sender];
        uint256 acc = emissionContract.accRewardPerShare();
        i.rewardDebt = (i.stake * acc) / 1e12;

        // push to distributor and notify
        token.safeTransfer(address(merkleDistributor), harvested);
        merkleDistributor.notifyReward(msg.sender, harvested);
        emit Harvested(msg.sender, harvested);
    }

    // called by Emission to update rewardDebt after harvest
    function notifyReward(address provider, uint256) external {
        require(msg.sender == address(emissionContract), "only emission");
        Info storage i = providers[provider];
        uint256 acc = emissionContract.accRewardPerShare();
        i.rewardDebt = (i.stake * acc) / 1e12;
    }

    // ---- views ----
    function getTotalStaked() external view returns (uint256) { return totalStake; }
    function getProviderInfo(address p) external view returns (uint256, uint256) {
        Info memory i = providers[p]; return (i.stake, i.rewardDebt);
    }

    // ---- safety ----
    function emergencyWithdraw(address provider) external onlyRole(ADMIN_ROLE) nonReentrant {
        Info storage i = providers[provider];
        uint256 amt = i.stake;
        require(amt > 0, "none");
        i.stake = 0; totalStake -= amt;
        token.safeTransfer(provider, amt);
        emit EmergencyWithdrawal(provider, amt);
    }
}
