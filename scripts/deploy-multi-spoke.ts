import { ethers } from "hardhat";
import { Contract } from "ethers";

// Chain configurations - Testnet and Mainnet
const CHAIN_CONFIGS: { [key: string]: {
  name: string;
  chainId: number;
  hubChainId: number; // Base Sepolia (testnet) or Base Mainnet
  lzEndpoint: string;
  lzEid: number; // LayerZero Endpoint ID
  isTestnet: boolean;
}} = {
  // Testnets
  "ethereum-sepolia": {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero v2 Sepolia
    lzEid: 40161,
    isTestnet: true
  },
  "arbitrum-sepolia": {
    name: "Arbitrum Sepolia", 
    chainId: 421614,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero v2 Sepolia
    lzEid: 40245,
    isTestnet: true
  },
  "polygon-mumbai": {
    name: "Polygon Mumbai",
    chainId: 80001,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero v2 Sepolia
    lzEid: 40109,
    isTestnet: true
  },
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    chainId: 11155420,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero v2 Sepolia
    lzEid: 40232,
    isTestnet: true
  },
  "bsc-testnet": {
    name: "BSC Testnet",
    chainId: 97,
    hubChainId: 84532, // Base Sepolia
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero v2 Sepolia
    lzEid: 40102,
    isTestnet: true
  },
  // Mainnets
  // ⚠️ IMPORTANT: Update LayerZero mainnet endpoint addresses before mainnet deployment!
  // Check: https://docs.layerzero.network/ or https://layerzeroscan.com/
  "ethereum-mainnet": {
    name: "Ethereum Mainnet",
    chainId: 1,
    hubChainId: 8453, // Base Mainnet
    lzEndpoint: "0x1a4407605a68d2b5c0e3b3e5b5b5b5b5b5b5b5b5", // TODO: Update with actual LayerZero v2 Mainnet endpoint
    lzEid: 30101,
    isTestnet: false
  },
  "arbitrum-mainnet": {
    name: "Arbitrum One",
    chainId: 42161,
    hubChainId: 8453, // Base Mainnet
    lzEndpoint: "0x1a4407605a68d2b5c0e3b3e5b5b5b5b5b5b5b5b5", // TODO: Update with actual LayerZero v2 Mainnet endpoint
    lzEid: 30110,
    isTestnet: false
  },
  "polygon-mainnet": {
    name: "Polygon Mainnet",
    chainId: 137,
    hubChainId: 8453, // Base Mainnet
    lzEndpoint: "0x1a4407605a68d2b5c0e3b3e5b5b5b5b5b5b5b5b5", // TODO: Update with actual LayerZero v2 Mainnet endpoint
    lzEid: 30109,
    isTestnet: false
  },
  "optimism-mainnet": {
    name: "Optimism Mainnet",
    chainId: 10,
    hubChainId: 8453, // Base Mainnet
    lzEndpoint: "0x1a4407605a68d2b5c0e3b3e5b5b5b5b5b5b5b5b5", // TODO: Update with actual LayerZero v2 Mainnet endpoint
    lzEid: 30111,
    isTestnet: false
  },
  "bsc-mainnet": {
    name: "BSC Mainnet",
    chainId: 56,
    hubChainId: 8453, // Base Mainnet
    lzEndpoint: "0x1a4407605a68d2b5c0e3b3e5b5b5b5b5b5b5b5b5", // TODO: Update with actual LayerZero v2 Mainnet endpoint
    lzEid: 30102,
    isTestnet: false
  }
};

// Hub contract addresses - Testnet (Base Sepolia) and Mainnet (Base Mainnet)
const HUB_CONTRACTS = {
  testnet: {
    token: "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773",
    globalNullifier: "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1",
    staking: "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6",
    emissions: "0x53F6Ad26179DD689227f15924011d34469086346",
    merkleDistributor: "0xbBe0A7517c0Dd93e508248AA4e1bcAd9AaB7F0FB"
  },
  mainnet: {
    // TODO: Update with mainnet addresses after deployment
    token: "0x0000000000000000000000000000000000000000",
    globalNullifier: "0x0000000000000000000000000000000000000000",
    staking: "0x0000000000000000000000000000000000000000",
    emissions: "0x0000000000000000000000000000000000000000",
    merkleDistributor: "0x0000000000000000000000000000000000000000"
  }
};

async function deploySpokeChain(networkName: string) {
  const config = CHAIN_CONFIGS[networkName];
  if (!config) {
    throw new Error(`Unknown network: ${networkName}`);
  }

  console.log(`\n🚀 Deploying Spoke Contracts on ${config.name} (${config.isTestnet ? 'Testnet' : 'Mainnet'})...\n`);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const currentChainId = (await ethers.provider.getNetwork()).chainId;
  const hubContracts = config.isTestnet ? HUB_CONTRACTS.testnet : HUB_CONTRACTS.mainnet;
  
  console.log(`Current Chain ID: ${currentChainId}`);
  console.log(`Hub Chain ID: ${config.hubChainId}`);
  console.log(`LayerZero Endpoint: ${config.lzEndpoint}`);
  console.log(`LayerZero EID: ${config.lzEid}`);

  // 1. Deploy MyntisSpoke Token
  console.log("\n1️⃣ Deploying MyntisSpoke Token...");
  const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
  const spokeToken = await MyntisSpoke.deploy(
    `Myntis ${config.name}`,
    "MYNTS",
    config.hubChainId,
    hubContracts.token,
    deployer.address
  );
  await spokeToken.waitForDeployment();
  console.log(`✅ MyntisSpoke deployed to: ${await spokeToken.getAddress()}`);

  // 2. Deploy SpokeDistributor
  console.log("\n2️⃣ Deploying SpokeDistributor...");
  const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
  const spokeDistributor = await SpokeDistributor.deploy(
    config.hubChainId,
    hubContracts.globalNullifier,
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
    hubContracts.globalNullifier,
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
      hubToken: hubContracts.token,
      hubGlobalNullifier: hubContracts.globalNullifier,
      hubStaking: hubContracts.staking,
      hubEmissions: hubContracts.emissions,
      hubMerkleDistributor: hubContracts.merkleDistributor,
      lzEndpoint: config.lzEndpoint,
      lzEid: config.lzEid,
      isTestnet: config.isTestnet
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
  console.log("1. Deploy on other testnet spoke chains:");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network ethereum-sepolia");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network arbitrum-sepolia");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network polygon-mumbai");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network optimism-sepolia");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network bsc-testnet");
  console.log("2. Deploy on mainnet spoke chains (after hub mainnet deployment):");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network ethereum-mainnet");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network arbitrum-mainnet");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network polygon-mainnet");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network optimism-mainnet");
  console.log("   npx hardhat run scripts/deploy-multi-spoke.ts --network bsc-mainnet");
  console.log("3. Configure cross-chain connections using configure-oft-peers.ts");
  console.log("4. Deploy Solana SPL token (separate process)");
  console.log("5. Add liquidity to all chains using liquidity-management scripts");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
