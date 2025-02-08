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

    // Instead of calling emissions.harvest directly, call harvestRewards on the staking contract.
    await staking.connect(provider1).harvestRewards();
    await staking.connect(provider2).harvestRewards();
    await staking.connect(provider3).harvestRewards();

    // Retrieve provider info from the staking contract.
    const [stake1, rewardDebt1] = await staking.getProviderInfo(provider1.address);
    const [stake2, rewardDebt2] = await staking.getProviderInfo(provider2.address);
    const [stake3, rewardDebt3] = await staking.getProviderInfo(provider3.address);

    // Check that stakes are as expected.
    expect(stake1).to.equal(stakeAmounts.provider1);
    expect(stake2).to.equal(stakeAmounts.provider2);
    expect(stake3).to.equal(stakeAmounts.provider3);

    // Now compare reward ratios.
    // In ethers v6, numbers are returned as native bigint. (e.g. rewardDebt1 is a bigint.)
    // Instead of `.mul`, use native arithmetic operators and compare using a small tolerance.
    const tolerance = 10n;
    const expected2 = rewardDebt1 * 2n;
    const expected3 = rewardDebt1 * 3n;
    const diff2 = rewardDebt2 > expected2 ? rewardDebt2 - expected2 : expected2 - rewardDebt2;
    const diff3 = rewardDebt3 > expected3 ? rewardDebt3 - expected3 : expected3 - rewardDebt3;

    expect(diff2 <= tolerance).to.be.true;
    expect(diff3 <= tolerance).to.be.true;

    console.log("Provider rewards (rewardDebt):", {
      provider1: rewardDebt1.toString(),
      provider2: rewardDebt2.toString(),
      provider3: rewardDebt3.toString(),
    });
  });
});