import { ethers } from "hardhat";
import { Contract } from "ethers";

interface OFTSimpleDeploymentResult {
  myntisOFT: Contract;
  dualPoolStaking: Contract;
  liquidStakingVault: Contract;
  rewardWeightingRegistry: Contract;
  emissions: Contract;
  zkMerkleDistributor: Contract;
  rewardClaimVerifier: Contract;
}

async function deployOFTSimple(): Promise<OFTSimpleDeploymentResult> {
  console.log("🚀 Deploying Myntis OFT Hub (Simple) on Base Sepolia...\n");

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available");
  }
  const deployer = signers[0];
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // 1. Deploy MyntisOFT (Hub Token) - Direct deployment
  console.log("📝 Deploying MyntisOFT (Hub Token)...");
  const MyntisOFT = await ethers.getContractFactory("MyntisOFT");
  const myntisOFT = await MyntisOFT.deploy();
  await myntisOFT.waitForDeployment();
  console.log(`✅ MyntisOFT deployed to: ${await myntisOFT.getAddress()}`);

  // Initialize MyntisOFT
  await myntisOFT.initialize(
    "Myntis",
    "MYNT",
    deployer.address,
    true, // isHub
    84532 // Base Sepolia chain ID
  );
  console.log("✅ MyntisOFT initialized as hub");

  // 2. Deploy DualPoolStaking - Direct deployment
  console.log("\n📝 Deploying DualPoolStaking...");
  const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
  const dualPoolStaking = await DualPoolStaking.deploy();
  await dualPoolStaking.waitForDeployment();
  console.log(`✅ DualPoolStaking deployed to: ${await dualPoolStaking.getAddress()}`);

  // Initialize DualPoolStaking
  await dualPoolStaking.initialize(
    await myntisOFT.getAddress(),
    deployer.address
  );
  console.log("✅ DualPoolStaking initialized");

  // 3. Deploy LiquidStakingVault - Direct deployment
  console.log("\n📝 Deploying LiquidStakingVault...");
  const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
  const liquidStakingVault = await LiquidStakingVault.deploy();
  await liquidStakingVault.waitForDeployment();
  console.log(`✅ LiquidStakingVault deployed to: ${await liquidStakingVault.getAddress()}`);

  // Initialize LiquidStakingVault
  await liquidStakingVault.initialize(
    await myntisOFT.getAddress(),
    await dualPoolStaking.getAddress(),
    deployer.address
  );
  console.log("✅ LiquidStakingVault initialized");

  // 4. Deploy RewardWeightingRegistry - Direct deployment
  console.log("\n📝 Deploying RewardWeightingRegistry...");
  const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
  const rewardWeightingRegistry = await RewardWeightingRegistry.deploy();
  await rewardWeightingRegistry.waitForDeployment();
  console.log(`✅ RewardWeightingRegistry deployed to: ${await rewardWeightingRegistry.getAddress()}`);

  // Initialize RewardWeightingRegistry
  await rewardWeightingRegistry.initialize(deployer.address);
  console.log("✅ RewardWeightingRegistry initialized");

  // 5. Deploy Emissions - Direct deployment
  console.log("\n📝 Deploying Emissions...");
  const Emissions = await ethers.getContractFactory("Emissions");
  const emissions = await Emissions.deploy();
  await emissions.waitForDeployment();
  console.log(`✅ Emissions deployed to: ${await emissions.getAddress()}`);

  // Initialize Emissions
  await emissions.initialize(
    await myntisOFT.getAddress(),
    await dualPoolStaking.getAddress(),
    deployer.address
  );
  console.log("✅ Emissions initialized");

  // 6. Deploy ZK Verifier (no initialization needed)
  console.log("\n📝 Deploying RewardClaimVerifier...");
  const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
  const rewardClaimVerifier = await RewardClaimVerifier.deploy();
  await rewardClaimVerifier.waitForDeployment();
  console.log(`✅ RewardClaimVerifier deployed to: ${await rewardClaimVerifier.getAddress()}`);

  // 7. Deploy ZK Merkle Distributor - Direct deployment
  console.log("\n📝 Deploying ZKMerkleDistributor...");
  const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
  const zkMerkleDistributor = await ZKMerkleDistributor.deploy();
  await zkMerkleDistributor.waitForDeployment();
  console.log(`✅ ZKMerkleDistributor deployed to: ${await zkMerkleDistributor.getAddress()}`);

  // Initialize ZKMerkleDistributor
  await zkMerkleDistributor.initialize(
    await myntisOFT.getAddress(),
    await rewardClaimVerifier.getAddress(),
    deployer.address
  );
  console.log("✅ ZKMerkleDistributor initialized");

  // Configure contract relationships
  console.log("\n🔧 Configuring contract relationships...");

  // Set liquid staking vault in DualPoolStaking
  await dualPoolStaking.setLiquidStakingVault(await liquidStakingVault.getAddress());
  console.log("✅ Liquid staking vault set in DualPoolStaking");

  // Set ZK distributor in DualPoolStaking
  await dualPoolStaking.setZKMerkleDistributor(await zkMerkleDistributor.getAddress());
  console.log("✅ ZK distributor set in DualPoolStaking");

  // Grant roles
  console.log("\n🔑 Setting up roles...");

  // Grant MINTER_ROLE to Emissions
  await myntisOFT.grantRole(await myntisOFT.MINTER_ROLE(), await emissions.getAddress());
  console.log("✅ MINTER_ROLE granted to Emissions");

  // Grant EMISSIONS_ROLE to Emissions in DualPoolStaking
  await dualPoolStaking.grantRole(await dualPoolStaking.EMISSIONS_ROLE(), await emissions.getAddress());
  console.log("✅ EMISSIONS_ROLE granted to Emissions");

  // Grant provider roles
  if (signers.length >= 3) {
    const provider1 = signers[1];
    const provider2 = signers[2];
    
    await rewardWeightingRegistry.grantProviderRole(provider1.address);
    await rewardWeightingRegistry.grantProviderRole(provider2.address);
    console.log("✅ PROVIDER_ROLE granted to test providers");

    // Grant provider roles to distributor
    await zkMerkleDistributor.grantRole(await zkMerkleDistributor.PROVIDER_ROLE(), provider1.address);
    await zkMerkleDistributor.grantRole(await zkMerkleDistributor.PROVIDER_ROLE(), provider2.address);
    console.log("✅ PROVIDER_ROLE granted to distributor");
  }

  // Set up cross-chain peers (for testing)
  console.log("\n🌐 Setting up cross-chain peers...");
  
  // Set peers for different chains (using dummy addresses for now)
  await myntisOFT.setPeer(11155111, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Ethereum Sepolia
  await myntisOFT.setPeer(421614, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Arbitrum Sepolia
  await myntisOFT.setPeer(80001, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Polygon Mumbai
  await myntisOFT.setPeer(11155420, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Optimism Sepolia
  console.log("✅ Cross-chain peers configured");

  // Mint initial tokens for testing
  console.log("\n💰 Minting test tokens...");
  const mintAmount = ethers.parseEther("1000000"); // 1M tokens
  await myntisOFT.mint(deployer.address, mintAmount);
  if (signers.length >= 3) {
    await myntisOFT.mint(signers[1].address, mintAmount);
    await myntisOFT.mint(signers[2].address, mintAmount);
  }
  console.log("✅ Test tokens minted");

  // Add provider balances to distributor
  if (signers.length >= 3) {
    await zkMerkleDistributor.addProviderBalance(signers[1].address, ethers.parseEther("10000"));
    await zkMerkleDistributor.addProviderBalance(signers[2].address, ethers.parseEther("10000"));
    console.log("✅ Provider balances added to distributor");
  }

  // Test basic functionality
  console.log("\n🧪 Testing basic functionality...");

  if (signers.length >= 3) {
    try {
      // Test provider staking
      const stakeAmount = ethers.parseEther("1000");
      await myntisOFT.connect(signers[1]).approve(await dualPoolStaking.getAddress(), stakeAmount);
      await dualPoolStaking.connect(signers[1]).stakeToProviderPool(stakeAmount);
      console.log("✅ Provider staking test passed");
    } catch (error) {
      console.log("⚠️ Provider staking test error:", error.message);
    }

    try {
      // Test user staking via vault
      const userStakeAmount = ethers.parseEther("500");
      await myntisOFT.connect(signers[2]).approve(await liquidStakingVault.getAddress(), userStakeAmount);
      await liquidStakingVault.connect(signers[2]).deposit(userStakeAmount, signers[2].address);
      console.log("✅ User staking test passed");
    } catch (error) {
      console.log("⚠️ User staking test error:", error.message);
    }

    try {
      // Test strategy registration
      await rewardWeightingRegistry.connect(signers[1]).setProviderStrategy(
        "myntis_default",
        "1.0.0",
        "https://api.myntis.com/strategy",
        ethers.keccak256(ethers.toUtf8Bytes("config"))
      );
      console.log("✅ Strategy registration test passed");
    } catch (error) {
      console.log("⚠️ Strategy registration test error:", error.message);
    }

    try {
      // Test cross-chain send
      const sendAmount = ethers.parseEther("1000");
      await myntisOFT.connect(signers[1]).sendFrom(
        signers[1].address,
        11155111, // Ethereum Sepolia
        ethers.zeroPadValue(signers[1].address, 32),
        sendAmount
      );
      console.log("✅ Cross-chain send test passed");
    } catch (error) {
      console.log("⚠️ Cross-chain send test error:", error.message);
    }
  }

  // Display deployment summary
  console.log("\n📊 OFT Hub Deployment Summary:");
  console.log("==============================");
  console.log(`MyntisOFT (Hub): ${await myntisOFT.getAddress()}`);
  console.log(`DualPoolStaking: ${await dualPoolStaking.getAddress()}`);
  console.log(`LiquidStakingVault: ${await liquidStakingVault.getAddress()}`);
  console.log(`RewardWeightingRegistry: ${await rewardWeightingRegistry.getAddress()}`);
  console.log(`Emissions: ${await emissions.getAddress()}`);
  console.log(`ZKMerkleDistributor: ${await zkMerkleDistributor.getAddress()}`);
  console.log(`RewardClaimVerifier: ${await rewardClaimVerifier.getAddress()}`);

  // Display contract info
  console.log("\n📋 Contract Information:");
  console.log("======================");
  
  try {
    const tokenInfo = await myntisOFT.getContractInfo();
    console.log(`Token Name: ${tokenInfo[0]}`);
    console.log(`Token Symbol: ${tokenInfo[1]}`);
    console.log(`Total Supply: ${ethers.formatEther(tokenInfo[2])} MYNT`);
    console.log(`Cap: ${ethers.formatEther(tokenInfo[3])} MYNT`);
    console.log(`Max Supply: ${ethers.formatEther(tokenInfo[4])} MYNT`);
    console.log(`Paused: ${tokenInfo[5]}`);

    const crossChainInfo = await myntisOFT.getCrossChainInfo();
    console.log(`Is Hub: ${crossChainInfo[0]}`);
    console.log(`Hub Chain ID: ${crossChainInfo[1]}`);
    console.log(`Current Chain ID: ${crossChainInfo[2]}`);
  } catch (error) {
    console.log("⚠️ Contract info retrieval error:", error.message);
  }

  console.log("\n🎉 OFT Hub deployment completed!");
  console.log("\nNext steps:");
  console.log("1. Deploy spoke OFT tokens on other chains");
  console.log("2. Test cross-chain transfers");
  console.log("3. Add LayerZero message passing");
  console.log("4. Deploy on testnet with proper private keys");

  return {
    myntisOFT,
    dualPoolStaking,
    liquidStakingVault,
    rewardWeightingRegistry,
    emissions,
    zkMerkleDistributor,
    rewardClaimVerifier
  };
}

// Main execution
if (require.main === module) {
  deployOFTSimple()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ OFT Hub deployment failed:", error);
      process.exit(1);
    });
}

export { deployOFTSimple };
