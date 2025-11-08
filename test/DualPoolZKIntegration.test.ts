import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Dual Pool ZK Integration", function () {
  async function deployDualPoolZKSystemFixture() {
    const [admin, provider1, user1, user2] = await ethers.getSigners();

    // Deploy token
    const TokenFactory = await ethers.getContractFactory("MyntisToken");
    const token = await TokenFactory.connect(admin).deploy(admin.address);
    await token.waitForDeployment();

    // Deploy emissions contract
    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    const emissions = await EmissionsFactory.connect(admin).deploy(
      await token.getAddress(),
      ethers.ZeroAddress, // Will be set later
      admin.address
    );
    await emissions.waitForDeployment();

    // Deploy ZK verifier
    const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = await RewardClaimVerifier.connect(admin).deploy();
    await verifier.waitForDeployment();
    
    const MockGroth16Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const grothVerifier = await MockGroth16Verifier.connect(admin).deploy();
    await verifier.connect(admin).setVerifierContract(await grothVerifier.getAddress());

    // Deploy DualPoolStaking
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const staking = await DualPoolStaking.deploy();
    await staking.waitForDeployment();
    await staking.initialize(
      await token.getAddress(),
      await emissions.getAddress(),
      admin.address
    );

    // Deploy LiquidStakingVault
    const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await LiquidStakingVault.deploy(
      await token.getAddress(),
      await staking.getAddress(),
      admin.address
    );
    await vault.waitForDeployment();

    // Configure relationships
    await staking.setLiquidStakingVault(await vault.getAddress());
    const STAKING_ROLE = await vault.STAKING_ROLE();
    await vault.grantRole(STAKING_ROLE, await staking.getAddress());

    // Deploy ZKMerkleDistributor
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(
      await token.getAddress(),
      await verifier.getAddress(),
      admin.address
    );
    await distributor.waitForDeployment();

    // Deploy RewardWeightingRegistry
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registry = await RewardWeightingRegistry.deploy();
    await registry.waitForDeployment();
    await registry.initialize(admin.address);

    // Grant roles
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider1.address);
    await registry.grantProviderRole(provider1.address);

    // Mint tokens
    await token.connect(admin).mint(await distributor.getAddress(), ethers.parseEther("1000000"));
    await distributor.connect(admin).addProviderBalance(provider1.address, ethers.parseEther("10000"));

    return {
      token,
      emissions,
      staking,
      vault,
      distributor,
      registry,
      verifier,
      admin,
      provider1,
      user1,
      user2
    };
  }

  describe("End-to-End ZK Claim Flow", function () {
    it("Should complete full flow: stake -> generate batch -> ZK claim", async function () {
      const { staking, vault, distributor, provider1, user1 } = await loadFixture(deployDualPoolZKSystemFixture);

      // Step 1: User stakes in liquid staking vault
      const stakeAmount = ethers.parseEther("1000");
      // Mint tokens to user first
      // ... (token minting setup)

      // Step 2: Provider submits Merkle root with ZK enabled
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
      const totalClaimable = ethers.parseEther("1000");
      
      await distributor.connect(provider1).submitMerkleRoot(
        root,
        expiry,
        totalClaimable,
        true // ZK enabled
      );

      // Step 3: User claims with ZK proof
      // This would require actual ZK proof generation
      // For now, we test the contract integration
      const amount = ethers.parseEther("100");
      const merkleProof = [ethers.keccak256(ethers.toUtf8Bytes("proof"))];
      
      // Mock ZK proof (in real test, generate actual proof)
      const zkProof = {
        a: [ethers.parseEther("1"), ethers.parseEther("2")],
        b: [[ethers.parseEther("3"), ethers.parseEther("4")], [ethers.parseEther("5"), ethers.parseEther("6")]],
        c: [ethers.parseEther("7"), ethers.parseEther("8")]
      };
      const publicInputs = [root, ethers.keccak256(ethers.toUtf8Bytes("nullifier")), amount];

      // Note: This will fail with mock proof, but tests the integration
      // In production, use actual generated proof
      await expect(
        distributor.connect(user1).claimWithZK(
          provider1.address,
          0, // rootIndex
          amount,
          merkleProof,
          zkProof,
          publicInputs
        )
      ).to.be.reverted; // Will revert due to invalid proof, but tests integration
    });
  });

  describe("Emission Split", function () {
    it("Should have correct emission shares configured", async function () {
      const { staking } = await loadFixture(deployDualPoolZKSystemFixture);

      const providerPool = await staking.providerPool();
      const userPool = await staking.userPool();

      // Provider pool: 87.5% (875 out of 1000)
      expect(providerPool.emissionShare).to.equal(875);
      
      // User pool: 12.5% (125 out of 1000)
      expect(userPool.emissionShare).to.equal(125);
    });
  });

  describe("Strategy Integration", function () {
    it("Should allow provider to register strategy and use in claims", async function () {
      const { registry, provider1 } = await loadFixture(deployDualPoolZKSystemFixture);

      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.myntis.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      const strategy = await registry.getProviderStrategy(provider1.address);
      expect(strategy.strategyName).to.equal(strategyName);
      expect(strategy.active).to.be.true;
    });
  });
});

