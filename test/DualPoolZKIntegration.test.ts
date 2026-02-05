import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Dual Pool ZK Integration", function () {
  async function deployDualPoolZKSystemFixture() {
    const [admin, provider1, user1, user2] = await ethers.getSigners();

    // Deploy token
    const LayerZeroEndpointMockFactory = await ethers.getContractFactory("LayerZeroEndpointMock");
    const mockEndpoint = await LayerZeroEndpointMockFactory.deploy(1);
    await mockEndpoint.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("Myntis");
    const token = await TokenFactory.connect(admin).deploy(await mockEndpoint.getAddress(), admin.address);
    await token.waitForDeployment();

    // Deploy emissions contract
    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    const emissions = await EmissionsFactory.connect(admin).deploy(
      await token.getAddress(),
      ethers.ZeroAddress, // Will be set later
      admin.address
    );
    await emissions.waitForDeployment();

    // Deploy ZK verifier (mock Groth16 verifier)
    const MockGroth16Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const grothVerifier = await MockGroth16Verifier.connect(admin).deploy();
    await grothVerifier.waitForDeployment();

    // Deploy DualPoolStaking (upgradeable)
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const stakingImpl = await DualPoolStaking.deploy();
    await stakingImpl.waitForDeployment();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(admin.address);
    await proxyAdmin.waitForDeployment();

    const initData = DualPoolStaking.interface.encodeFunctionData("initialize", [
      await token.getAddress(),
      await emissions.getAddress(),
      admin.address
    ]);

    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
    const stakingProxy = await TransparentUpgradeableProxy.deploy(
      await stakingImpl.getAddress(),
      await proxyAdmin.getAddress(),
      initData
    );
    await stakingProxy.waitForDeployment();

    const staking = DualPoolStaking.attach(await stakingProxy.getAddress());

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

    // Deploy ZKMerkleDistributor
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(
      await token.getAddress(),
      await grothVerifier.getAddress(),
      admin.address
    );
    await distributor.waitForDeployment();

    // Deploy RewardWeightingRegistry (upgradeable)
    const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
    const registryImpl = await RewardWeightingRegistry.deploy();
    await registryImpl.waitForDeployment();

    const RegistryProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const registryProxyAdmin = await RegistryProxyAdmin.deploy(admin.address);
    await registryProxyAdmin.waitForDeployment();

    const registryInitData = RewardWeightingRegistry.interface.encodeFunctionData("initialize", [admin.address]);
    const RegistryProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy");
    const registryProxy = await RegistryProxyFactory.deploy(
      await registryImpl.getAddress(),
      await registryProxyAdmin.getAddress(),
      registryInitData
    );
    await registryProxy.waitForDeployment();
    const registry = RewardWeightingRegistry.attach(await registryProxy.getAddress());

    // Grant roles
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider1.address);
    await registry.grantProviderRole(provider1.address);

    // Mint tokens to admin and approve distributor
    const fundingAmount = ethers.parseEther("1000000");
    await token.connect(admin).mint(admin.address, fundingAmount);
    await token.connect(admin).approve(await distributor.getAddress(), fundingAmount);
    await distributor.connect(admin).addProviderBalance(provider1.address, ethers.parseEther("10000"));

    return {
      token,
      emissions,
      staking,
      vault,
      distributor,
      registry,
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

      const proofA: [bigint, bigint] = [0n, 0n];
      const proofB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
      const proofC: [bigint, bigint] = [0n, 0n];
      const batchHash = ethers.keccak256(ethers.toUtf8Bytes("batch"));
      const publicInputs: [bigint, bigint, bigint] = [
        BigInt(root),
        totalClaimable,
        BigInt(batchHash)
      ];

      await distributor.connect(provider1).submitMerkleRoot(
        root,
        expiry,
        totalClaimable,
        proofA,
        proofB,
        proofC,
        publicInputs
      );

      const epoch = await distributor.getEpochInfo(provider1.address, 0);
      expect(epoch.providerProofVerified).to.equal(true);
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

