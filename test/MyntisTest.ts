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

  // Mint amount and staking amounts (using 18 decimals)
  const mintAmount = ethers.parseEther("10000"); // returns a bigint in ethers v6
  const stakeAmounts = {
    provider1: ethers.parseEther("1000"),
    provider2: ethers.parseEther("2000"),
    provider3: ethers.parseEther("3000")
  };

  beforeEach(async function () {
    [admin, provider1, provider2, provider3, other] = await ethers.getSigners();

    // Deploy MyntisToken
    const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", admin);
    myntisToken = (await MyntisTokenFactory.deploy(admin.address)) as MyntisToken;
    await myntisToken.waitForDeployment();

    // Deploy StakingContract
    const StakingFactory = await ethers.getContractFactory("StakingContract", admin);
    staking = (await StakingFactory.deploy(await myntisToken.getAddress(), admin.address)) as StakingContract;
    await staking.waitForDeployment();

    // Deploy EmissionContract (pass the token, staking, and admin address)
    const EmissionsFactory = await ethers.getContractFactory("EmissionContract", admin);
    emissions = (await EmissionsFactory.deploy(await myntisToken.getAddress(), await staking.getAddress(), admin.address)) as EmissionContract;
    await emissions.waitForDeployment();

    // Deploy MerkleDistributor
    const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor", admin);
    merkleDistributor = (await MerkleDistributorFactory.deploy(await myntisToken.getAddress(), admin.address)) as MerkleDistributor;
    await merkleDistributor.waitForDeployment();

    // Set the emissions and merkle distributor in the staking contract
    await staking.setEmissionContract(await emissions.getAddress());
    await staking.setMerkleDistributor(await merkleDistributor.getAddress());

    // Mint tokens to providers (using admin's MINTER_ROLE)
    await myntisToken.mint(provider1.address, mintAmount);
    await myntisToken.mint(provider2.address, mintAmount);
    await myntisToken.mint(provider3.address, mintAmount);

    // Have providers approve the staking contract to spend their tokens
    await myntisToken.connect(provider1).approve(await staking.getAddress(), mintAmount);
    await myntisToken.connect(provider2).approve(await staking.getAddress(), mintAmount);
    await myntisToken.connect(provider3).approve(await staking.getAddress(), mintAmount);

    // Providers stake tokens via registerProvider (ratios 1:2:3)
    await staking.connect(provider1).registerProvider(stakeAmounts.provider1);
    await staking.connect(provider2).registerProvider(stakeAmounts.provider2);
    await staking.connect(provider3).registerProvider(stakeAmounts.provider3);

    // Grant MINTER_ROLE to the Emissions contract so it can mint rewards.
    const MINTER_ROLE = await myntisToken.MINTER_ROLE();
    await myntisToken.grantRole(MINTER_ROLE, await emissions.getAddress());

    // Set the staking contract address in the MerkleDistributor.
    await merkleDistributor.setStakingContract(await staking.getAddress());
  });

  it("should distribute emissions to providers in a 1:2:3 ratio", async function () {
    // Increase time to generate emissions (e.g. 1 hour = 3600 seconds)
    await network.provider.send("evm_increaseTime", [3600]);
    await network.provider.send("evm_mine");

    // Use the staking contract harvest function (which calls emissions.harvest internally)
    await staking.connect(provider1).harvestRewards();
    await staking.connect(provider2).harvestRewards();
    await staking.connect(provider3).harvestRewards();

    // Retrieve provider info from the staking contract.
    const [stake1, rewardDebt1] = await staking.getProviderInfo(provider1.address);
    const [stake2, rewardDebt2] = await staking.getProviderInfo(provider2.address);
    const [stake3, rewardDebt3] = await staking.getProviderInfo(provider3.address);

    // Log the staked amounts and the reward debts for each provider.
    console.log("Provider 1 -> Stake:", stake1.toString(), " Reward Debt:", rewardDebt1.toString());
    console.log("Provider 2 -> Stake:", stake2.toString(), " Reward Debt:", rewardDebt2.toString());
    console.log("Provider 3 -> Stake:", stake3.toString(), " Reward Debt:", rewardDebt3.toString());

    // Check that stakes are as expected.
    expect(stake1).to.equal(stakeAmounts.provider1);
    expect(stake2).to.equal(stakeAmounts.provider2);
    expect(stake3).to.equal(stakeAmounts.provider3);

    // Option 2: Verify reward ratios using relative approach.
    // Multiply by a scale factor to preserve precision.
    const scaleFactor = 10000n;
    const ratio2 = (rewardDebt2 * scaleFactor) / rewardDebt1; // Expected approximately 20000 for a 1:2 ratio.
    const ratio3 = (rewardDebt3 * scaleFactor) / rewardDebt1; // Expected approximately 30000 for a 1:3 ratio.

    console.log("Relative ratios (scaled by 10000):");
    console.log("Provider 2/Provider 1 ratio:", ratio2.toString());
    console.log("Provider 3/Provider 1 ratio:", ratio3.toString());

    // Allow a tolerance of 100 (i.e., 1% error).
    expect(ratio2).to.be.closeTo(20000n, 100n);
    expect(ratio3).to.be.closeTo(30000n, 100n);
  });
});