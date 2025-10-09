import { ethers } from "hardhat";
import { Contract } from "ethers";

interface DeploymentResult {
  myntisToken: Contract;
  dualPoolStaking: Contract;
  liquidStakingVault: Contract;
  rewardWeightingRegistry: Contract;
  emissions: Contract;
  merkleDistributor: Contract;
  globalNullifier: Contract;
}

async function deployDualPoolSystem(): Promise<DeploymentResult> {
  console.log("🚀 Deploying Dual-Pool ZK Staking System...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1. Deploy Myntis Token (Simple version for testing)
  console.log("📝 Deploying Myntis Token...");
  const MyntisSimple = await ethers.getContractFactory("MyntisSimple");
  const myntisToken = await MyntisSimple.deploy(
    deployer.address,
    ethers.parseEther("1000000000"), // 1B cap
    ethers.parseEther("1000000000")  // 1B max supply
  );
  await myntisToken.waitForDeployment();
  console.log(`✅ Myntis Token deployed to: ${await myntisToken.getAddress()}`);

  // 2. Deploy DualPoolStaking
  console.log("\n📝 Deploying DualPoolStaking...");
  const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
  const dualPoolStaking = await DualPoolStaking.deploy();
  await dualPoolStaking.waitForDeployment();
  console.log(`✅ DualPoolStaking deployed to: ${await dualPoolStaking.getAddress()}`);

  // 3. Deploy LiquidStakingVault
  console.log("\n📝 Deploying LiquidStakingVault...");
  const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
  const liquidStakingVault = await LiquidStakingVault.deploy(
    await myntisToken.getAddress(),
    await dualPoolStaking.getAddress(),
    deployer.address
  );
  await liquidStakingVault.waitForDeployment();
  console.log(`✅ LiquidStakingVault deployed to: ${await liquidStakingVault.getAddress()}`);

  // 4. Deploy RewardWeightingRegistry
  console.log("\n📝 Deploying RewardWeightingRegistry...");
  const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
  const rewardWeightingRegistry = await RewardWeightingRegistry.deploy();
  await rewardWeightingRegistry.waitForDeployment();
  console.log(`✅ RewardWeightingRegistry deployed to: ${await rewardWeightingRegistry.getAddress()}`);

  // 5. Deploy Emissions (Fixed version)
  console.log("\n📝 Deploying Emissions...");
  const Emissions = await ethers.getContractFactory("Emissions");
  const emissions = await Emissions.deploy(
    await myntisToken.getAddress(),
    await dualPoolStaking.getAddress(),
    deployer.address
  );
  await emissions.waitForDeployment();
  console.log(`✅ Emissions deployed to: ${await emissions.getAddress()}`);

  // 6. Deploy MerkleDistributor
  console.log("\n📝 Deploying MerkleDistributor...");
  const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = await MerkleDistributor.deploy(
    await myntisToken.getAddress(),
    deployer.address
  );
  await merkleDistributor.waitForDeployment();
  console.log(`✅ MerkleDistributor deployed to: ${await merkleDistributor.getAddress()}`);

  // 7. Deploy GlobalNullifier
  console.log("\n📝 Deploying GlobalNullifier...");
  const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
  const globalNullifier = await GlobalNullifier.deploy(deployer.address);
  await globalNullifier.waitForDeployment();
  console.log(`✅ GlobalNullifier deployed to: ${await globalNullifier.getAddress()}`);

  // Initialize contracts
  console.log("\n🔧 Initializing contracts...");

  // Initialize DualPoolStaking
  await dualPoolStaking.initialize(
    await myntisToken.getAddress(),
    await emissions.getAddress(),
    deployer.address
  );
  console.log("✅ DualPoolStaking initialized");

  // Set liquid staking vault in DualPoolStaking
  await dualPoolStaking.setLiquidStakingVault(await liquidStakingVault.getAddress());
  console.log("✅ Liquid staking vault set in DualPoolStaking");

  // Initialize RewardWeightingRegistry
  await rewardWeightingRegistry.initialize(deployer.address);
  console.log("✅ RewardWeightingRegistry initialized");

  // Grant roles
  console.log("\n🔑 Setting up roles...");

  // Grant MINTER_ROLE to Emissions
  await myntisToken.grantRole(await myntisToken.MINTER_ROLE(), await emissions.getAddress());
  console.log("✅ MINTER_ROLE granted to Emissions");

  // Grant EMISSIONS_ROLE to Emissions in DualPoolStaking
  await dualPoolStaking.grantRole(await dualPoolStaking.EMISSIONS_ROLE(), await emissions.getAddress());
  console.log("✅ EMISSIONS_ROLE granted to Emissions");

  // Grant PROVIDER_ROLE to some test addresses
  const [, provider1, provider2] = await ethers.getSigners();
  await rewardWeightingRegistry.grantProviderRole(provider1.address);
  await rewardWeightingRegistry.grantProviderRole(provider2.address);
  console.log("✅ PROVIDER_ROLE granted to test providers");

  // Mint initial tokens for testing
  console.log("\n💰 Minting test tokens...");
  const mintAmount = ethers.parseEther("1000000"); // 1M tokens
  await myntisToken.mint(deployer.address, mintAmount);
  await myntisToken.mint(provider1.address, mintAmount);
  await myntisToken.mint(provider2.address, mintAmount);
  console.log("✅ Test tokens minted");

  // Test basic functionality
  console.log("\n🧪 Testing basic functionality...");

  // Test provider staking
  const stakeAmount = ethers.parseEther("1000");
  await myntisToken.connect(provider1).approve(await dualPoolStaking.getAddress(), stakeAmount);
  await dualPoolStaking.connect(provider1).stakeToProviderPool(stakeAmount);
  console.log("✅ Provider staking test passed");

  // Test user staking via vault
  const userStakeAmount = ethers.parseEther("500");
  await myntisToken.connect(provider2).approve(await liquidStakingVault.getAddress(), userStakeAmount);
  await liquidStakingVault.connect(provider2).deposit(userStakeAmount, provider2.address);
  console.log("✅ User staking test passed");

  // Test strategy registration
  await rewardWeightingRegistry.connect(provider1).setProviderStrategy(
    "myntis_default",
    "1.0.0",
    "https://api.myntis.com/strategy",
    ethers.keccak256(ethers.toUtf8Bytes("config"))
  );
  console.log("✅ Strategy registration test passed");

  // Display deployment summary
  console.log("\n📊 Deployment Summary:");
  console.log("===================");
  console.log(`Myntis Token: ${await myntisToken.getAddress()}`);
  console.log(`DualPoolStaking: ${await dualPoolStaking.getAddress()}`);
  console.log(`LiquidStakingVault: ${await liquidStakingVault.getAddress()}`);
  console.log(`RewardWeightingRegistry: ${await rewardWeightingRegistry.getAddress()}`);
  console.log(`Emissions: ${await emissions.getAddress()}`);
  console.log(`MerkleDistributor: ${await merkleDistributor.getAddress()}`);
  console.log(`GlobalNullifier: ${await globalNullifier.getAddress()}`);

  // Display contract info
  console.log("\n📋 Contract Information:");
  console.log("======================");
  
  const tokenInfo = await myntisToken.getContractInfo();
  console.log(`Token Name: ${tokenInfo[0]}`);
  console.log(`Token Symbol: ${tokenInfo[1]}`);
  console.log(`Total Supply: ${ethers.formatEther(tokenInfo[2])} MYNT`);
  console.log(`Cap: ${ethers.formatEther(tokenInfo[3])} MYNT`);
  console.log(`Max Supply: ${ethers.formatEther(tokenInfo[4])} MYNT`);
  console.log(`Paused: ${tokenInfo[5]}`);

  const providerPool = await dualPoolStaking.getPoolInfo(0);
  const userPool = await dualPoolStaking.getPoolInfo(1);
  console.log(`\nProvider Pool Total Staked: ${ethers.formatEther(providerPool.totalStaked)} MYNT`);
  console.log(`User Pool Total Staked: ${ethers.formatEther(userPool.totalStaked)} MYNT`);
  console.log(`Provider Pool Emission Share: ${providerPool.emissionShare / 10}%`);
  console.log(`User Pool Emission Share: ${userPool.emissionShare / 10}%`);

  const totalStaked = await dualPoolStaking.getTotalStaked();
  console.log(`Total Staked: ${ethers.formatEther(totalStaked)} MYNT`);

  console.log("\n🎉 Dual-Pool ZK Staking System deployed successfully!");
  console.log("\nNext steps:");
  console.log("1. Deploy ZK circuits and verifier contracts");
  console.log("2. Set up AI reward weighting strategies");
  console.log("3. Configure cross-chain connections");
  console.log("4. Test ZK proof generation and verification");

  return {
    myntisToken,
    dualPoolStaking,
    liquidStakingVault,
    rewardWeightingRegistry,
    emissions,
    merkleDistributor,
    globalNullifier
  };
}

// Main execution
if (require.main === module) {
  deployDualPoolSystem()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Deployment failed:", error);
      process.exit(1);
    });
}

export { deployDualPoolSystem };
