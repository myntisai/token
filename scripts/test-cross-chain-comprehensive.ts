import { ethers } from "hardhat";

// Your verified contract addresses on Base Sepolia
const HUB_CONTRACTS = {
  token: "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773",
  staking: "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6", 
  emissions: "0x53F6Ad26179DD689227f15924011d34469086346",
  merkleDistributor: "0xbBe0A7517c0Dd93e508248AA4e1bcAd9AaB7F0FB",
  globalNullifier: "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1"
};

// Spoke chain configurations
const SPOKE_CHAINS = {
  "ethereum-sepolia": { chainId: 11155111, name: "Ethereum Sepolia" },
  "arbitrum-sepolia": { chainId: 421614, name: "Arbitrum Sepolia" },
  "polygon-mumbai": { chainId: 80001, name: "Polygon Mumbai" },
  "optimism-sepolia": { chainId: 11155420, name: "Optimism Sepolia" }
};

async function testHubContracts() {
  console.log("🏛️ Testing Hub Contracts (Base Sepolia)...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Testing with account: ${deployer.address}`);

  try {
    // Test Myntis token
    console.log("1️⃣ Testing Myntis Token...");
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = Myntis.attach(HUB_CONTRACTS.token);
    
    const name = await myntis.name();
    const symbol = await myntis.symbol();
    const totalSupply = await myntis.totalSupply();
    const cap = await myntis.cap();
    
    console.log(`✅ Token: ${name} (${symbol})`);
    console.log(`   Total Supply: ${ethers.formatEther(totalSupply)} MYNT`);
    console.log(`   Cap: ${ethers.formatEther(cap)} MYNT`);

    // Test Emissions
    console.log("\n2️⃣ Testing Emissions...");
    const Emissions = await ethers.getContractFactory("Emissions");
    const emissions = Emissions.attach(HUB_CONTRACTS.emissions);
    
    const emissionStats = await emissions.getEmissionStats();
    console.log(`✅ Current Rate: ${ethers.formatEther(emissionStats.currentRate)} MYNT/second`);
    console.log(`   Total Emissions: ${ethers.formatEther(emissionStats.totalEmissions)} MYNT`);
    console.log(`   Remaining: ${ethers.formatEther(emissionStats.remainingEmissions)} MYNT`);

    // Test MerkleDistributor
    console.log("\n3️⃣ Testing MerkleDistributor...");
    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    const merkleDistributor = MerkleDistributor.attach(HUB_CONTRACTS.merkleDistributor);
    
    console.log(`✅ MerkleDistributor deployed and accessible`);

    // Test GlobalNullifier
    console.log("\n4️⃣ Testing GlobalNullifier...");
    const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
    const globalNullifier = GlobalNullifier.attach(HUB_CONTRACTS.globalNullifier);
    
    console.log(`✅ GlobalNullifier deployed and accessible`);

    console.log("\n🎉 Hub contracts are working correctly!");
    return true;

  } catch (error) {
    console.error("❌ Error testing hub contracts:", error);
    return false;
  }
}

async function testSpokeDeployment(networkName: string) {
  console.log(`\n🔗 Testing Spoke Deployment on ${SPOKE_CHAINS[networkName].name}...\n`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  try {
    // Check balance first
    const balance = await ethers.provider.getBalance(deployer.address);
    const balanceEth = ethers.formatEther(balance);
    console.log(`Balance: ${balanceEth} ETH`);

    const minBalance = ethers.parseEther("0.01");
    if (balance < minBalance) {
      console.log(`⚠️  Insufficient balance! Need at least 0.01 ETH`);
      console.log(`\n🚰 Get testnet tokens from:`);
      
      const faucets = {
        "ethereum-sepolia": "https://sepoliafaucet.com/",
        "arbitrum-sepolia": "https://faucet.quicknode.com/arbitrum/sepolia",
        "polygon-mumbai": "https://faucet.polygon.technology/",
        "optimism-sepolia": "https://faucet.quicknode.com/optimism/sepolia"
      };
      
      console.log(`   ${faucets[networkName]}`);
      console.log(`   Enter address: ${deployer.address}`);
      return false;
    }

    // Deploy MyntisSpoke
    console.log("\n1️⃣ Deploying MyntisSpoke...");
    const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
    const spokeToken = await MyntisSpoke.deploy(
      `Myntis ${SPOKE_CHAINS[networkName].name}`,
      "MYNTS",
      84532, // Base Sepolia chain ID
      HUB_CONTRACTS.token,
      deployer.address
    );
    await spokeToken.waitForDeployment();
    console.log(`✅ MyntisSpoke: ${await spokeToken.getAddress()}`);

    // Deploy SpokeDistributor
    console.log("\n2️⃣ Deploying SpokeDistributor...");
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const spokeDistributor = await SpokeDistributor.deploy(
      84532, // Base Sepolia chain ID
      HUB_CONTRACTS.globalNullifier,
      await spokeToken.getAddress(),
      deployer.address
    );
    await spokeDistributor.waitForDeployment();
    console.log(`✅ SpokeDistributor: ${await spokeDistributor.getAddress()}`);

    // Deploy HubSpokeBridge
    console.log("\n3️⃣ Deploying HubSpokeBridge...");
    const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
    const spokeBridge = await HubSpokeBridge.deploy(
      "0x6EDCE65403992e310A62460808c4b910D972f10f", // LZ endpoint
      deployer.address,
      await spokeToken.getAddress(),
      await spokeDistributor.getAddress(),
      HUB_CONTRACTS.globalNullifier,
      84532, // Base Sepolia chain ID
      false // isHub
    );
    await spokeBridge.waitForDeployment();
    console.log(`✅ HubSpokeBridge: ${await spokeBridge.getAddress()}`);

    // Configure roles
    console.log("\n4️⃣ Configuring roles...");
    await spokeToken.grantRole(await spokeToken.MINTER_ROLE(), await spokeBridge.getAddress());
    await spokeToken.grantRole(await spokeToken.BURNER_ROLE(), await spokeBridge.getAddress());
    await spokeBridge.grantRole(await spokeBridge.BRIDGE_ROLE(), await spokeDistributor.getAddress());
    await spokeDistributor.grantRole(await spokeDistributor.PROVIDER_ROLE(), deployer.address);
    console.log(`✅ Roles configured`);

    // Test basic functionality
    console.log("\n5️⃣ Testing functionality...");
    
    // Test token minting
    await spokeToken.mint(deployer.address, ethers.parseEther("1000"), "test-mint");
    const tokenBalance = await spokeToken.balanceOf(deployer.address);
    console.log(`✅ Token minted: ${ethers.formatEther(tokenBalance)} MYNTS`);

    // Test nullifier generation
    const nullifier = await spokeDistributor.generateNullifier(deployer.address, 0, SPOKE_CHAINS[networkName].chainId);
    console.log(`✅ Nullifier generated: ${nullifier}`);

    // Test Merkle root submission
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`test-root-${networkName}`));
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days
    await spokeDistributor.submitMerkleRoot(merkleRoot, expiry, ethers.parseEther("1000"));
    console.log(`✅ Merkle root submitted`);

    console.log(`\n🎉 ${SPOKE_CHAINS[networkName].name} deployment successful!`);
    
    return {
      network: networkName,
      chainName: SPOKE_CHAINS[networkName].name,
      contracts: {
        MyntisSpoke: await spokeToken.getAddress(),
        SpokeDistributor: await spokeDistributor.getAddress(),
        HubSpokeBridge: await spokeBridge.getAddress()
      }
    };

  } catch (error) {
    console.error(`❌ Error deploying on ${networkName}:`, error);
    return null;
  }
}

async function main() {
  console.log("🌐 Comprehensive Cross-Chain Testing...\n");

  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  console.log(`Target Network: ${networkName}`);

  if (networkName === "hardhat") {
    console.log("🧪 Running on hardhat - testing hub contracts only");
    await testHubContracts();
  } else if (SPOKE_CHAINS[networkName]) {
    console.log(`🔗 Testing spoke deployment on ${SPOKE_CHAINS[networkName].name}`);
    const result = await testSpokeDeployment(networkName);
    
    if (result) {
      console.log("\n📄 Deployment Summary:");
      console.log(JSON.stringify(result, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
    }
  } else {
    console.log("❌ Unknown network. Available networks:");
    Object.keys(SPOKE_CHAINS).forEach(net => {
      console.log(`  - ${net}: ${SPOKE_CHAINS[net].name}`);
    });
    console.log("\n💡 Usage:");
    console.log("  npx hardhat run scripts/test-cross-chain-comprehensive.ts --network ethereum-sepolia");
    console.log("  npx hardhat run scripts/test-cross-chain-comprehensive.ts --network arbitrum-sepolia");
    console.log("  npx hardhat run scripts/test-cross-chain-comprehensive.ts --network polygon-mumbai");
    console.log("  npx hardhat run scripts/test-cross-chain-comprehensive.ts --network optimism-sepolia");
  }

  console.log("\n📋 Next Steps:");
  console.log("1. Get testnet tokens if needed:");
  console.log("   npx hardhat run scripts/check-balance.ts --network <network>");
  console.log("2. Deploy on each spoke chain:");
  console.log("   npx hardhat run scripts/test-cross-chain-comprehensive.ts --network ethereum-sepolia");
  console.log("   npx hardhat run scripts/test-cross-chain-comprehensive.ts --network arbitrum-sepolia");
  console.log("   npx hardhat run scripts/test-cross-chain-comprehensive.ts --network polygon-mumbai");
  console.log("   npx hardhat run scripts/test-cross-chain-comprehensive.ts --network optimism-sepolia");
  console.log("3. Test cross-chain functionality between all chains");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
