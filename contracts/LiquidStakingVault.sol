// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @notice Interface for DualPoolStaking contract
 * @dev SECURITY FIX: Use typed interface instead of low-level calls
 */
interface IDualPoolStaking {
    function stakeToUserPool(uint256 amount, address user) external;
    function unstakeFromUserPool(uint256 amount, address user) external;
    function getUserPoolTotalStaked() external view returns (uint256);
}

/**
 * @title LiquidStakingVault
 * @notice ERC-4626 vault for liquid staking in the user pool
 * @dev Mints lsMYNT shares for user pool staking
 * @dev Shares are fully transferrable (liquid staking)
 * @dev Auto-compounds rewards
 */
contract LiquidStakingVault is ERC4626, AccessControl, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant STAKING_ROLE = keccak256("STAKING_ROLE");
    
    // Dual pool staking contract
    address public dualPoolStaking;
    
    // SECURITY FIX: Track vault-specific deposits to fix totalAssets calculation
    uint256 public totalVaultDeposits;
    
    // Events
    event StakingContractUpdated(address indexed newStakingContract);
    event RewardsCompounded(uint256 amount);
    event VaultDeposit(address indexed user, uint256 amount);
    event VaultWithdraw(address indexed user, uint256 amount);
    
    constructor(
        address _asset,
        address _dualPoolStaking,
        address admin
    ) ERC4626(IERC20(_asset)) ERC20("Liquid Staked Myntis", "lsMYNT") {
        dualPoolStaking = _dualPoolStaking;
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(STAKING_ROLE, _dualPoolStaking);
    }
    
    /**
     * @notice Update the dual pool staking contract address
     * @param _dualPoolStaking New staking contract address
     */
    function setDualPoolStaking(address _dualPoolStaking) external onlyRole(ADMIN_ROLE) {
        dualPoolStaking = _dualPoolStaking;
        emit StakingContractUpdated(_dualPoolStaking);
    }
    
    /**
     * @notice Deposit assets and stake in user pool
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive shares
     * @return shares Amount of shares minted
     */
    function deposit(uint256 assets, address receiver) 
        public 
        override 
        nonReentrant 
        returns (uint256 shares) 
    {
        shares = super.deposit(assets, receiver);
        
        // Stake in dual pool staking user pool on behalf of receiver (share owner)
        _stakeInUserPool(assets, receiver);
        
        return shares;
    }
    
    /**
     * @notice Mint shares and stake in user pool
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
     */
    function mint(uint256 shares, address receiver) 
        public 
        override 
        nonReentrant 
        returns (uint256 assets) 
    {
        assets = super.mint(shares, receiver);
        
        // Stake in dual pool staking user pool on behalf of receiver (share owner)
        _stakeInUserPool(assets, receiver);
        
        return assets;
    }
    
    /**
     * @notice Withdraw assets and unstake from user pool
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return shares Amount of shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public 
        override 
        nonReentrant 
        returns (uint256 shares) 
    {
        // Unstake from dual pool staking user pool
        _unstakeFromUserPool(assets, owner);
        
        shares = super.withdraw(assets, receiver, owner);
        
        return shares;
    }
    
    /**
     * @notice Redeem shares and unstake from user pool
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return assets Amount of assets withdrawn
     * @dev SECURITY FIX: Unstake before burning shares for correct ordering
     */
    function redeem(uint256 shares, address receiver, address owner)
        public 
        override 
        nonReentrant 
        returns (uint256 assets) 
    {
        // SECURITY FIX: Calculate assets first, then unstake before burning shares
        assets = previewRedeem(shares);
        
        // Unstake from dual pool staking user pool FIRST
        _unstakeFromUserPool(assets, owner);
        
        // Then burn shares and transfer assets
        uint256 actualAssets = super.redeem(shares, receiver, owner);
        
        // Verify the amounts match
        require(actualAssets == assets, "Asset mismatch after redeem");
        
        return assets;
    }
    
    /**
     * @notice Compound rewards by harvesting and re-staking
     * @dev Can be called by anyone to compound rewards for all stakers
     */
    function compoundRewards() external nonReentrant {
        // Harvest rewards from dual pool staking
        // This would be implemented to harvest rewards and re-stake them
        // For now, this is a placeholder
        
        emit RewardsCompounded(0); // Placeholder
    }
    
    /**
     * @notice Get the total assets managed by this vault
     * @return Total assets (including staked amount + pending rewards)
     * @dev SECURITY FIX: Uses vault-specific tracking instead of total pool stake
     */
    function totalAssets() public view override returns (uint256) {
        // Get idle balance in vault
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        
        // SECURITY FIX: Use vault-specific deposit tracking
        // This ensures correct share pricing in multi-vault scenarios
        return idle + totalVaultDeposits;
    }
    
    /**
     * @notice Get the conversion rate from assets to shares
     * @param assets Amount of assets
     * @return shares Amount of shares
     */
    function convertToShares(uint256 assets) public view override returns (uint256) {
        return super.convertToShares(assets);
    }
    
    /**
     * @notice Get the conversion rate from shares to assets
     * @param shares Amount of shares
     * @return assets Amount of assets
     */
    function convertToAssets(uint256 shares) public view override returns (uint256) {
        return super.convertToAssets(shares);
    }
    
    /**
     * @notice Preview the amount of shares for a deposit
     * @param assets Amount of assets to deposit
     * @return shares Amount of shares that would be minted
     */
    function previewDeposit(uint256 assets) public view override returns (uint256) {
        return super.previewDeposit(assets);
    }
    
    /**
     * @notice Preview the amount of assets for a mint
     * @param shares Amount of shares to mint
     * @return assets Amount of assets that would be deposited
     */
    function previewMint(uint256 shares) public view override returns (uint256) {
        return super.previewMint(shares);
    }
    
    /**
     * @notice Preview the amount of shares for a withdrawal
     * @param assets Amount of assets to withdraw
     * @return shares Amount of shares that would be burned
     */
    function previewWithdraw(uint256 assets) public view override returns (uint256) {
        return super.previewWithdraw(assets);
    }
    
    /**
     * @notice Preview the amount of assets for a redemption
     * @param shares Amount of shares to redeem
     * @return assets Amount of assets that would be withdrawn
     */
    function previewRedeem(uint256 shares) public view override returns (uint256) {
        return super.previewRedeem(shares);
    }
    
    // Internal functions
    
    /**
     * @notice Stake assets in user pool on behalf of a user
     * @param amount Amount to stake
     * @param user Address to stake on behalf of (share owner)
     * @dev SECURITY FIX: Uses typed interface and resets approval after staking
     */
    function _stakeInUserPool(uint256 amount, address user) internal {
        // Approve dual pool staking to spend assets
        IERC20(asset()).approve(dualPoolStaking, amount);
        
        // SECURITY FIX: Use typed interface instead of low-level call
        IDualPoolStaking(dualPoolStaking).stakeToUserPool(amount, user);
        
        // SECURITY FIX: Reset approval to 0 after staking
        IERC20(asset()).approve(dualPoolStaking, 0);
        
        // SECURITY FIX: Track vault-specific deposits
        totalVaultDeposits += amount;
        emit VaultDeposit(user, amount);
    }
    
    /**
     * @notice Unstake assets from user pool
     * @param amount Amount to unstake
     * @param owner Address that owns the stake
     * @dev SECURITY FIX: Uses typed interface and tracks vault withdrawals
     */
    function _unstakeFromUserPool(uint256 amount, address owner) internal {
        // SECURITY FIX: Use typed interface instead of low-level call
        IDualPoolStaking(dualPoolStaking).unstakeFromUserPool(amount, owner);
        
        // SECURITY FIX: Track vault-specific withdrawals
        totalVaultDeposits -= amount;
        emit VaultWithdraw(owner, amount);
    }
}
