import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("AI Reward Weighting System", function () {
  async function deployRewardWeightingRegistryFixture() {
    const [admin, provider1, provider2] = await ethers.getSigners();

    // Deploy RewardWeightingRegistry
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registry = await RewardWeightingRegistry.deploy();
    await registry.waitForDeployment();
    
    // Initialize registry
    await registry.initialize(admin.address);

    // Grant provider roles
    await registry.grantProviderRole(provider1.address);
    await registry.grantProviderRole(provider2.address);

    return {
      registry,
      admin,
      provider1,
      provider2
    };
  }

  describe("Strategy Registration", function () {
    it("Should allow provider to register approved strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.myntis.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      await expect(
        registry.connect(provider1).setProviderStrategy(
          strategyName,
          version,
          endpointUrl,
          configHash
        )
      ).to.emit(registry, "StrategyRegistered")
        .withArgs(provider1.address, strategyName, version, endpointUrl, configHash);
    });

    it("Should reject unapproved strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "unapproved_strategy";
      const version = "1.0.0";
      const endpointUrl = "";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      await expect(
        registry.connect(provider1).setProviderStrategy(
          strategyName,
          version,
          endpointUrl,
          configHash
        )
      ).to.be.revertedWith("Strategy not approved");
    });

    it("Should allow admin to approve new strategy", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "custom_ml_v1";

      await expect(
        registry.connect(admin).approveStrategy(strategyName)
      ).to.emit(registry, "StrategyApproved")
        .withArgs(strategyName);

      // Now provider can register it
      const version = "1.0.0";
      const endpointUrl = "https://custom.example.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("custom_config"));

      await expect(
        registry.connect(provider1).setProviderStrategy(
          strategyName,
          version,
          endpointUrl,
          configHash
        )
      ).to.emit(registry, "StrategyRegistered");
    });

    it("Should allow provider to update strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "myntis_default";
      const version1 = "1.0.0";
      const version2 = "1.1.0";
      const endpointUrl = "https://api.myntis.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Register initial strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version1,
        endpointUrl,
        configHash
      );

      // Update to new version
      await expect(
        registry.connect(provider1).setProviderStrategy(
          strategyName,
          version2,
          endpointUrl,
          configHash
        )
      ).to.emit(registry, "StrategyUpdated")
        .withArgs(provider1.address, strategyName, version2);
    });
  });

  describe("Strategy Queries", function () {
    it("Should return provider strategy info", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture);

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
      expect(strategy.version).to.equal(version);
      expect(strategy.active).to.be.true;
    });

    it("Should check if provider has active strategy", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.myntis.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Provider1 has strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      expect(await registry.hasActiveStrategy(provider1.address)).to.be.true;
      expect(await registry.hasActiveStrategy(provider2.address)).to.be.false;
    });

    it("Should return strategy usage count", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.myntis.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Both providers use same strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      await registry.connect(provider2).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      const usageCount = await registry.getStrategyUsageCount(strategyName);
      expect(usageCount).to.equal(2);
    });
  });

  describe("Access Control", function () {
    it("Should only allow providers to set their strategy", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Provider2 cannot set strategy for provider1
      await expect(
        registry.connect(provider2).setProviderStrategy(
          strategyName,
          version,
          endpointUrl,
          configHash
        )
      ).to.be.reverted; // Should revert due to role check
    });

    it("Should only allow admin to approve strategies", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture);

      const strategyName = "custom_strategy";

      await expect(
        registry.connect(provider1).approveStrategy(strategyName)
      ).to.be.reverted; // Should revert - not admin
    });
  });
});

