import { ethers } from "hardhat";
import { Contract } from "ethers";

interface OFTSpokeDeploymentResult {
  myntisSpokeOFT: Contract;
  spokeDistributor: Contract;
  globalNullifier: Contract;
}

async function deployOFTSpoke(): Promise<OFTSpokeDeploymentResult> {
  console.log("🚀 Deploying Myntis OFT Spoke...\n");

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available");
  }
  const deployer = signers[0];
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Get current chain ID
  const chainId = await ethers.provider.getNetwork().then(n => Number(n.chainId));
  console.log(`Deploying on chain ID: ${chainId}`);

  // Get LayerZero endpoint from environment or use mock for testing
  const endpointAddress = process.env.LZ_ENDPOINT;
  let endpointToUse: string;
  
  if (!endpointAddress || !ethers.isAddress(endpointAddress)) {
    console.log("⚠️  No LZ_ENDPOINT provided, deploying mock endpoint for testing...");
    const LayerZeroEndpointMock = await ethers.getContractFactory("LayerZeroEndpointMock");
    const mockEndpoint = await LayerZeroEndpointMock.deploy(chainId);
    await mockEndpoint.waitForDeployment();
    endpointToUse = await mockEndpoint.getAddress();
    console.log(`✅ Mock LayerZero endpoint deployed at: ${endpointToUse}`);
  } else {
    endpointToUse = ethers.getAddress(endpointAddress);
    console.log(`✅ Using LayerZero endpoint: ${endpointToUse}`);
  }

  // 1. Deploy MyntisSpokeOFT with UUPS proxy
  console.log("📝 Deploying MyntisSpokeOFT with UUPS proxy...");
  
  // Deploy implementation
  const MyntisSpokeOFT = await ethers.getContractFactory("MyntisSpokeOFT");
  const myntisSpokeOFTImpl = await MyntisSpokeOFT.deploy();
  await myntisSpokeOFTImpl.waitForDeployment();
  console.log(`✅ MyntisSpokeOFT implementation deployed to: ${await myntisSpokeOFTImpl.getAddress()}`);

  // Deploy UUPS proxy
  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.waitForDeployment();
  console.log(`✅ ProxyAdmin deployed to: ${await proxyAdmin.getAddress()}`);

  const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const myntisSpokeOFTProxy = await TransparentUpgradeableProxy.deploy(
    await myntisSpokeOFTImpl.getAddress(),
    await proxyAdmin.getAddress(),
    "0x"
  );
  await myntisSpokeOFTProxy.waitForDeployment();
  console.log(`✅ MyntisSpokeOFT proxy deployed to: ${await myntisSpokeOFTProxy.getAddress()}`);

  // Connect to proxy and initialize
  const myntisSpokeOFT = MyntisSpokeOFT.attach(await myntisSpokeOFTProxy.getAddress());
  
  await myntisSpokeOFT.initialize(
    "Myntis",
    "MYNT",
    deployer.address,
    84532, // Base Sepolia chain ID (hub)
    "0x0000000000000000000000000000000000000000", // Hub token address (placeholder)
    endpointToUse
  );
  console.log("✅ MyntisSpokeOFT initialized as spoke");

  // 2. Deploy SpokeDistributor with UUPS proxy
  console.log("\n📝 Deploying SpokeDistributor with UUPS proxy...");
  
  const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
  const spokeDistributorImpl = await SpokeDistributor.deploy();
  await spokeDistributorImpl.waitForDeployment();
  console.log(`✅ SpokeDistributor implementation deployed to: ${await spokeDistributorImpl.getAddress()}`);

  const spokeDistributorProxy = await TransparentUpgradeableProxy.deploy(
    await spokeDistributorImpl.getAddress(),
    await proxyAdmin.getAddress(),
    "0x"
  );
  await spokeDistributorProxy.waitForDeployment();
  console.log(`✅ SpokeDistributor proxy deployed to: ${await spokeDistributorProxy.getAddress()}`);

  const spokeDistributor = SpokeDistributor.attach(await spokeDistributorProxy.getAddress());
  await spokeDistributor.initialize(
    await myntisSpokeOFT.getAddress(),
    deployer.address
  );
  console.log("✅ SpokeDistributor initialized");

  // 3. Deploy GlobalNullifier (no proxy needed)
  console.log("\n📝 Deploying GlobalNullifier...");
  const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
  const globalNullifier = await GlobalNullifier.deploy(deployer.address);
  await globalNullifier.waitForDeployment();
  console.log(`✅ GlobalNullifier deployed to: ${await globalNullifier.getAddress()}`);

  // Configure contract relationships
  console.log("\n🔧 Configuring contract relationships...");

  // Set global nullifier in spoke distributor
  await spokeDistributor.setGlobalNullifier(await globalNullifier.getAddress());
  console.log("✅ Global nullifier set in spoke distributor");

  // Grant roles
  console.log("\n🔑 Setting up roles...");

  // Grant MINTER_ROLE to SpokeDistributor
  await myntisSpokeOFT.grantRole(await myntisSpokeOFT.MINTER_ROLE(), await spokeDistributor.getAddress());
  console.log("✅ MINTER_ROLE granted to SpokeDistributor");

  // Grant BURNER_ROLE to SpokeDistributor
  await myntisSpokeOFT.grantRole(await myntisSpokeOFT.BURNER_ROLE(), await spokeDistributor.getAddress());
  console.log("✅ BURNER_ROLE granted to SpokeDistributor");

  // Grant SPOKE_ROLE to SpokeDistributor in GlobalNullifier
  await globalNullifier.grantRole(await globalNullifier.SPOKE_ROLE(), await spokeDistributor.getAddress());
  console.log("✅ SPOKE_ROLE granted to SpokeDistributor");

  // Set up cross-chain peers (for testing)
  console.log("\n🌐 Setting up cross-chain peers...");
  
  // Set peers for different chains (using dummy addresses for now)
  await myntisSpokeOFT.setPeer(84532, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Base Sepolia (hub)
  await myntisSpokeOFT.setPeer(11155111, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Ethereum Sepolia
  await myntisSpokeOFT.setPeer(421614, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Arbitrum Sepolia
  await myntisSpokeOFT.setPeer(80001, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Polygon Mumbai
  await myntisSpokeOFT.setPeer(11155420, ethers.zeroPadValue("0x1234567890123456789012345678901234567890", 32)); // Optimism Sepolia
  console.log("✅ Cross-chain peers configured");

  // Mint initial tokens for testing
  console.log("\n💰 Minting test tokens...");
  const mintAmount = ethers.parseEther("100000"); // 100K tokens
  await myntisSpokeOFT.bridgeIn(deployer.address, mintAmount);
  if (signers.length >= 3) {
    await myntisSpokeOFT.bridgeIn(signers[1].address, mintAmount);
    await myntisSpokeOFT.bridgeIn(signers[2].address, mintAmount);
  }
  console.log("✅ Test tokens minted");

  // Test basic functionality
  console.log("\n🧪 Testing basic functionality...");

  if (signers.length >= 3) {
    try {
      // Test cross-chain send
      const sendAmount = ethers.parseEther("1000");
      await myntisSpokeOFT.connect(signers[1]).sendFrom(
        signers[1].address,
        84532, // Base Sepolia
        ethers.zeroPadValue(signers[1].address, 32),
        sendAmount
      );
      console.log("✅ Cross-chain send test passed");
    } catch (error) {
      console.log("⚠️ Cross-chain send test error:", error.message);
    }

    try {
      // Test receive from another chain
      const receiveAmount = ethers.parseEther("500");
      await myntisSpokeOFT.connect(deployer).receiveFrom(
        84532, // Base Sepolia
        signers[2].address,
        receiveAmount
      );
      console.log("✅ Cross-chain receive test passed");
    } catch (error) {
      console.log("⚠️ Cross-chain receive test error:", error.message);
    }

    try {
      // Test bridge out
      const bridgeOutAmount = ethers.parseEther("200");
      await myntisSpokeOFT.connect(signers[1]).bridgeOut(signers[1].address, bridgeOutAmount);
      console.log("✅ Bridge out test passed");
    } catch (error) {
      console.log("⚠️ Bridge out test error:", error.message);
    }
  }

  // Display deployment summary
  console.log("\n📊 OFT Spoke Deployment Summary:");
  console.log("===============================");
  console.log(`MyntisSpokeOFT: ${await myntisSpokeOFT.getAddress()}`);
  console.log(`SpokeDistributor: ${await spokeDistributor.getAddress()}`);
  console.log(`GlobalNullifier: ${await globalNullifier.getAddress()}`);
  console.log(`ProxyAdmin: ${await proxyAdmin.getAddress()}`);

  // Display contract info
  console.log("\n📋 Contract Information:");
  console.log("======================");
  
  try {
    const tokenInfo = await myntisSpokeOFT.getContractInfo();
    console.log(`Token Name: ${tokenInfo[0]}`);
    console.log(`Token Symbol: ${tokenInfo[1]}`);
    console.log(`Total Supply: ${ethers.formatEther(tokenInfo[2])} MYNT`);
    console.log(`Paused: ${tokenInfo[3]}`);

    const crossChainInfo = await myntisSpokeOFT.getCrossChainInfo();
    console.log(`Hub Chain ID: ${crossChainInfo[0]}`);
    console.log(`Hub Token: ${crossChainInfo[1]}`);
    console.log(`Current Chain ID: ${crossChainInfo[2]}`);
  } catch (error) {
    console.log("⚠️ Contract info retrieval error:", error.message);
  }

  console.log("\n🎉 OFT Spoke deployment completed!");
  console.log("\nNext steps:");
  console.log("1. Deploy on actual testnet chains");
  console.log("2. Configure real hub addresses");
  console.log("3. Test cross-chain transfers");
  console.log("4. Add LayerZero message passing");

  return {
    myntisSpokeOFT,
    spokeDistributor,
    globalNullifier
  };
}

// Main execution
if (require.main === module) {
  deployOFTSpoke()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ OFT Spoke deployment failed:", error);
      process.exit(1);
    });
}

export { deployOFTSpoke };
