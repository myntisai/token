import { ethers } from "hardhat";

// Spoke chain configurations
const SPOKE_CHAINS = {
  "ethereum-sepolia": { 
    chainId: 11155111, 
    name: "Ethereum Sepolia",
    hubChainId: 84532,
    faucet: "https://sepoliafaucet.com/"
  },
  "arbitrum-sepolia": { 
    chainId: 421614, 
    name: "Arbitrum Sepolia",
    hubChainId: 84532,
    faucet: "https://faucet.quicknode.com/arbitrum/sepolia"
  },
  "polygon-mumbai": { 
    chainId: 80001, 
    name: "Polygon Mumbai",
    hubChainId: 84532,
    faucet: "https://faucet.polygon.technology/"
  },
  "optimism-sepolia": { 
    chainId: 11155420, 
    name: "Optimism Sepolia",
    hubChainId: 84532,
    faucet: "https://faucet.quicknode.com/optimism/sepolia"
  }
};

// Your verified contract addresses on Base Sepolia
const HUB_CONTRACTS = {
  token: "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773",
  globalNullifier: "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1"
};

async function checkBalanceAndGetTokens(networkName: string) {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);
  
  console.log(`\n💰 ${SPOKE_CHAINS[networkName].name} Balance:`);
  console.log(`Address: ${deployer.address}`);
  console.log(`Balance: ${balanceEth} ETH`);
  
  const minBalance = ethers.parseEther("0.01");
  if (balance < minBalance) {
    console.log(`⚠️  Insufficient balance! Need at least 0.01 ETH for deployment`);
    console.log(`\n🚰 Get testnet tokens from:`);
    console.log(`   ${SPOKE_CHAINS[networkName].faucet}`);
    console.log(`   Enter address: ${deployer.address}`);
    console.log(`\n💡 Alternative faucets:`);
    
    const alternatives = {
      "ethereum-sepolia": [
        "https://faucet.quicknode.com/ethereum/sepolia",
        "https://www.alchemy.com/faucets/ethereum-sepolia"
      ],
      "arbitrum-sepolia": [
        "https://faucet.arbitrum.io/"
      ],
      "polygon-mumbai": [
        "https://faucet.quicknode.com/polygon/mumbai"
      ],
      "optimism-sepolia": [
        "https://faucet.optimism.io/"
      ]
    };
    
    alternatives[networkName]?.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });
    
    console.log(`\n🔄 After getting tokens, run:`);
    console.log(`   npx hardhat run scripts/deploy-and-test-spoke.ts --network ${networkName}`);
    
    return false;
  }
  
  console.log(`✅ Sufficient balance for deployment!`);
  return true;
}

async function deploySpokeContracts(networkName: string) {
  console.log(`\n🚀 Deploying Spoke Contracts on ${SPOKE_CHAINS[networkName].name}...\n`);

  const [deployer] = await ethers.getSigners();
  const config = SPOKE_CHAINS[networkName];
  
  console.log(`Deploying with account: ${deployer.address}`);
  console.log(`Chain ID: ${config.chainId}`);
  console.log(`Hub Chain ID: ${config.hubChainId}`);

  try {
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
    const spokeTokenAddress = await spokeToken.getAddress();
    console.log(`✅ MyntisSpoke deployed to: ${spokeTokenAddress}`);

    // 2. Deploy SpokeDistributor
    console.log("\n2️⃣ Deploying SpokeDistributor...");
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const spokeDistributor = await SpokeDistributor.deploy(
      config.hubChainId,
      HUB_CONTRACTS.globalNullifier,
      spokeTokenAddress,
      deployer.address
    );
    await spokeDistributor.waitForDeployment();
    const spokeDistributorAddress = await spokeDistributor.getAddress();
    console.log(`✅ SpokeDistributor deployed to: ${spokeDistributorAddress}`);

    // 3. Deploy HubSpokeBridge
    console.log("\n3️⃣ Deploying HubSpokeBridge...");
    const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
    const spokeBridge = await HubSpokeBridge.deploy(
      "0x6EDCE65403992e310A62460808c4b910D972f10f", // LZ endpoint
      deployer.address,
      spokeTokenAddress,
      spokeDistributorAddress,
      HUB_CONTRACTS.globalNullifier,
      config.hubChainId,
      false // isHub
    );
    await spokeBridge.waitForDeployment();
    const spokeBridgeAddress = await spokeBridge.getAddress();
    console.log(`✅ HubSpokeBridge deployed to: ${spokeBridgeAddress}`);

    // 4. Configure roles and permissions
    console.log("\n4️⃣ Configuring roles and permissions...");
    
    // Grant bridge roles to spoke bridge
    await spokeToken.grantRole(await spokeToken.MINTER_ROLE(), spokeBridgeAddress);
    await spokeToken.grantRole(await spokeToken.BURNER_ROLE(), spokeBridgeAddress);
    console.log(`✅ Bridge roles granted to HubSpokeBridge`);

    // Grant bridge role to spoke distributor
    await spokeBridge.grantRole(await spokeBridge.BRIDGE_ROLE(), spokeDistributorAddress);
    console.log(`✅ Bridge role granted to SpokeDistributor`);

    // Grant provider role to deployer for testing
    await spokeDistributor.grantRole(await spokeDistributor.PROVIDER_ROLE(), deployer.address);
    console.log(`✅ Provider role granted to deployer`);

    // 5. Test core functionality
    console.log("\n5️⃣ Testing core functionality...");
    
    // Grant MINTER_ROLE and BURNER_ROLE to deployer for testing
    await spokeToken.grantRole(await spokeToken.MINTER_ROLE(), deployer.address);
    await spokeToken.grantRole(await spokeToken.BURNER_ROLE(), deployer.address);
    console.log(`✅ MINTER_ROLE and BURNER_ROLE granted to deployer for testing`);
    
    // Test token minting
    await spokeToken.mint(deployer.address, ethers.parseEther("1000"), "initial-mint");
    const tokenBalance = await spokeToken.balanceOf(deployer.address);
    console.log(`✅ Token minted: ${ethers.formatEther(tokenBalance)} MYNTS`);

    // Test nullifier generation
    const nullifier = await spokeDistributor.generateNullifier(deployer.address, 0, config.chainId);
    console.log(`✅ Nullifier generated: ${nullifier}`);

    // Test Merkle root submission
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`test-root-${networkName}`));
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days
    await spokeDistributor.submitMerkleRoot(merkleRoot, expiry, ethers.parseEther("1000"));
    console.log(`✅ Merkle root submitted for distribution`);

    // Test token burning
    await spokeToken.burn(deployer.address, ethers.parseEther("100"), "test-burn");
    const balanceAfterBurn = await spokeToken.balanceOf(deployer.address);
    console.log(`✅ Token burned: ${ethers.formatEther(balanceAfterBurn)} MYNTS remaining`);

    // 6. Save deployment info
    const deploymentInfo = {
      network: networkName,
      chainName: config.name,
      chainId: config.chainId,
      hubChainId: config.hubChainId,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        MyntisSpoke: spokeTokenAddress,
        SpokeDistributor: spokeDistributorAddress,
        HubSpokeBridge: spokeBridgeAddress
      },
      hubContracts: HUB_CONTRACTS,
      testResults: {
        tokenMinting: "✅ PASSED",
        nullifierGeneration: "✅ PASSED", 
        merkleRootSubmission: "✅ PASSED",
        tokenBurning: "✅ PASSED"
      }
    };

    console.log("\n📄 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2));

    console.log(`\n🎉 ${config.name} deployment and testing completed successfully!`);
    
    return deploymentInfo;

  } catch (error) {
    console.error(`❌ Error deploying on ${networkName}:`, error);
    return null;
  }
}

async function main() {
  console.log("🌐 Spoke Chain Deployment and Testing...\n");

  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  console.log(`Target Network: ${networkName}`);

  if (networkName === "hardhat") {
    console.log("🧪 Running on hardhat - testing local deployment");
    await deploySpokeContracts("ethereum-sepolia");
  } else if (SPOKE_CHAINS[networkName]) {
    console.log(`🔗 Deploying on ${SPOKE_CHAINS[networkName].name}`);
    
    const hasBalance = await checkBalanceAndGetTokens(networkName);
    if (hasBalance) {
      const result = await deploySpokeContracts(networkName);
      
      if (result) {
        console.log("\n📋 Next Steps:");
        console.log("1. Deploy on other spoke chains:");
        console.log("   npx hardhat run scripts/deploy-and-test-spoke.ts --network arbitrum-sepolia");
        console.log("   npx hardhat run scripts/deploy-and-test-spoke.ts --network polygon-mumbai");
        console.log("   npx hardhat run scripts/deploy-and-test-spoke.ts --network optimism-sepolia");
        console.log("2. Configure cross-chain connections between hub and spokes");
        console.log("3. Test cross-chain reward distribution");
        console.log("4. Test nullifier prevention across all chains");
      }
    }
  } else {
    console.log("❌ Unknown network. Available networks:");
    Object.keys(SPOKE_CHAINS).forEach(net => {
      console.log(`  - ${net}: ${SPOKE_CHAINS[net].name}`);
    });
    console.log("\n💡 Usage:");
    console.log("  npx hardhat run scripts/deploy-and-test-spoke.ts --network ethereum-sepolia");
    console.log("  npx hardhat run scripts/deploy-and-test-spoke.ts --network arbitrum-sepolia");
    console.log("  npx hardhat run scripts/deploy-and-test-spoke.ts --network polygon-mumbai");
    console.log("  npx hardhat run scripts/deploy-and-test-spoke.ts --network optimism-sepolia");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
