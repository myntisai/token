import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("AI Reward Weighting System", function () {
  async function deployAIRewardWeightingFixture() {
    const [admin, provider1, provider2, provider3] = await ethers.getSigners();

    // Deploy RewardWeightingRegistry
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registry = await RewardWeightingRegistry.deploy();
    await registry.waitForDeployment();

    // Initialize registry
    await registry.initialize(admin.address);

    // Grant provider roles
    await registry.grantProviderRole(provider1.address);
    await registry.grantProviderRole(provider2.address);
    await registry.grantProviderRole(provider3.address);

    return {
      registry,
      admin,
      provider1,
      provider2,
      provider3
    };
  }

  describe("Strategy Registration", function () {
    it("Should allow provider to register strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

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
      expect(strategy.endpointUrl).to.equal(endpointUrl);
      expect(strategy.configHash).to.equal(configHash);
      expect(strategy.active).to.be.true;
    });

    it("Should allow provider to update strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

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

      // Update strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version2,
        endpointUrl,
        configHash
      );

      const strategy = await registry.getProviderStrategy(provider1.address);
      expect(strategy.version).to.equal(version2);
    });

    it("Should allow provider to deactivate strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.myntis.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Register strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      // Deactivate strategy
      await registry.connect(provider1).deactivateStrategy();

      const strategy = await registry.getProviderStrategy(provider1.address);
      expect(strategy.active).to.be.false;
    });
  });

  describe("Strategy Approval", function () {
    it("Should allow admin to approve new strategies", async function () {
      const { registry, admin } = await loadFixture(deployAIRewardWeightingFixture());

      const strategyName = "custom_ml_v1";
      await registry.connect(admin).approveStrategy(strategyName);

      expect(await registry.isStrategyApproved(strategyName)).to.be.true;
    });

    it("Should allow admin to revoke strategies", async function () {
      const { registry, admin } = await loadFixture(deployAIRewardWeightingFixture());

      const strategyName = "custom_ml_v1";
      await registry.connect(admin).approveStrategy(strategyName);
      expect(await registry.isStrategyApproved(strategyName)).to.be.true;

      await registry.connect(admin).revokeStrategy(strategyName);
      expect(await registry.isStrategyApproved(strategyName)).to.be.false;
    });

    it("Should reject unapproved strategy registration", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

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
  });

  describe("Provider Role Management", function () {
    it("Should allow admin to grant provider role", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      // Provider1 already has role, so revoke first
      await registry.revokeProviderRole(provider1.address);
      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.false;

      await registry.connect(admin).grantProviderRole(provider1.address);
      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.true;
    });

    it("Should allow admin to revoke provider role", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.true;

      await registry.connect(admin).revokeProviderRole(provider1.address);
      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.false;
    });

    it("Should reject non-admin provider role management", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployAIRewardWeightingFixture());

      await expect(
        registry.connect(provider1).grantProviderRole(provider2.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Strategy Usage Tracking", function () {
    it("Should track strategy usage count", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployAIRewardWeightingFixture());

      const strategyName = "myntis_default";
      
      // Initial usage count
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(0);

      // Provider1 uses strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config"))
      );
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(1);

      // Provider2 uses strategy
      await registry.connect(provider2).setProviderStrategy(
        strategyName,
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config"))
      );
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(2);
    });

    it("Should update usage count when provider switches strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      // Approve custom strategy
      await registry.connect(await ethers.getSigners()).then(signers => 
        registry.connect(signers[0]).approveStrategy("custom_strategy")
      );

      const strategy1 = "myntis_default";
      const strategy2 = "custom_strategy";

      // Provider uses strategy1
      await registry.connect(provider1).setProviderStrategy(
        strategy1,
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config1"))
      );
      expect(await registry.getStrategyUsageCount(strategy1)).to.equal(1);
      expect(await registry.getStrategyUsageCount(strategy2)).to.equal(0);

      // Provider switches to strategy2
      await registry.connect(provider1).setProviderStrategy(
        strategy2,
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config2"))
      );
      expect(await registry.getStrategyUsageCount(strategy1)).to.equal(0);
      expect(await registry.getStrategyUsageCount(strategy2)).to.equal(1);
    });
  });

  describe("Multi-Provider Strategy Management", function () {
    it("Should handle multiple providers with different strategies", async function () {
      const { registry, provider1, provider2, provider3 } = await loadFixture(deployAIRewardWeightingFixture());

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
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config1"))
      );

      // Provider2 uses custom strategy v1
      await registry.connect(provider2).setProviderStrategy(
        "custom_ml_v1",
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config2"))
      );

      // Provider3 uses custom strategy v2
      await registry.connect(provider3).setProviderStrategy(
        "custom_ml_v2",
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config3"))
      );

      // Check usage counts
      expect(await registry.getStrategyUsageCount("myntis_default")).to.equal(1);
      expect(await registry.getStrategyUsageCount("custom_ml_v1")).to.equal(1);
      expect(await registry.getStrategyUsageCount("custom_ml_v2")).to.equal(1);

      // Check provider strategies
      const strategy1 = await registry.getProviderStrategy(provider1.address);
      const strategy2 = await registry.getProviderStrategy(provider2.address);
      const strategy3 = await registry.getProviderStrategy(provider3.address);

      expect(strategy1.strategyName).to.equal("myntis_default");
      expect(strategy2.strategyName).to.equal("custom_ml_v1");
      expect(strategy3.strategyName).to.equal("custom_ml_v2");
    });

    it("Should handle provider strategy deactivation", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployAIRewardWeightingFixture());

      // Both providers use same strategy
      await registry.connect(provider1).setProviderStrategy(
        "myntis_default",
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config1"))
      );
      await registry.connect(provider2).setProviderStrategy(
        "myntis_default",
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config2"))
      );

      expect(await registry.getStrategyUsageCount("myntis_default")).to.equal(2);

      // Provider1 deactivates strategy
      await registry.connect(provider1).deactivateStrategy();

      expect(await registry.getStrategyUsageCount("myntis_default")).to.equal(1);
      expect(await registry.hasActiveStrategy(provider1.address)).to.be.false;
      expect(await registry.hasActiveStrategy(provider2.address)).to.be.true;
    });
  });

  describe("Events", function () {
    it("Should emit StrategyRegistered event", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

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

    it("Should emit StrategyUpdated event", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      const strategyName = "myntis_default";
      const version1 = "1.0.0";
      const version2 = "1.1.0";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Register initial strategy
      await registry.connect(provider1).setProviderStrategy(
        strategyName,
        version1,
        "",
        configHash
      );

      // Update strategy
      await expect(
        registry.connect(provider1).setProviderStrategy(
          strategyName,
          version2,
          "",
          configHash
        )
      ).to.emit(registry, "StrategyUpdated")
        .withArgs(provider1.address, strategyName, version2);
    });

    it("Should emit StrategyApproved event", async function () {
      const { registry, admin } = await loadFixture(deployAIRewardWeightingFixture());

      const strategyName = "custom_strategy";

      await expect(
        registry.connect(admin).approveStrategy(strategyName)
      ).to.emit(registry, "StrategyApproved")
        .withArgs(strategyName);
    });

    it("Should emit ProviderRoleGranted event", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      // Revoke and re-grant to test event
      await registry.revokeProviderRole(provider1.address);

      await expect(
        registry.connect(admin).grantProviderRole(provider1.address)
      ).to.emit(registry, "ProviderRoleGranted")
        .withArgs(provider1.address);
    });
  });

  describe("Error Handling", function () {
    it("Should reject invalid strategy names", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      await expect(
        registry.connect(provider1).setProviderStrategy(
          "", // Empty strategy name
          "1.0.0",
          "",
          ethers.keccak256(ethers.toUtf8Bytes("config"))
        )
      ).to.be.revertedWith("Invalid strategy name");
    });

    it("Should reject invalid versions", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      await expect(
        registry.connect(provider1).setProviderStrategy(
          "myntis_default",
          "", // Empty version
          "",
          ethers.keccak256(ethers.toUtf8Bytes("config"))
        )
      ).to.be.revertedWith("Invalid version");
    });

    it("Should reject deactivation without registered strategy", async function () {
      const { registry, provider1 } = await loadFixture(deployAIRewardWeightingFixture());

      await expect(
        registry.connect(provider1).deactivateStrategy()
      ).to.be.revertedWith("No strategy registered");
    });
  });
});
