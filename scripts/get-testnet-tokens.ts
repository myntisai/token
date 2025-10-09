import { ethers } from "hardhat";

// Testnet faucet URLs for different chains
const FAUCET_URLS = {
  "ethereum-sepolia": "https://sepoliafaucet.com/",
  "arbitrum-sepolia": "https://faucet.quicknode.com/arbitrum/sepolia",
  "polygon-mumbai": "https://faucet.polygon.technology/",
  "optimism-sepolia": "https://faucet.quicknode.com/optimism/sepolia",
  "base-sepolia": "https://bridge.base.org/deposit"
};

// Alternative faucet URLs
const ALTERNATIVE_FAUCETS = {
  "ethereum-sepolia": [
    "https://sepoliafaucet.com/",
    "https://faucet.quicknode.com/ethereum/sepolia",
    "https://www.alchemy.com/faucets/ethereum-sepolia"
  ],
  "arbitrum-sepolia": [
    "https://faucet.quicknode.com/arbitrum/sepolia",
    "https://faucet.arbitrum.io/"
  ],
  "polygon-mumbai": [
    "https://faucet.polygon.technology/",
    "https://faucet.quicknode.com/polygon/mumbai"
  ],
  "optimism-sepolia": [
    "https://faucet.quicknode.com/optimism/sepolia",
    "https://faucet.optimism.io/"
  ],
  "base-sepolia": [
    "https://bridge.base.org/deposit",
    "https://faucet.quicknode.com/base/sepolia"
  ]
};

async function checkBalance(networkName: string) {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);
  
  console.log(`\n💰 ${networkName.toUpperCase()} Balance:`);
  console.log(`Address: ${deployer.address}`);
  console.log(`Balance: ${balanceEth} ETH`);
  
  // Check if balance is sufficient for deployment (need at least 0.01 ETH)
  const minBalance = ethers.parseEther("0.01");
  if (balance < minBalance) {
    console.log(`⚠️  Insufficient balance! Need at least 0.01 ETH for deployment`);
    return false;
  } else {
    console.log(`✅ Sufficient balance for deployment`);
    return true;
  }
}

async function getFaucetInstructions(networkName: string) {
  console.log(`\n🚰 Getting testnet tokens for ${networkName.toUpperCase()}:`);
  console.log(`\n1. Visit these faucets:`);
  
  const faucets = ALTERNATIVE_FAUCETS[networkName] || [FAUCET_URLS[networkName]];
  faucets.forEach((url, index) => {
    console.log(`   ${index + 1}. ${url}`);
  });
  
  console.log(`\n2. Enter your address: ${(await ethers.getSigners())[0].address}`);
  console.log(`\n3. Request testnet tokens (usually 0.1-1 ETH)`);
  console.log(`\n4. Wait for confirmation and try again`);
  
  console.log(`\n💡 Tips:`);
  console.log(`   - Some faucets have rate limits (1 request per hour/day)`);
  console.log(`   - Try multiple faucets if one doesn't work`);
  console.log(`   - You can also bridge from Ethereum mainnet if you have ETH`);
}

async function main() {
  console.log("🔍 Checking testnet token balances...\n");

  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  console.log(`Current Network: ${networkName}`);

  if (networkName === "hardhat") {
    console.log("✅ Hardhat network - no tokens needed");
    return;
  }

  const hasBalance = await checkBalance(networkName);
  
  if (!hasBalance) {
    await getFaucetInstructions(networkName);
    
    console.log(`\n🔄 After getting tokens, run:`);
    console.log(`   npx hardhat run scripts/check-balance.ts --network ${networkName}`);
    console.log(`\n📋 Then deploy with:`);
    console.log(`   npx hardhat run scripts/deploy-multi-spoke.ts --network ${networkName}`);
  } else {
    console.log(`\n🚀 Ready to deploy! Run:`);
    console.log(`   npx hardhat run scripts/deploy-multi-spoke.ts --network ${networkName}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
