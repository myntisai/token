import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("EmissionsContract Coverage", function () {
  async function deployFixture(stakingSet = true) {
    const [admin, provider, other] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MockMyntisToken");
    const token = await TokenFactory.deploy();
    await token.waitForDeployment();

    const StakingFactory = await ethers.getContractFactory("MockStakingPool");
    const staking = await StakingFactory.deploy(await token.getAddress());
    await staking.waitForDeployment();

    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    const emissions = await EmissionsFactory.deploy(
      await token.getAddress(),
      stakingSet ? await staking.getAddress() : ethers.ZeroAddress,
      admin.address
    );
    await emissions.waitForDeployment();

    await staking.setEmissionsContract(await emissions.getAddress());

    return { admin, provider, other, token, staking, emissions };
  }

  it("constructor guards zero token/admin", async function () {
    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    const TokenFactory = await ethers.getContractFactory("MockMyntisToken");
    const token = await TokenFactory.deploy();
    await token.waitForDeployment();

    await expect(
      EmissionsFactory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.reverted;

    await expect(
      EmissionsFactory.deploy(await token.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.reverted;
  });

  it("setStakingContract validations", async function () {
    const { emissions, admin, other } = await deployFixture();
    await expect(emissions.connect(admin).setStakingContract(ethers.ZeroAddress)).to.be.reverted;
    await expect(emissions.connect(admin).setStakingContract(other.address)).to.be.revertedWith(
      "Staking must be a contract"
    );
  });

  it("migration init guards and success", async function () {
    const { emissions, admin } = await deployFixture();

    await expect(
      emissions.connect(admin).initializeMigration(0, 0, 0, 0, 0, [admin.address], [])
    ).to.be.revertedWith("Length mismatch");

    const providers = Array(201).fill(admin.address);
    const debts = Array(201).fill(0);
    await expect(
      emissions.connect(admin).initializeMigration(0, 0, 0, 0, 0, providers, debts)
    ).to.be.revertedWith("Batch too large");

    const tooBig = ethers.parseEther("900000000");
    await expect(
      emissions.connect(admin).initializeMigration(tooBig, 0, 0, 0, 0, [], [])
    ).to.be.revertedWith("Exceeds emissions cap");

    await expect(
      emissions.connect(admin).initializeMigration(0, tooBig, 0, 0, 0, [], [])
    ).to.be.revertedWith("Exceeds emissions cap");

    await expect(
      emissions.connect(admin).initializeMigration(10, 5, 0, 0, 0, [], [])
    ).to.be.revertedWith("Accounted must be >= minted");

    const now = await time.latest();
    await emissions.connect(admin).initializeMigration(1, 1, 0, now, now, [admin.address], [1]);
    await expect(
      emissions.connect(admin).initializeMigration(1, 1, 0, now, now, [], [])
    ).to.be.revertedWithCustomError(emissions, "MigrationAlreadyInitialized");
  });

  it("initialize provider debt guards and success", async function () {
    const { emissions, admin, provider, staking } = await deployFixture();

    await expect(emissions.connect(admin).initializeProviderDebt(ethers.ZeroAddress)).to.be.reverted;

    await staking.setProvider(provider.address, 0, 0);
    await expect(
      emissions.connect(admin).initializeProviderDebt(provider.address)
    ).to.be.revertedWith("Provider has no stake");

    await staking.setProvider(provider.address, 100, 0);
    await staking.setTotals(100, 100);
    await time.increase(10);
    await emissions.updateEmissions();
    await emissions.connect(admin).initializeProviderDebt(provider.address);

    await expect(
      emissions.connect(admin).initializeProviderDebt(provider.address)
    ).to.be.revertedWith("Provider debt already initialized");
  });

  it("batch initialize provider debt guards and behavior", async function () {
    const { emissions, admin, provider, staking } = await deployFixture();

    const providers = Array(201).fill(provider.address);
    await expect(
      emissions.connect(admin).batchInitializeProviderDebt(providers)
    ).to.be.revertedWith("Batch too large");

    await staking.setProvider(provider.address, 100, 0);
    await emissions.connect(admin).batchInitializeProviderDebt([provider.address, ethers.ZeroAddress]);
  });

  it("updateEmissions branches", async function () {
    const { emissions, staking, provider, admin } = await deployFixture();

    // Set migration baseline and run one immediate update
    const now = await time.latest();
    await emissions.connect(admin).initializeMigration(0, 0, 0, now, now, [], []);
    await emissions.updateEmissions();

    // emissionRate == 0
    const halving = await emissions.HALVING_PERIOD();
    await time.increase(halving * 26n);
    await emissions.updateEmissions();

    // totalStake == 0
    await staking.setTotals(0, 0);
    await time.increase(10);
    await emissions.updateEmissions();

    // providerStake == 0 but totalStake > 0 (user-only stake)
    const accBefore = await emissions.accRewardPerShare();
    await staking.setTotals(100, 0);
    await time.increase(10);
    await emissions.updateEmissions();
    const accAfter = await emissions.accRewardPerShare();
    expect(accAfter).to.equal(accBefore);

    // tokensToAccount capped
    await staking.setTotals(100, 100);
    await staking.setProvider(provider.address, 100, 0);
    await emissions.correctAccountedEmissions(await emissions.TOTAL_EMISSIONS());
    await time.increase(10);
    await emissions.updateEmissions();
  });

  it("initializeNewProvider paths", async function () {
    const { emissions, staking, provider } = await deployFixture();
    await staking.setProvider(provider.address, 50, 0);

    await expect(emissions.initializeNewProvider(provider.address)).to.be.reverted;

    await staking.callInitializeNewProvider(provider.address);
    await staking.callInitializeNewProvider(provider.address);
  });

  it("pendingRewards branches", async function () {
    const { emissions, staking, token, provider } = await deployFixture();

    await staking.setTotals(100, 100);
    await staking.setProvider(provider.address, 100, 0);
    await staking.setPendingRewards(provider.address, 0);

    // pendingRewards with no time advance
    expect(await emissions.pendingRewards(provider.address)).to.equal(0n);

    // Canonical pending now comes from staking contract
    await staking.setPendingRewards(provider.address, 1234);
    const pending = await emissions.pendingRewards(provider.address);
    expect(pending).to.equal(1234n);
  });

  it("pendingRewards caps tokensToAccount at remaining", async function () {
    const { emissions, staking, provider, admin } = await deployFixture();

    await staking.setTotals(100, 100);
    await staking.setProvider(provider.address, 100, 0);

    const total = await emissions.TOTAL_EMISSIONS();
    await emissions.connect(admin).correctAccountedEmissions(total - 1n);
    await time.increase(10);

    await emissions.pendingRewards(provider.address);
  });

  it("harvest returns 0 when no pending emissions", async function () {
    const { emissions, staking, provider } = await deployFixture();

    await staking.setTotals(0, 0);
    await staking.setProvider(provider.address, 0, 0);

    await emissions.initializeMigration(0, 0, 0, 1, 1, [], []);
    await time.increase(10);

    await staking.callHarvest(provider.address);
  });

  it("harvest reverts on max supply", async function () {
    const { emissions, staking, token, provider } = await deployFixture();

    await staking.setTotals(100, 100);
    await staking.setProvider(provider.address, 100, 0);

    const max = await emissions.MAX_SUPPLY();
    await token.setTotalSupply(max);
    await time.increase(10);

    await expect(staking.callHarvest(provider.address)).to.be.reverted;
  });

  it("harvest succeeds when within caps", async function () {
    const { emissions, staking, token, provider } = await deployFixture();

    await staking.setTotals(100, 100);
    await staking.setProvider(provider.address, 100, 0);
    await token.setTotalSupply(0);
    await time.increase(10);

    await staking.callHarvest(provider.address);
  });

  it("correctAccountedEmissions guards", async function () {
    const { emissions, admin } = await deployFixture();
    const total = await emissions.TOTAL_EMISSIONS();

    await expect(
      emissions.connect(admin).correctAccountedEmissions(total + 1n)
    ).to.be.revertedWith("Exceeds total emissions cap");

    await emissions.connect(admin).initializeMigration(1, 1, 0, 1, 1, [], []);
    await expect(
      emissions.connect(admin).correctAccountedEmissions(0)
    ).to.be.revertedWith("Cannot be less than minted");

    await emissions.connect(admin).correctAccountedEmissions(total);
  });

  it("staking not set guards", async function () {
    const { emissions } = await deployFixture(false);
    await expect(emissions.updateEmissions()).to.be.reverted;
    await expect(emissions.pendingRewards(ethers.ZeroAddress)).to.be.reverted;
    await expect(emissions.harvest(ethers.ZeroAddress)).to.be.reverted;
    await expect(emissions.batchInitializeProviderDebt([])).to.be.reverted;
    await expect(emissions.initializeProviderDebt(ethers.ZeroAddress)).to.be.reverted;
  });

  it("view helpers and zero-pending harvest", async function () {
    const { emissions, staking, provider } = await deployFixture();

    const TokenFactory = await ethers.getContractFactory("MockMyntisToken");
    const token = await TokenFactory.deploy();
    await token.waitForDeployment();
    const StakingFactory = await ethers.getContractFactory("MockStakingPool");
    const freshStaking = await StakingFactory.deploy(await token.getAddress());
    await freshStaking.waitForDeployment();
    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    const fresh = await EmissionsFactory.deploy(
      await token.getAddress(),
      await freshStaking.getAddress(),
      (await ethers.getSigners())[0].address
    );
    await fresh.waitForDeployment();
    await fresh.getCurrentEmissionRate();

    await emissions.remainingEmissions();

    await emissions.updateEmissions();
    await emissions.updateEmissions();

    await staking.setProvider(provider.address, 0, 0);
    await staking.setTotals(0, 0);
    await staking.callHarvest(provider.address);

    await emissions.getContractInfo();
  });
});
