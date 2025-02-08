// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MyntisToken.sol";

interface IEmissionContract {
    function harvest(address provider) external;
    function accRewardPerShare() external view returns (uint256);
}

interface IMerkleDistributor {
    function notifyReward(address provider, uint256 amount) external;
}

/**
 * @title StakingContract
 * @notice Manages provider staking, reward harvesting, and basic accounting.
 */
contract StakingContract is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    // Declare the token as an IERC20 to ensure SafeERC20 functions are available.
    IERC20 public immutable myntisToken;

    address public emissionContract;
    address public merkleDistributor;

    uint256 public constant MINIMUM_STAKE = 1_000 * 1e18;
    uint256 public totalStake;

    struct ProviderInfo {
        uint256 stake;       // Total staked tokens
        uint256 rewardDebt;  // For reward accounting in EmissionContract
    }

    mapping(address => ProviderInfo) public providers;
    mapping(address => bool) private isProvider;

    address[] public allProviders;

    event ProviderRegistered(address indexed provider, uint256 stakeAmount);
    event StakeIncreased(address indexed provider, uint256 addedStake, uint256 newStake);
    event StakeWithdrawn(address indexed provider, uint256 withdrawnStake, uint256 remainingStake);
    event Harvested(address indexed provider, uint256 harvestedAmount);
    event EmissionContractUpdated(address newEmissionContract);
    event MerkleDistributorUpdated(address newMerkleDistributor);
    event EmergencyWithdrawal(address indexed provider, uint256 amount);

    constructor(address _myntisToken, address _admin) {
        myntisToken = IERC20(_myntisToken);
        _grantRole(ADMIN_ROLE, _admin);
    }

    // ----------------------------
    //    ADMIN-CONFIG FUNCTIONS
    // ----------------------------

    function setEmissionContract(address _emissionContract) external onlyRole(ADMIN_ROLE) {
        require(_emissionContract != address(0), "Invalid address");
        emissionContract = _emissionContract;
        emit EmissionContractUpdated(_emissionContract);
    }

    function setMerkleDistributor(address _merkleDistributor) external onlyRole(ADMIN_ROLE) {
        require(_merkleDistributor != address(0), "Invalid address");
        merkleDistributor = _merkleDistributor;
        emit MerkleDistributorUpdated(_merkleDistributor);
    }

    /**
     * @notice Emergency function to withdraw a provider's stake if needed.
     */
    function emergencyWithdraw(address provider) external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 staked = providers[provider].stake;
        require(staked > 0, "No stake to withdraw");

        // Zero out the provider's stake.
        providers[provider].stake = 0;
        totalStake -= staked;
        // Transfer tokens using SafeERC20.
        myntisToken.safeTransfer(provider, staked);

        emit EmergencyWithdrawal(provider, staked);
    }

    // ----------------------------
    //        STAKING LOGIC
    // ----------------------------

    function registerProvider(uint256 amount) external nonReentrant {
        require(amount >= MINIMUM_STAKE, "Stake below minimum");
        require(IERC20(address(myntisToken)).balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(!isProvider[msg.sender], "Provider already registered");

        myntisToken.safeTransferFrom(msg.sender, address(this), amount);
        
        ProviderInfo storage info = providers[msg.sender];
        info.stake = amount;
        totalStake += amount;

        isProvider[msg.sender] = true;
        allProviders.push(msg.sender);

        emit ProviderRegistered(msg.sender, amount);
    }

    function increaseStake(uint256 amount) external nonReentrant {
        require(isProvider[msg.sender], "Not a registered provider");
        require(amount > 0, "No stake added");
        require(IERC20(address(myntisToken)).balanceOf(msg.sender) >= amount, "Insufficient balance");

        myntisToken.safeTransferFrom(msg.sender, address(this), amount);
        providers[msg.sender].stake += amount;
        totalStake += amount;

        emit StakeIncreased(msg.sender, amount, providers[msg.sender].stake);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        require(isProvider[msg.sender], "Not a registered provider");
        ProviderInfo storage info = providers[msg.sender];
        require(info.stake >= amount, "Insufficient staked amount");

        info.stake -= amount;
        totalStake -= amount;

        myntisToken.safeTransfer(msg.sender, amount);

        // Deregister provider if their stake drops to zero.
        if (info.stake == 0) {
            isProvider[msg.sender] = false;
        }

        emit StakeWithdrawn(msg.sender, amount, info.stake);
    }

    // ----------------------------
    //        REWARD LOGIC
    // ----------------------------

    /**
     * @notice Harvest newly minted rewards from EmissionContract,
     * then deposit them into the MerkleDistributor for further distribution.
     */
    function harvestRewards() external nonReentrant {
        require(isProvider[msg.sender], "Not a provider");
        require(emissionContract != address(0), "Emission contract not set");
        require(merkleDistributor != address(0), "Merkle distributor not set");

        uint256 balanceBefore = myntisToken.balanceOf(address(this));
        IEmissionContract(emissionContract).harvest(msg.sender);
        uint256 balanceAfter = myntisToken.balanceOf(address(this));

        uint256 harvestedAmount = balanceAfter - balanceBefore;
        require(harvestedAmount > 0, "No rewards harvested");

        // Transfer harvested tokens to MerkleDistributor.
        myntisToken.safeTransfer(merkleDistributor, harvestedAmount);
        // Notify MerkleDistributor of the new rewards.
        IMerkleDistributor(merkleDistributor).notifyReward(msg.sender, harvestedAmount);

        emit Harvested(msg.sender, harvestedAmount);
    }

    // Called by EmissionContract to update a provider's reward debt.
    function notifyReward(address provider, uint256) external {
        require(msg.sender == emissionContract, "Caller not EmissionContract");
        ProviderInfo storage info = providers[provider];
        uint256 currentAccReward = IEmissionContract(emissionContract).accRewardPerShare();
        info.rewardDebt = (info.stake * currentAccReward) / 1e12;
    }

    // ----------------------------
    //     VIEW/UTILITY FUNCTIONS
    // ----------------------------

    function getProviderInfo(address provider) external view returns (uint256 stake, uint256 rewardDebt) {
        ProviderInfo memory info = providers[provider];
        return (info.stake, info.rewardDebt);
    }

    function getTotalStaked() external view returns (uint256) {
        return totalStake;
    }

    function isRegisteredProvider(address provider) external view returns (bool) {
        return isProvider[provider];
    }
}
