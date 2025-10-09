import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  MyntisToken,
  StakingContract,
  EmissionsContract,
  MerkleDistributor
} from "../typechain-types";

describe("Original Structure Integration", function () {
  let token: MyntisToken;
  let stakingContract: StakingContract;
  let emissionsContract: EmissionsContract;
  let merkleDistributor: MerkleDistributor;
  
  let owner: SignerWithAddress;
  let provider1: SignerWithAddress;
  let provider2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const MINIMUM_STAKE = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, provider1, provider2] = await ethers.getSigners();

    // Deploy MyntisToken
    const TokenFactory = await ethers.getContractFactory("MyntisToken");
    token = await TokenFactory.deploy(owner.address);
    await token.waitForDeployment();

    // Deploy MerkleDistributor
    const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor");
    merkleDistributor = await MerkleDistributorFactory.deploy(await token.getAddress(), owner.address);
    await merkleDistributor.waitForDeployment();

    // Deploy StakingContract
    const StakingContractFactory = await ethers.getContractFactory("StakingContract");
    stakingContract = await StakingContractFactory.deploy(
      await token.getAddress(),
      ethers.ZeroAddress, // Will set later
      await merkleDistributor.getAddress(),
      owner.address
    );
    await stakingContract.waitForDeployment();

    // Deploy EmissionsContract
    const EmissionsContractFactory = await ethers.getContractFactory("EmissionsContract");
    emissionsContract = await EmissionsContractFactory.deploy(
      await token.getAddress(),
      await stakingContract.getAddress(),
      owner.address
    );
    await emissionsContract.waitForDeployment();

    // Grant MINTER_ROLE to emissions contract
    await token.grantRole(await token.MINTER_ROLE(), await emissionsContract.getAddress());

    // Set up staking contract
    await stakingContract.setEmissionContract(await emissionsContract.getAddress());

    // Set up merkle distributor
    await merkleDistributor.setStakingContract(await stakingContract.getAddress());

    // Mint initial tokens for testing
    await token.mint(provider1.address, INITIAL_SUPPLY);
    await token.mint(provider2.address, INITIAL_SUPPLY);
  });

  describe("Deployment", function () {
    it("Should deploy all contracts successfully", async function () {
      expect(await token.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await stakingContract.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await emissionsContract.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await merkleDistributor.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("Should have correct initial values", async function () {
      expect(await emissionsContract.token()).to.equal(await token.getAddress());
      expect(await emissionsContract.stakingContract()).to.equal(await stakingContract.getAddress());
      expect(await emissionsContract.mintedEmissions()).to.equal(0);
    });
  });

  describe("Basic Functionality", function () {
    beforeEach(async function () {
      // Approve tokens for staking
      await token.connect(provider1).approve(await stakingContract.getAddress(), MINIMUM_STAKE);
      await token.connect(provider2).approve(await stakingContract.getAddress(), MINIMUM_STAKE);

      // Register providers
      await stakingContract.connect(provider1).registerProvider(MINIMUM_STAKE);
      await stakingContract.connect(provider2).registerProvider(MINIMUM_STAKE);
    });

    it("Should register providers successfully", async function () {
      expect(await stakingContract.getTotalStaked()).to.equal(MINIMUM_STAKE * 2n);
    });

    it("Should update emissions when providers are staked", async function () {
      const balanceBefore = await token.balanceOf(owner.address);
      
      // Fast forward time to generate emissions
      await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
      await ethers.provider.send("evm_mine", []);

      await emissionsContract.updateEmissions();

      const balanceAfter = await token.balanceOf(owner.address);
      // Note: In the original structure, emissions go to the staking contract, not treasury
      expect(await emissionsContract.mintedEmissions()).to.be.greaterThan(0);
    });

    it("Should harvest rewards successfully", async function () {
      // Fast forward time to generate emissions
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);

      // Update emissions first to generate rewards
      await emissionsContract.updateEmissions();

      const distributorBalanceBefore = await token.balanceOf(await merkleDistributor.getAddress());
      
      await stakingContract.connect(provider1).harvestRewards();
      
      const distributorBalanceAfter = await token.balanceOf(await merkleDistributor.getAddress());
      expect(distributorBalanceAfter).to.be.greaterThan(distributorBalanceBefore);
    });
  });
});
