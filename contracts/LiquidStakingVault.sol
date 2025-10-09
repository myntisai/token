// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
    
    // Events
    event StakingContractUpdated(address indexed newStakingContract);
    event RewardsCompounded(uint256 amount);
    
    constructor(
        address _asset,
        address _dualPoolStaking,
        address admin
    ) ERC4626(_asset) ERC20("Liquid Staked Myntis", "lsMYNT") {
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
        
        // Stake in dual pool staking user pool
        _stakeInUserPool(assets);
        
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
        
        // Stake in dual pool staking user pool
        _stakeInUserPool(assets);
        
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
     */
    function redeem(uint256 shares, address receiver, address owner)
        public 
        override 
        nonReentrant 
        returns (uint256 assets) 
    {
        assets = super.redeem(shares, receiver, owner);
        
        // Unstake from dual pool staking user pool
        _unstakeFromUserPool(assets, owner);
        
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
     */
    function totalAssets() public view override returns (uint256) {
        // In production, this would return:
        // - Staked amount in dual pool staking
        // - Pending rewards
        // - Any uninvested assets
        
        // For now, return the balance of the underlying asset
        return IERC20(asset()).balanceOf(address(this));
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
    
    function _stakeInUserPool(uint256 amount) internal {
        // Approve dual pool staking to spend assets
        IERC20(asset()).approve(dualPoolStaking, amount);
        
        // Call stakeToUserPool on dual pool staking
        (bool success, ) = dualPoolStaking.call(
            abi.encodeWithSignature("stakeToUserPool(uint256,address)", amount, msg.sender)
        );
        require(success, "Staking failed");
    }
    
    function _unstakeFromUserPool(uint256 amount, address owner) internal {
        // Call unstakeFromUserPool on dual pool staking
        (bool success, ) = dualPoolStaking.call(
            abi.encodeWithSignature("unstakeFromUserPool(uint256,address)", amount, owner)
        );
        require(success, "Unstaking failed");
    }
}
