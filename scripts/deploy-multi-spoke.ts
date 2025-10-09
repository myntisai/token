import { ethers } from "hardhat";
import { Contract } from "ethers";

// Chain configurations
const CHAIN_CONFIGS = {
  "ethereum-sepolia": {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
  },
  "arbitrum-sepolia": {
    name: "Arbitrum Sepolia", 
    chainId: 421614,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
  },
  "polygon-mumbai": {
    name: "Polygon Mumbai",
    chainId: 80001,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
  },
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    chainId: 11155420,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f"
  }
};

// Hub contract addresses (Base Sepolia)
const HUB_CONTRACTS = {
  token: "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773",
  globalNullifier: "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1"
};

async function deploySpokeChain(networkName: string) {
  console.log(`\n🚀 Deploying Spoke Contracts on ${CHAIN_CONFIGS[networkName].name}...\n`);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const config = CHAIN_CONFIGS[networkName];
  const currentChainId = (await ethers.provider.getNetwork()).chainId;
  
  console.log(`Current Chain ID: ${currentChainId}`);
  console.log(`Hub Chain ID: ${config.hubChainId}`);
  console.log(`LayerZero Endpoint: ${config.lzEndpoint}`);

  // 1. Deploy MyntisSpoke Token
  console.log("\n1️⃣ Deploying MyntisSpoke Token...");
  const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
  const spokeToken = await MyntisSpoke.deploy(
    `Myntis ${config.name}`,
    "MYNTS",
    config.hubChainId,
    HUB_CONTRACTS.token,
    deployer.address
  );
  await spokeToken.waitForDeployment();
  console.log(`✅ MyntisSpoke deployed to: ${await spokeToken.getAddress()}`);

  // 2. Deploy SpokeDistributor
  console.log("\n2️⃣ Deploying SpokeDistributor...");
  const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
  const spokeDistributor = await SpokeDistributor.deploy(
    config.hubChainId,
    HUB_CONTRACTS.globalNullifier,
    await spokeToken.getAddress(),
    deployer.address
  );
  await spokeDistributor.waitForDeployment();
  console.log(`✅ SpokeDistributor deployed to: ${await spokeDistributor.getAddress()}`);

  // 3. Deploy HubSpokeBridge
  console.log("\n3️⃣ Deploying HubSpokeBridge...");
  const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
  const spokeBridge = await HubSpokeBridge.deploy(
    config.lzEndpoint,
    deployer.address,
    await spokeToken.getAddress(),
    await spokeDistributor.getAddress(),
    HUB_CONTRACTS.globalNullifier,
    config.hubChainId,
    false // isHub = false for spoke chains
  );
  await spokeBridge.waitForDeployment();
  console.log(`✅ HubSpokeBridge deployed to: ${await spokeBridge.getAddress()}`);

  // 4. Configure roles and permissions
  console.log("\n4️⃣ Configuring roles and permissions...");
  
  // Grant bridge role to spoke bridge
  await spokeToken.grantRole(await spokeToken.MINTER_ROLE(), await spokeBridge.getAddress());
  await spokeToken.grantRole(await spokeToken.BURNER_ROLE(), await spokeBridge.getAddress());
  console.log(`✅ Bridge roles granted to HubSpokeBridge`);

  // Grant bridge role to spoke distributor
  await spokeBridge.grantRole(await spokeBridge.BRIDGE_ROLE(), await spokeDistributor.getAddress());
  console.log(`✅ Bridge role granted to SpokeDistributor`);

  // Grant provider role to deployer for testing
  await spokeDistributor.grantRole(await spokeDistributor.PROVIDER_ROLE(), deployer.address);
  console.log(`✅ Provider role granted to deployer`);

  // 5. Test basic functionality
  console.log("\n5️⃣ Testing basic functionality...");
  
  // Test spoke token minting
  await spokeToken.mint(deployer.address, ethers.parseEther("1000"), "initial-mint");
  const tokenBalance = await spokeToken.balanceOf(deployer.address);
  console.log(`✅ Spoke token minted: ${ethers.formatEther(tokenBalance)} MYNTS`);

  // Test nullifier generation
  const nullifier = await spokeDistributor.generateNullifier(deployer.address, 0, currentChainId);
  console.log(`✅ Nullifier generated: ${nullifier}`);

  // Test Merkle root submission
  const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`test-root-${networkName}`));
  const expiry = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days
  await spokeDistributor.submitMerkleRoot(merkleRoot, expiry, ethers.parseEther("1000"));
  console.log(`✅ Merkle root submitted for distribution`);

  // 6. Save deployment info
  const deploymentInfo = {
    network: networkName,
    chainName: config.name,
    chainId: currentChainId,
    hubChainId: config.hubChainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MyntisSpoke: await spokeToken.getAddress(),
      SpokeDistributor: await spokeDistributor.getAddress(),
      HubSpokeBridge: await spokeBridge.getAddress()
    },
    configuration: {
      hubToken: HUB_CONTRACTS.token,
      hubGlobalNullifier: HUB_CONTRACTS.globalNullifier,
      lzEndpoint: config.lzEndpoint
    }
  };

  console.log("\n📄 Deployment Summary:");
  console.log(JSON.stringify(deploymentInfo, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value, 2));

  console.log(`\n🎉 ${config.name} deployment completed successfully!`);
  
  return deploymentInfo;
}

async function main() {
  console.log("🌐 Multi-Spoke Chain Deployment Starting...\n");

  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  console.log(`Target Network: ${networkName}`);

  if (networkName === "hardhat") {
    console.log("⚠️ Running on hardhat network - deploying single spoke for testing");
    await deploySpokeChain("ethereum-sepolia");
  } else if (CHAIN_CONFIGS[networkName]) {
    await deploySpokeChain(networkName);
  } else {
    console.log("❌ Unknown network. Available networks:");
    Object.keys(CHAIN_CONFIGS).forEach(net => {
      console.log(`  - ${net}: ${CHAIN_CONFIGS[net].name}`);
    });
    process.exit(1);
  }

  console.log("\n📋 Next Steps:");
  console.log("1. Deploy on other spoke chains using:");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network arbitrum-sepolia");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network polygon-mumbai");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network optimism-sepolia");
  console.log("2. Configure cross-chain connections");
  console.log("3. Test cross-chain functionality");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
