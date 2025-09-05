import { expect } from "chai";
import { ethers, network } from "hardhat";
import { MyntisToken, StakingContract, EmissionContract, MerkleDistributor } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Full Flow Test", function () {
  let myntisToken: MyntisToken;
  let staking: StakingContract;
  let emissions: EmissionContract;
  let merkleDistributor: MerkleDistributor;
  let admin: SignerWithAddress, provider1: SignerWithAddress, provider2: SignerWithAddress, provider3: SignerWithAddress, other: SignerWithAddress;

  // Define mint amount and staking amounts for each provider
  const mintAmount = ethers.parseEther("10000");
  const stakeAmounts = {
    provider1: ethers.parseEther("1000"),
    provider2: ethers.parseEther("2000"),
    provider3: ethers.parseEther("3000")
  };

  beforeEach(async function () {
    // Retrieve signers
    [admin, provider1, provider2, provider3, other] = await ethers.getSigners();

    // Deploy MyntisToken and assign admin
    const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", admin);
    myntisToken = (await MyntisTokenFactory.deploy(admin.address)) as MyntisToken;
    await myntisToken.waitForDeployment();

    // Deploy MerkleDistributor
    const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor", admin);
    merkleDistributor = (await MerkleDistributorFactory.deploy(await myntisToken.getAddress(), admin.address)) as MerkleDistributor;
    await merkleDistributor.waitForDeployment();

    // Deploy StakingContract with token, emission (will set later), merkle distributor, and admin
    const StakingFactory = await ethers.getContractFactory("StakingContract", admin);
    staking = (await StakingFactory.deploy(await myntisToken.getAddress(), ethers.ZeroAddress, await merkleDistributor.getAddress(), admin.address)) as StakingContract;
    await staking.waitForDeployment();

    // Deploy EmissionsContract with token, staking, and admin
    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract", admin);
    emissions = (await EmissionsFactory.deploy(await myntisToken.getAddress(), await staking.getAddress(), admin.address)) as EmissionContract;
    await emissions.waitForDeployment();

    // Configure the system
    await myntisToken.grantRole(await myntisToken.MINTER_ROLE(), await emissions.getAddress());
    await staking.setEmissionContract(await emissions.getAddress());
    await merkleDistributor.setStakingContract(await staking.getAddress());

    // Mint initial MYNT to all providers
    await myntisToken.mint(provider1.address, mintAmount);
    await myntisToken.mint(provider2.address, mintAmount);
    await myntisToken.mint(provider3.address, mintAmount);
    await myntisToken.mint(other.address, mintAmount);

    // Approve staking and distributor contracts to spend provider tokens
    await myntisToken.connect(provider1).approve(await staking.getAddress(), mintAmount);
    await myntisToken.connect(provider1).approve(await merkleDistributor.getAddress(), mintAmount);
    await myntisToken.connect(provider2).approve(await staking.getAddress(), mintAmount);
    await myntisToken.connect(provider3).approve(await staking.getAddress(), mintAmount);
    await myntisToken.connect(other).approve(await merkleDistributor.getAddress(), mintAmount);

    // Register providers and stake MYNT in different ratios
    await staking.connect(provider1).registerProvider(stakeAmounts.provider1);
    await staking.connect(provider2).registerProvider(stakeAmounts.provider2);
    await staking.connect(provider3).registerProvider(stakeAmounts.provider3);

    // Grant EmissionContract the MINTER_ROLE on MyntisToken
    const MINTER_ROLE = await myntisToken.MINTER_ROLE();
    await myntisToken.grantRole(MINTER_ROLE, await emissions.getAddress());

    // Set staking contract inside the MerkleDistributor
    await merkleDistributor.setStakingContract(await staking.getAddress());
  });

  it("should distribute emissions to providers in a 1:2:3 ratio", async function () {
    // Simulate passage of time to generate emissions
    await network.provider.send("evm_increaseTime", [3600]); // fast-forward 1 hour
    await network.provider.send("evm_mine");

    // Trigger reward harvesting for all providers
    await staking.connect(provider1).harvestRewards();
    await staking.connect(provider2).harvestRewards();
    await staking.connect(provider3).harvestRewards();

    // Get updated stake and reward debt values
    const [stake1, rewardDebt1] = await staking.getProviderInfo(provider1.address);
    const [stake2, rewardDebt2] = await staking.getProviderInfo(provider2.address);
    const [stake3, rewardDebt3] = await staking.getProviderInfo(provider3.address);

    // Log values for manual inspection
    console.log("Provider 1 -> Stake:", stake1.toString(), " Reward Debt:", rewardDebt1.toString());
    console.log("Provider 2 -> Stake:", stake2.toString(), " Reward Debt:", rewardDebt2.toString());
    console.log("Provider 3 -> Stake:", stake3.toString(), " Reward Debt:", rewardDebt3.toString());

    // Check staking amounts are correct
    expect(stake1).to.equal(stakeAmounts.provider1);
    expect(stake2).to.equal(stakeAmounts.provider2);
    expect(stake3).to.equal(stakeAmounts.provider3);

    // Check reward ratios are close to 1:2:3
    const scaleFactor = 10000n;
    const ratio2 = (rewardDebt2 * scaleFactor) / rewardDebt1;
    const ratio3 = (rewardDebt3 * scaleFactor) / rewardDebt1;

    console.log("Relative ratios (scaled by 10000):");
    console.log("Provider 2/Provider 1 ratio:", ratio2.toString());
    console.log("Provider 3/Provider 1 ratio:", ratio3.toString());

    expect(ratio2).to.be.closeTo(20000n, 100n); // Expect ~2x
    expect(ratio3).to.be.closeTo(30000n, 100n); // Expect ~3x
  });

  it("should allow a provider to self notify rewards via transfer", async function () {
    const notifyAmount = ethers.parseEther("1000");

    // Provider1 calls selfNotifyReward with tokens to increase their MerkleDistributor balance
    await merkleDistributor.connect(provider1).selfNotifyReward(notifyAmount);

    // Check if the balance was updated correctly
    const balance = await merkleDistributor.providerBalance(provider1.address);
    expect(balance).to.equal(notifyAmount);
  });
});