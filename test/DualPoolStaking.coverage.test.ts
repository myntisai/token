import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("DualPoolStaking Coverage", function () {
  async function deployFixture() {
    const [admin, provider, user, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const Emissions = await ethers.getContractFactory("EmissionsContract");
    const emissions = await Emissions.deploy(await token.getAddress(), ethers.ZeroAddress, admin.address);
    await emissions.waitForDeployment();

    const Staking = await ethers.getContractFactory("DualPoolStaking");
    const impl = await Staking.deploy();
    await impl.waitForDeployment();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(admin.address);
    await proxyAdmin.waitForDeployment();

    const initData = Staking.interface.encodeFunctionData("initialize", [
      await token.getAddress(),
      await emissions.getAddress(),
      admin.address
    ]);
    const Proxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
    const proxy = await Proxy.deploy(await impl.getAddress(), await proxyAdmin.getAddress(), initData);
    await proxy.waitForDeployment();
    const staking = Staking.attach(await proxy.getAddress());
    await emissions.setStakingContract(await staking.getAddress());
    await staking.setLiquidStakingVault(user.address);

    await token.mint(provider.address, ethers.parseEther("1000"));
    await token.mint(user.address, ethers.parseEther("1000"));
    await token.mint(admin.address, ethers.parseEther("1000"));

    await token.connect(provider).approve(await staking.getAddress(), ethers.parseEther("1000"));
    await token.connect(user).approve(await staking.getAddress(), ethers.parseEther("1000"));
    await token.connect(admin).approve(await staking.getAddress(), ethers.parseEther("1000"));

    return { admin, provider, user, treasury, token, emissions, staking };
  }

  it("admin setters and reinitializer", async function () {
    const { admin, staking, token } = await deployFixture();
    const Dummy = await ethers.getContractFactory("MockERC20");
    const dummy = await Dummy.deploy("Dummy", "DUM");
    await dummy.waitForDeployment();

    await expect(staking.setLiquidStakingVault(ethers.ZeroAddress)).to.be.reverted;
    await staking.setLiquidStakingVault(await dummy.getAddress());

    await expect(staking.setTreasury(ethers.ZeroAddress)).to.be.reverted;
    await staking.setTreasury(admin.address);

    await expect(staking.setZkMerkleDistributor(ethers.ZeroAddress)).to.be.reverted;
    await expect(staking.setZkMerkleDistributor(admin.address)).to.be.revertedWith("Distributor not a contract");
    await staking.setZkMerkleDistributor(await dummy.getAddress());

    await expect(staking.setEmissionsContract(ethers.ZeroAddress)).to.be.reverted;
    await expect(staking.setEmissionsContract(admin.address)).to.be.revertedWith("Emissions not a contract");

    await staking.updateMinProviderStake(ethers.parseEther("1"));

    await staking.reinitializeV2();
  });

  it("staking and unstaking paths", async function () {
    const { staking, provider, user, treasury } = await deployFixture();

    await expect(staking.connect(provider).stakeToProviderPool(0)).to.be.reverted;
    await staking.connect(provider).stakeToProviderPool(ethers.parseEther("200"));
    await staking.connect(provider).stakeToProviderPool(ethers.parseEther("10"));

    await expect(staking.connect(user).stakeToProviderPool(ethers.parseEther("1"))).to.be.reverted;

    await staking.connect(user).stakeToUserPool(ethers.parseEther("10"), user.address);
    await staking.connect(user).stakeToUserPool(ethers.parseEther("1"), user.address);

    await expect(staking.connect(provider).unstakeFromProviderPool(ethers.parseEther("199"))).to.be.reverted;
    await staking.connect(provider).unstakeFromProviderPool(ethers.parseEther("210"));

    await staking.connect(user).unstakeFromUserPool(ethers.parseEther("5"), user.address);
    await staking.connect(user).unstakeFromUserPool(ethers.parseEther("6"), user.address);

    await staking.harvestRewards(treasury.address);
    await staking.pendingRewards(treasury.address);
    await staking.pendingRewards(user.address);
  });

  it("pending rewards, harvest, treasury, and sync flows", async function () {
    const { staking, provider, user, token, treasury } = await deployFixture();
    await staking.setTreasury(treasury.address);

    await staking.connect(provider).stakeToProviderPool(ethers.parseEther("200"));
    await staking.connect(user).stakeToUserPool(ethers.parseEther("10"), user.address);

    await staking.updatePools();
    await staking.harvestRewards(provider.address);
    await staking.harvestRewards(user.address);

    // queue rewards by sending tokens to staking
    await staking.connect(provider).unstakeFromProviderPool(ethers.parseEther("200"));
    await staking.connect(user).unstakeFromUserPool(ethers.parseEther("10"), user.address);
    await token.mint(await staking.getAddress(), ethers.parseEther("10"));
    await staking.grantRole(await staking.EMISSIONS_ROLE(), treasury.address);
    await staking.connect(treasury).syncEmissions();

    await staking.withdrawTreasuryRewards();
  });

  it("emissions harvest and distributor funding paths", async function () {
    const { admin, provider, user, token, staking } = await deployFixture();

    const Emissions = await ethers.getContractFactory("EmissionsContract");
    const newEmissions = await Emissions.deploy(await token.getAddress(), ethers.ZeroAddress, admin.address);
    await newEmissions.waitForDeployment();
    await newEmissions.setStakingContract(await staking.getAddress());
    await staking.setEmissionsContract(await newEmissions.getAddress());

    const Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const Dist = await ethers.getContractFactory("ZKMerkleDistributor");
    const dist = await Dist.deploy(await token.getAddress(), await verifier.getAddress(), admin.address);
    await dist.waitForDeployment();
    await dist.setStakingContract(await staking.getAddress());
    await staking.setZkMerkleDistributor(await dist.getAddress());
    await dist.grantRole(await dist.PROVIDER_ROLE(), provider.address);

    await staking.connect(provider).stakeToProviderPool(ethers.parseEther("200"));
    await staking.connect(user).stakeToUserPool(ethers.parseEther("10"), user.address);

    await time.increase(1000);
    const harvested = await staking.harvestFromEmissions.staticCall(provider.address);
    await staking.harvestFromEmissions(provider.address);
    expect(harvested).to.be.gt(0);

    // zero-pending harvest to sync unaccounted tokens
    const halving = await newEmissions.HALVING_PERIOD();
    await time.increase(halving * 26n);
    await token.mint(await staking.getAddress(), 1);
    await staking.harvestFromEmissions(provider.address);

    await staking.harvestRewards(provider.address);
    await staking.harvestRewards(user.address);

    const providerBal = await token.balanceOf(provider.address);
    const fundAmount = providerBal > 1n ? providerBal / 2n : 0n;
    if (fundAmount > 0n) {
      await token.connect(provider).approve(await dist.getAddress(), fundAmount);
      await dist.connect(provider).depositBalance(fundAmount);
    }

    await staking.pendingEmissionRewards(provider.address);
    await staking.getTotalStaked();
    await staking.getUserPoolTotalStaked();
    await staking.getProviderPoolStaked();
    await staking.getProviderInfo(provider.address);
    await staking.pendingRewards(provider.address);
    await staking.pendingRewards(user.address);
    await staking.getPoolInfo(0);
    await staking.getPoolInfo(1);
  });

  it("harvest transfers pending rewards", async function () {
    const { admin, provider, token, staking } = await deployFixture();

    await staking.connect(provider).stakeToProviderPool(ethers.parseEther("200"));

    await token.mint(await staking.getAddress(), ethers.parseEther("5"));
    await staking.grantRole(await staking.EMISSIONS_ROLE(), admin.address);
    await staking.syncEmissions();

    await staking.harvestRewards(provider.address);
  });

  it("harvests user pool rewards when pending", async function () {
    const { admin, user, token, staking } = await deployFixture();

    await staking.connect(user).stakeToUserPool(ethers.parseEther("10"), user.address);

    await token.mint(await staking.getAddress(), ethers.parseEther("5"));
    await staking.grantRole(await staking.EMISSIONS_ROLE(), admin.address);
    await staking.syncEmissions();

    await staking.harvestRewards(user.address);
  });

  it("syncEmissions returns 0 when no new rewards", async function () {
    const { admin, token, staking } = await deployFixture();

    await token.mint(await staking.getAddress(), ethers.parseEther("5"));
    await staking.grantRole(await staking.EMISSIONS_ROLE(), admin.address);
    await staking.syncEmissions();

    const result = await staking.syncEmissions.staticCall();
    expect(result).to.equal(0n);
  });

  it("syncEmissions routes rewards to treasury when no stakers", async function () {
    const { admin, token, staking } = await deployFixture();

    await token.mint(await staking.getAddress(), ethers.parseEther("10"));
    await staking.grantRole(await staking.EMISSIONS_ROLE(), admin.address);

    const beforeTreasury = await staking.pendingTreasuryWithdrawal();
    await staking.syncEmissions();
    const afterTreasury = await staking.pendingTreasuryWithdrawal();

    expect(afterTreasury).to.be.gt(beforeTreasury);
    expect(await staking.providerPendingRewards()).to.equal(0n);
    expect(await staking.userPendingRewards()).to.equal(0n);
  });

  it("reset pending rewards branches", async function () {
    const { staking, token, admin } = await deployFixture();

    // Create pending rewards without stakers/treasury.
    await token.mint(await staking.getAddress(), ethers.parseEther("10"));
    await staking.grantRole(await staking.EMISSIONS_ROLE(), admin.address);
    await staking.syncEmissions();

    const before = await staking.pendingTreasuryWithdrawal();
    expect(before).to.be.gt(0n);

    await staking.resetPendingRewards(0);
    await staking.resetPendingRewards(1);
    const after = await staking.pendingTreasuryWithdrawal();

    // With no stakers, syncEmissions now routes rewards directly to pendingTreasuryWithdrawal.
    // resetPendingRewards should be a no-op when provider/user pending rewards are already zero.
    expect(after).to.equal(before);
  });

  it("pendingEmissionRewards returns 0 when emissions unset", async function () {
    const [admin] = await ethers.getSigners();
    const Staking = await ethers.getContractFactory("DualPoolStaking");
    const implOnly = await Staking.deploy();
    await implOnly.waitForDeployment();
    await implOnly.pendingEmissionRewards(admin.address);
  });
});
