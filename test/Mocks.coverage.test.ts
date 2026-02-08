import { expect } from "chai";
import { ethers } from "hardhat";

describe("Mocks Coverage", function () {
  it("mock staking helpers", async function () {
    const [admin] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const MockStaking = await ethers.getContractFactory("MockDualPoolStaking");
    const mockStaking = await MockStaking.deploy(await token.getAddress());
    await mockStaking.waitForDeployment();

    await mockStaking.getUserPoolTotalStaked();

    await token.mint(admin.address, 10);
    await token.approve(await mockStaking.getAddress(), 10);
    await mockStaking.stakeToUserPool(10, admin.address);
    expect(await mockStaking.getUserPoolTotalStaked()).to.equal(10);

    await expect(mockStaking.unstakeFromUserPool(11, admin.address)).to.be.revertedWith("insufficient stake");
    await mockStaking.setPendingRewards(1);
    await mockStaking.harvestRewards(admin.address);
    await mockStaking.harvestRewards(admin.address);
    await mockStaking.pendingRewards(admin.address);

    const MockPool = await ethers.getContractFactory("MockStakingPool");
    const pool = await MockPool.deploy(await token.getAddress());
    await pool.waitForDeployment();
    await pool.setTotals(10, 5);
    await pool.setProvider(admin.address, 3, 1);
    await pool.getProviderInfo(admin.address);
    await pool.getTotalStaked();
    await pool.getProviderPoolStaked();

    await expect(pool.callInitializeNewProvider(admin.address)).to.be.revertedWith("emissions not set");
    await expect(pool.callHarvest(admin.address)).to.be.revertedWith("emissions not set");

    const EmissionsRevert = await ethers.getContractFactory("EmissionsRevertMock");
    const revertEmissions = await EmissionsRevert.deploy();
    await revertEmissions.waitForDeployment();
    await pool.setEmissionsContract(await revertEmissions.getAddress());
    await expect(pool.callInitializeNewProvider(admin.address)).to.be.revertedWith("initializeNewProvider failed");
    await expect(pool.callHarvest(admin.address)).to.be.revertedWith("harvest failed");
  });
});
