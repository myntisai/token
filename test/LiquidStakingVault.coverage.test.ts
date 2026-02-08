import { expect } from "chai";
import { ethers } from "hardhat";

describe("LiquidStakingVault Coverage", function () {
  async function deployFixture() {
    const [admin, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const Staking = await ethers.getContractFactory("MockDualPoolStaking");
    const staking = await Staking.deploy(await token.getAddress());
    await staking.waitForDeployment();

    const Vault = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await Vault.deploy(await token.getAddress(), await staking.getAddress(), admin.address);
    await vault.waitForDeployment();

    await token.mint(user.address, ethers.parseEther("100"));
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("100"));

    return { admin, user, token, staking, vault };
  }

  it("constructor and setters validation", async function () {
    const [admin] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const Staking = await ethers.getContractFactory("MockDualPoolStaking");
    const staking = await Staking.deploy(await token.getAddress());
    await staking.waitForDeployment();

    const Vault = await ethers.getContractFactory("LiquidStakingVault");
    await expect(Vault.deploy(ethers.ZeroAddress, await staking.getAddress(), admin.address)).to.be.reverted;
    await expect(Vault.deploy(await token.getAddress(), ethers.ZeroAddress, admin.address)).to.be.reverted;
    await expect(Vault.deploy(await token.getAddress(), await staking.getAddress(), ethers.ZeroAddress)).to.be.reverted;

    const vault = await Vault.deploy(await token.getAddress(), await staking.getAddress(), admin.address);
    await vault.waitForDeployment();

    await expect(vault.setDualPoolStaking(ethers.ZeroAddress)).to.be.reverted;
    const staking2 = await Staking.deploy(await token.getAddress());
    await staking2.waitForDeployment();
    await vault.setDualPoolStaking(await staking2.getAddress());
  });

  it("deposit/mint/withdraw/redeem and rewards", async function () {
    const { user, token, staking, vault } = await deployFixture();
    const assets = ethers.parseEther("10");

    await vault.connect(user).deposit(assets, user.address);

    // auto-harvest before share ops should clear pending rewards
    await token.mint(await staking.getAddress(), ethers.parseEther("5"));
    await staking.setPendingRewards(ethers.parseEther("1"));
    await vault.connect(user).deposit(ethers.parseEther("1"), user.address);
    expect(await staking.pendingRewards(user.address)).to.equal(0n);
    expect(await token.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("1"));

    await vault.connect(user).mint(assets, user.address);

    await staking.setPendingRewards(ethers.parseEther("1"));
    await vault.harvestVaultRewards();
    await staking.setPendingRewards(ethers.parseEther("1"));
    await vault.compoundRewards();

    // ensure staking has enough balance for withdrawals
    await token.mint(await staking.getAddress(), ethers.parseEther("100"));

    await vault.connect(user).withdraw(assets, user.address, user.address);
    await vault.connect(user).redeem(assets, user.address, user.address);

    // view functions
    await vault.totalAssets();
    await vault.convertToAssets(1);
    await vault.convertToShares(1);
    await vault.previewDeposit(1);
    await vault.previewMint(1);
    await vault.previewWithdraw(1);
    await vault.previewRedeem(1);
    await vault.pendingVaultRewards();
  });
});
