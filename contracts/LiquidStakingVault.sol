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
    function harvestRewards(address user) external;
    function pendingRewards(address user) external view returns (uint256);
}

/**
 * @title LiquidStakingVault
 * @notice ERC-4626 vault for liquid staking in the user pool
 * @dev Mints lsMYNT shares for user pool staking
 * @dev Shares are fully transferrable (liquid staking)
 * @dev SECURITY FIX: All stakes are attributed to the vault address (not individual users)
 *      This allows shares to be transferred while maintaining correct stake accounting
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
     * @dev SECURITY FIX: Stakes to vault address, not individual user
     */
    function deposit(uint256 assets, address receiver) 
        public 
        override 
        nonReentrant 
        returns (uint256 shares) 
    {
        shares = super.deposit(assets, receiver);
        
        // SECURITY FIX: Stake to vault address (address(this)), not individual user
        // This allows shares to be transferred and still redeemable
        _stakeInUserPool(assets);
        
        return shares;
    }
    
    /**
     * @notice Mint shares and stake in user pool
     * @param shares Amount of shares to mint
     * @param receiver Address to receive shares
     * @return assets Amount of assets deposited
     * @dev SECURITY FIX: Stakes to vault address, not individual user
     */
    function mint(uint256 shares, address receiver) 
        public 
        override 
        nonReentrant 
        returns (uint256 assets) 
    {
        assets = super.mint(shares, receiver);
        
        // SECURITY FIX: Stake to vault address (address(this)), not individual user
        _stakeInUserPool(assets);
        
        return assets;
    }
    
    /**
     * @notice Withdraw assets and unstake from user pool
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return shares Amount of shares burned
     * @dev SECURITY FIX: Unstakes from vault's position, not individual user
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public 
        override 
        nonReentrant 
        returns (uint256 shares) 
    {
        // SECURITY FIX: Unstake from vault's position (not individual owner)
        _unstakeFromUserPool(assets);
        
        shares = super.withdraw(assets, receiver, owner);
        
        return shares;
    }
    
    /**
     * @notice Redeem shares and unstake from user pool
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Address that owns the shares
     * @return assets Amount of assets withdrawn
     * @dev SECURITY FIX: Unstakes from vault's position for correct share transferability
     */
    function redeem(uint256 shares, address receiver, address owner)
        public 
        override 
        nonReentrant 
        returns (uint256 assets) 
    {
        // Calculate assets first
        assets = previewRedeem(shares);
        
        // SECURITY FIX: Unstake from vault's position (not individual owner)
        _unstakeFromUserPool(assets);
        
        // Then burn shares and transfer assets
        uint256 actualAssets = super.redeem(shares, receiver, owner);
        
        // Verify the amounts match
        require(actualAssets == assets, "Asset mismatch after redeem");
        
        return assets;
    }
    
    /**
     * @notice Harvest staking rewards for the vault
     * @dev SECURITY FIX: Harvests rewards from DualPoolStaking to vault balance
     * @dev Anyone can call this to harvest rewards on behalf of all share holders
     * @return harvested Amount of rewards harvested
     */
    function harvestVaultRewards() external nonReentrant returns (uint256 harvested) {
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        
        // Harvest rewards from staking contract (rewards sent to vault)
        IDualPoolStaking(dualPoolStaking).harvestRewards(address(this));
        
        uint256 balanceAfter = IERC20(asset()).balanceOf(address(this));
        harvested = balanceAfter - balanceBefore;
        
        emit RewardsCompounded(harvested);
        return harvested;
    }
    
    /**
     * @notice Get pending rewards for the vault
     * @return Pending rewards that can be harvested
     */
    function pendingVaultRewards() external view returns (uint256) {
        return IDualPoolStaking(dualPoolStaking).pendingRewards(address(this));
    }
    
    /**
     * @notice Compound rewards by harvesting and re-staking
     * @dev Harvests rewards and re-stakes them to increase share value
     * @return compounded Amount of rewards compounded
     */
    function compoundRewards() external nonReentrant returns (uint256 compounded) {
        uint256 balanceBefore = IERC20(asset()).balanceOf(address(this));
        
        // Harvest rewards
        IDualPoolStaking(dualPoolStaking).harvestRewards(address(this));
        
        uint256 harvested = IERC20(asset()).balanceOf(address(this)) - balanceBefore;
        
        // Re-stake harvested rewards if any
        if (harvested > 0) {
            _stakeInUserPool(harvested);
            compounded = harvested;
        }
        
        emit RewardsCompounded(compounded);
        return compounded;
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
    
    /**
     * @notice Decimals offset for virtual share protection
     * @dev SECURITY FIX: Protects against ERC-4626 first-depositor inflation attack
     * @dev Adds virtual assets/shares to prevent share price manipulation
     * @return Decimal offset (3 = 1000x virtual multiplier)
     */
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3; // Provides protection against inflation attacks
    }
    
    // Internal functions
    
    /**
     * @notice Stake assets in user pool for the vault
     * @param amount Amount to stake
     * @dev SECURITY FIX: Stakes to vault address (address(this)) for share transferability
     * @dev All deposits are pooled under the vault's ownership in DualPoolStaking
     */
    function _stakeInUserPool(uint256 amount) internal {
        // Approve dual pool staking to spend assets
        IERC20(asset()).approve(dualPoolStaking, amount);
        
        // SECURITY FIX: Stake to vault address (address(this))
        // This ensures any share holder can redeem since the vault owns the stake
        IDualPoolStaking(dualPoolStaking).stakeToUserPool(amount, address(this));
        
        // Reset approval to 0 after staking
        IERC20(asset()).approve(dualPoolStaking, 0);
        
        // Track vault deposits
        totalVaultDeposits += amount;
        emit VaultDeposit(address(this), amount);
    }
    
    /**
     * @notice Unstake assets from vault's user pool position
     * @param amount Amount to unstake
     * @dev SECURITY FIX: Unstakes from vault's position for share transferability
     */
    function _unstakeFromUserPool(uint256 amount) internal {
        // SECURITY FIX: Unstake from vault's position (address(this))
        IDualPoolStaking(dualPoolStaking).unstakeFromUserPool(amount, address(this));
        
        // Track vault withdrawals
        totalVaultDeposits -= amount;
        emit VaultWithdraw(address(this), amount);
    }
}
