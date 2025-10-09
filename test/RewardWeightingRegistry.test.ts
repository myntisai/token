import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("RewardWeightingRegistry", function () {
  async function deployRewardWeightingRegistryFixture() {
    const [admin, provider1, provider2, provider3] = await ethers.getSigners();

    // Deploy RewardWeightingRegistry
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registry = await RewardWeightingRegistry.deploy();
    await registry.waitForDeployment();

    // Initialize registry
    await registry.initialize(admin.address);

    return {
      registry,
      admin,
      provider1,
      provider2,
      provider3
    };
  }

  describe("Deployment", function () {
    it("Should initialize with correct admin", async function () {
      const { registry, admin } = await loadFixture(deployRewardWeightingRegistryFixture());

      expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
      expect(await registry.hasRole(await registry.UPGRADER_ROLE(), admin.address)).to.be.true;
    });

    it("Should approve default strategy", async function () {
      const { registry } = await loadFixture(deployRewardWeightingRegistryFixture());

      expect(await registry.isStrategyApproved("myntis_default")).to.be.true;
    });
  });

  describe("Strategy Management", function () {
    it("Should allow admin to approve new strategies", async function () {
      const { registry, admin } = await loadFixture(deployRewardWeightingRegistryFixture());

      const strategyName = "custom_ml_v1";
      await registry.connect(admin).approveStrategy(strategyName);

      expect(await registry.isStrategyApproved(strategyName)).to.be.true;
    });

    it("Should allow admin to revoke strategies", async function () {
      const { registry, admin } = await loadFixture(deployRewardWeightingRegistryFixture());

      const strategyName = "custom_ml_v1";
      await registry.connect(admin).approveStrategy(strategyName);
      expect(await registry.isStrategyApproved(strategyName)).to.be.true;

      await registry.connect(admin).revokeStrategy(strategyName);
      expect(await registry.isStrategyApproved(strategyName)).to.be.false;
    });

    it("Should reject non-admin strategy approval", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());

      const strategyName = "custom_ml_v1";
      await expect(
        registry.connect(provider1).approveStrategy(strategyName)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Provider Role Management", function () {
    it("Should allow admin to grant provider role", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());

      await registry.connect(admin).grantProviderRole(provider1.address);
      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.true;
    });

    it("Should allow admin to revoke provider role", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());

      await registry.connect(admin).grantProviderRole(provider1.address);
      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.true;

      await registry.connect(admin).revokeProviderRole(provider1.address);
      expect(await registry.hasRole(await registry.PROVIDER_ROLE(), provider1.address)).to.be.false;
    });

    it("Should reject non-admin provider role management", async function () {
      const { registry, provider1, provider2 } = await loadFixture(deployRewardWeightingRegistryFixture());

      await expect(
        registry.connect(provider1).grantProviderRole(provider2.address)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Provider Strategy Registration", function () {
    beforeEach(async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());
      
      // Grant provider role
      await registry.connect(admin).grantProviderRole(provider1.address);
      
      this.registry = registry;
      this.provider1 = provider1;
    });

    it("Should allow provider to register strategy", async function () {
      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.example.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      await registry.connect(this.provider1).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      const strategy = await registry.getProviderStrategy(this.provider1.address);
      expect(strategy.strategyName).to.equal(strategyName);
      expect(strategy.version).to.equal(version);
      expect(strategy.endpointUrl).to.equal(endpointUrl);
      expect(strategy.configHash).to.equal(configHash);
      expect(strategy.active).to.be.true;
    });

    it("Should reject unapproved strategy", async function () {
      const strategyName = "unapproved_strategy";
      const version = "1.0.0";
      const endpointUrl = "";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      await expect(
        registry.connect(this.provider1).setProviderStrategy(
          strategyName,
          version,
          endpointUrl,
          configHash
        )
      ).to.be.revertedWith("Strategy not approved");
    });

    it("Should allow provider to update strategy", async function () {
      const strategyName = "myntis_default";
      const version1 = "1.0.0";
      const version2 = "1.1.0";
      const endpointUrl = "https://api.example.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Register initial strategy
      await registry.connect(this.provider1).setProviderStrategy(
        strategyName,
        version1,
        endpointUrl,
        configHash
      );

      // Update strategy
      await registry.connect(this.provider1).setProviderStrategy(
        strategyName,
        version2,
        endpointUrl,
        configHash
      );

      const strategy = await registry.getProviderStrategy(this.provider1.address);
      expect(strategy.version).to.equal(version2);
    });

    it("Should allow provider to deactivate strategy", async function () {
      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.example.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Register strategy
      await registry.connect(this.provider1).setProviderStrategy(
        strategyName,
        version,
        endpointUrl,
        configHash
      );

      // Deactivate strategy
      await registry.connect(this.provider1).deactivateStrategy();

      const strategy = await registry.getProviderStrategy(this.provider1.address);
      expect(strategy.active).to.be.false;
    });

    it("Should reject deactivation without registered strategy", async function () {
      await expect(
        registry.connect(this.provider1).deactivateStrategy()
      ).to.be.revertedWith("No strategy registered");
    });
  });

  describe("Strategy Queries", function () {
    beforeEach(async function () {
      const { registry, admin, provider1, provider2 } = await loadFixture(deployRewardWeightingRegistryFixture());
      
      // Grant provider roles
      await registry.connect(admin).grantProviderRole(provider1.address);
      await registry.connect(admin).grantProviderRole(provider2.address);
      
      this.registry = registry;
      this.provider1 = provider1;
      this.provider2 = provider2;
    });

    it("Should check if provider has active strategy", async function () {
      // No strategy initially
      expect(await registry.hasActiveStrategy(this.provider1.address)).to.be.false;

      // Register strategy
      await registry.connect(this.provider1).setProviderStrategy(
        "myntis_default",
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config"))
      );

      expect(await registry.hasActiveStrategy(this.provider1.address)).to.be.true;

      // Deactivate strategy
      await registry.connect(this.provider1).deactivateStrategy();
      expect(await registry.hasActiveStrategy(this.provider1.address)).to.be.false;
    });

    it("Should track strategy usage count", async function () {
      const strategyName = "myntis_default";
      
      // Initial usage count
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(0);

      // Provider1 uses strategy
      await registry.connect(this.provider1).setProviderStrategy(
        strategyName,
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config"))
      );
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(1);

      // Provider2 uses strategy
      await registry.connect(this.provider2).setProviderStrategy(
        strategyName,
        "1.0.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config"))
      );
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(2);

      // Provider1 switches strategy
      await registry.connect(this.provider1).setProviderStrategy(
        "myntis_default", // Same strategy, should not change count
        "1.1.0",
        "",
        ethers.keccak256(ethers.toUtf8Bytes("config2"))
      );
      expect(await registry.getStrategyUsageCount(strategyName)).to.equal(2);
    });
  });

  describe("Events", function () {
    beforeEach(async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());
      
      await registry.connect(admin).grantProviderRole(provider1.address);
      
      this.registry = registry;
      this.provider1 = provider1;
    });

    it("Should emit StrategyRegistered event", async function () {
      const strategyName = "myntis_default";
      const version = "1.0.0";
      const endpointUrl = "https://api.example.com/strategy";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      await expect(
        registry.connect(this.provider1).setProviderStrategy(
          strategyName,
          version,
          endpointUrl,
          configHash
        )
      ).to.emit(registry, "StrategyRegistered")
        .withArgs(this.provider1.address, strategyName, version, endpointUrl, configHash);
    });

    it("Should emit StrategyUpdated event", async function () {
      const strategyName = "myntis_default";
      const version1 = "1.0.0";
      const version2 = "1.1.0";
      const configHash = ethers.keccak256(ethers.toUtf8Bytes("config"));

      // Register initial strategy
      await registry.connect(this.provider1).setProviderStrategy(
        strategyName,
        version1,
        "",
        configHash
      );

      // Update strategy
      await expect(
        registry.connect(this.provider1).setProviderStrategy(
          strategyName,
          version2,
          "",
          configHash
        )
      ).to.emit(registry, "StrategyUpdated")
        .withArgs(this.provider1.address, strategyName, version2);
    });

    it("Should emit StrategyApproved event", async function () {
      const strategyName = "custom_strategy";

      await expect(
        registry.connect(await ethers.getSigners()).then(signers => 
          registry.connect(signers[0]).approveStrategy(strategyName)
        )
      ).to.emit(registry, "StrategyApproved")
        .withArgs(strategyName);
    });

    it("Should emit ProviderRoleGranted event", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());

      await expect(
        registry.connect(admin).grantProviderRole(provider1.address)
      ).to.emit(registry, "ProviderRoleGranted")
        .withArgs(provider1.address);
    });
  });

  describe("Access Control", function () {
    it("Should reject non-provider strategy registration", async function () {
      const { registry, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());

      // Provider1 doesn't have PROVIDER_ROLE
      await expect(
        registry.connect(provider1).setProviderStrategy(
          "myntis_default",
          "1.0.0",
          "",
          ethers.keccak256(ethers.toUtf8Bytes("config"))
        )
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("Should reject invalid strategy names", async function () {
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());
      
      await registry.connect(admin).grantProviderRole(provider1.address);

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
      const { registry, admin, provider1 } = await loadFixture(deployRewardWeightingRegistryFixture());
      
      await registry.connect(admin).grantProviderRole(provider1.address);

      await expect(
        registry.connect(provider1).setProviderStrategy(
          "myntis_default",
          "", // Empty version
          "",
          ethers.keccak256(ethers.toUtf8Bytes("config"))
        )
      ).to.be.revertedWith("Invalid version");
    });
  });
});
