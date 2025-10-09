import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Dual-Pool ZK Staking Integration", function () {
  async function deployFullSystemFixture() {
    const [admin, provider1, provider2, user1, user2, emissionsContract] = await ethers.getSigners();

    // Deploy Myntis Token
    const MyntisSimple = await ethers.getContractFactory("MyntisSimple");
    const token = await MyntisSimple.deploy(
      admin.address,
      ethers.parseEther("1000000000"), // 1B cap
      ethers.parseEther("1000000000")  // 1B max supply
    );
    await token.waitForDeployment();

    // Deploy DualPoolStaking
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const staking = await DualPoolStaking.deploy();
    await staking.waitForDeployment();

    // Deploy LiquidStakingVault
    const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await LiquidStakingVault.deploy(
      await token.getAddress(),
      await staking.getAddress(),
      admin.address
    );
    await vault.waitForDeployment();

    // Deploy RewardWeightingRegistry
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registry = await RewardWeightingRegistry.deploy();
    await registry.waitForDeployment();

    // Deploy ZK Verifier
    const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = await RewardClaimVerifier.deploy();
    await verifier.waitForDeployment();

    // Deploy ZK Merkle Distributor
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(
      await token.getAddress(),
      await verifier.getAddress(),
      admin.address
    );
    await distributor.waitForDeployment();

    // Deploy Emissions
    const Emissions = await ethers.getContractFactory("Emissions");
    const emissions = await Emissions.deploy(
      await token.getAddress(),
      await staking.getAddress(),
      admin.address
    );
    await emissions.waitForDeployment();

    // Initialize contracts
    await staking.initialize(
      await token.getAddress(),
      await emissions.getAddress(),
      admin.address
    );

    await registry.initialize(admin.address);

    // Set up roles and connections
    await staking.setLiquidStakingVault(await vault.getAddress());
    await token.grantRole(await token.MINTER_ROLE(), await emissions.getAddress());
    await staking.grantRole(await staking.EMISSIONS_ROLE(), await emissions.getAddress());
    await registry.grantProviderRole(provider1.address);
    await registry.grantProviderRole(provider2.address);
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider1.address);
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider2.address);

    // Mint tokens
    await token.mint(admin.address, ethers.parseEther("1000000"));
    await token.mint(provider1.address, ethers.parseEther("100000"));
    await token.mint(provider2.address, ethers.parseEther("100000"));
    await token.mint(user1.address, ethers.parseEther("100000"));
    await token.mint(user2.address, ethers.parseEther("100000"));
    await token.mint(await distributor.getAddress(), ethers.parseEther("1000000"));

    // Add provider balances to distributor
    await distributor.addProviderBalance(provider1.address, ethers.parseEther("10000"));
    await distributor.addProviderBalance(provider2.address, ethers.parseEther("10000"));

    return {
      token,
      staking,
      vault,
      registry,
      verifier,
      distributor,
      emissions,
      admin,
      provider1,
      provider2,
      user1,
      user2,
      emissionsContract
    };
  }

  describe("Full System Integration", function () {
    it("Should handle complete dual-pool staking flow", async function () {
      const { staking, vault, token, provider1, user1 } = await loadFixture(deployFullSystemFixture());

      // Provider stakes in provider pool
      const providerStake = ethers.parseEther("1000");
      await token.connect(provider1).approve(await staking.getAddress(), providerStake);
      await staking.connect(provider1).stakeToProviderPool(providerStake);

      // User stakes via liquid staking vault
      const userStake = ethers.parseEther("500");
      await token.connect(user1).approve(await vault.getAddress(), userStake);
      await vault.connect(user1).deposit(userStake, user1.address);

      // Check stakes
      const providerInfo = await staking.userInfo(provider1.address);
      const userInfo = await staking.userInfo(user1.address);

      expect(providerInfo.amount).to.equal(providerStake);
      expect(providerInfo.poolType).to.equal(0); // Provider pool
      expect(providerInfo.isProvider).to.be.true;

      expect(userInfo.amount).to.equal(userStake);
      expect(userInfo.poolType).to.equal(1); // User pool
      expect(userInfo.isProvider).to.be.false;

      // Check pool totals
      const providerPool = await staking.getPoolInfo(0);
      const userPool = await staking.getPoolInfo(1);
      const totalStaked = await staking.getTotalStaked();

      expect(providerPool.totalStaked).to.equal(providerStake);
      expect(userPool.totalStaked).to.equal(userStake);
      expect(totalStaked).to.equal(providerStake + userStake);
    });

    it("Should handle liquid staking share transfers", async function () {
      const { vault, token, user1, user2 } = await loadFixture(deployFullSystemFixture());

      // User1 stakes via vault
      const stakeAmount = ethers.parseEther("1000");
      await token.connect(user1).approve(await vault.getAddress(), stakeAmount);
      await vault.connect(user1).deposit(stakeAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.be.gt(0);

      // Transfer shares to user2
      await vault.connect(user1).transfer(user2.address, shares);
      const user2Shares = await vault.balanceOf(user2.address);
      expect(user2Shares).to.equal(shares);

      // User2 can redeem shares
      await vault.connect(user2).redeem(shares, user2.address, user2.address);
      const user2Balance = await token.balanceOf(user2.address);
      expect(user2Balance).to.be.gt(0);
    });

    it("Should handle AI strategy registration and selection", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployFullSystemFixture());

      // Approve custom strategies
      await registry.connect(await ethers.getSigners()).then(signers => 
        registry.connect(signers[0]).approveStrategy("custom_ml_v1")
      );
      await registry.connect(await ethers.getSigners()).then(signers => 
        registry.connect(signers[0]).approveStrategy("custom_ml_v2")
      );

      // Provider1 uses default strategy
      await registry.connect(provider1).setProviderStrategy(
        "myntis_default",
        "1.0.0",
        "https://api.myntis.com/strategy",
        ethers.keccak256(ethers.toUtf8Bytes("config1"))
      );

      // Provider2 uses custom strategy
      await registry.connect(provider2).setProviderStrategy(
        "custom_ml_v1",
        "1.0.0",
        "https://api.custom.com/strategy",
        ethers.keccak256(ethers.toUtf8Bytes("config2"))
      );

      // Check strategies
      const strategy1 = await registry.getProviderStrategy(provider1.address);
      const strategy2 = await registry.getProviderStrategy(provider2.address);

      expect(strategy1.strategyName).to.equal("myntis_default");
      expect(strategy2.strategyName).to.equal("custom_ml_v1");
      expect(strategy1.active).to.be.true;
      expect(strategy2.active).to.be.true;
    });

    it("Should handle ZK-enabled reward distribution", async function () {
      const { distributor, provider1, user1 } = await loadFixture(deployFullSystemFixture());

      // Submit Merkle root with ZK enabled
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = Math.floor(Date.now() / 1000) + 86400;
      const totalClaimable = ethers.parseEther("1000");
      
      await distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, true);

      // Check epoch info
      const epochInfo = await distributor.getEpochInfo(provider1.address, 0);
      expect(epochInfo.zkEnabled).to.be.true;
      expect(epochInfo.totalClaimable).to.equal(totalClaimable);
    });

    it("Should handle mixed ZK and non-ZK reward distribution", async function () {
      const { distributor, provider1, provider2 } = await loadFixture(deployFullSystemFixture());

      // Provider1 submits with ZK enabled
      const root1 = ethers.keccak256(ethers.toUtf8Bytes("test root 1"));
      const expiry1 = Math.floor(Date.now() / 1000) + 86400;
      await distributor.connect(provider1).submitMerkleRoot(root1, expiry1, ethers.parseEther("1000"), true);

      // Provider2 submits without ZK
      const root2 = ethers.keccak256(ethers.toUtf8Bytes("test root 2"));
      const expiry2 = Math.floor(Date.now() / 1000) + 86400;
      await distributor.connect(provider2).submitMerkleRoot(root2, expiry2, ethers.parseEther("1000"), false);

      // Check epoch configurations
      const epoch1 = await distributor.getEpochInfo(provider1.address, 0);
      const epoch2 = await distributor.getEpochInfo(provider2.address, 0);

      expect(epoch1.zkEnabled).to.be.true;
      expect(epoch2.zkEnabled).to.be.false;
    });
  });

  describe("Emission Distribution", function () {
    it("Should maintain correct emission splits", async function () {
      const { staking } = await loadFixture(deployFullSystemFixture());

      const providerPool = await staking.getPoolInfo(0);
      const userPool = await staking.getPoolInfo(1);

      // Provider pool should get 87.5% of emissions
      expect(providerPool.emissionShare).to.equal(875);
      
      // User pool should get 12.5% of emissions
      expect(userPool.emissionShare).to.equal(125);
      
      // Total should be 100%
      expect(providerPool.emissionShare + userPool.emissionShare).to.equal(1000);
    });

    it("Should handle emissions with fixed tokenomics", async function () {
      const { emissions } = await loadFixture(deployFullSystemFixture());

      // Check that emissions contract has correct parameters
      const stats = await emissions.getEmissionStats();
      
      // Total emissions should be 800M
      expect(stats.totalEmissions).to.equal(ethers.parseEther("800000000"));
      
      // AI-Human emissions should be 700M
      expect(stats.aiHumanEmissions).to.equal(ethers.parseEther("700000000"));
      
      // AI-AI emissions should be 100M
      expect(stats.aiAiEmissions).to.equal(ethers.parseEther("100000000"));
    });
  });

  describe("Access Control Integration", function () {
    it("Should enforce proper role-based access", async function () {
      const { staking, vault, registry, distributor, user1 } = await loadFixture(deployFullSystemFixture());

      // User should not be able to grant roles
      await expect(
        staking.connect(user1).grantRole(await staking.EMISSIONS_ROLE(), user1.address)
      ).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");

      await expect(
        registry.connect(user1).grantProviderRole(user1.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

      await expect(
        distributor.connect(user1).addProviderBalance(user1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(distributor, "AccessControlUnauthorizedAccount");
    });

    it("Should allow proper role holders to perform actions", async function () {
      const { staking, registry, distributor, admin, provider1 } = await loadFixture(deployFullSystemFixture());

      // Admin should be able to update minimum stake
      await staking.connect(admin).updateMinProviderStake(ethers.parseEther("200"));

      // Admin should be able to approve strategies
      await registry.connect(admin).approveStrategy("custom_strategy");

      // Admin should be able to add provider balance
      await distributor.connect(admin).addProviderBalance(provider1.address, ethers.parseEther("1000"));
    });
  });

  describe("Upgradeability", function () {
    it("Should support UUPS upgrades for all contracts", async function () {
      const { staking, registry } = await loadFixture(deployFullSystemFixture());

      // Check that contracts have UPGRADER_ROLE
      expect(await staking.hasRole(await staking.UPGRADER_ROLE(), await ethers.getSigners().then(signers => signers[0].address))).to.be.true;
      expect(await registry.hasRole(await registry.UPGRADER_ROLE(), await ethers.getSigners().then(signers => signers[0].address))).to.be.true;
    });
  });

  describe("Error Handling", function () {
    it("Should handle insufficient balances gracefully", async function () {
      const { staking, vault, token, provider1, user1 } = await loadFixture(deployFullSystemFixture());

      // Try to stake more than available
      const excessiveStake = ethers.parseEther("200000"); // More than minted
      await token.connect(provider1).approve(await staking.getAddress(), excessiveStake);
      await expect(
        staking.connect(provider1).stakeToProviderPool(excessiveStake)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // Try to deposit more than available
      await token.connect(user1).approve(await vault.getAddress(), excessiveStake);
      await expect(
        vault.connect(user1).deposit(excessiveStake, user1.address)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Should handle invalid strategy operations", async function () {
      const { registry, provider1 } = await loadFixture(deployFullSystemFixture());

      // Try to register unapproved strategy
      await expect(
        registry.connect(provider1).setProviderStrategy(
          "unapproved_strategy",
          "1.0.0",
          "",
          ethers.keccak256(ethers.toUtf8Bytes("config"))
        )
      ).to.be.revertedWith("Strategy not approved");

      // Try to deactivate without registered strategy
      await expect(
        registry.connect(provider1).deactivateStrategy()
      ).to.be.revertedWith("No strategy registered");
    });
  });
});
