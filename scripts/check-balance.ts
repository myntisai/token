import { ethers } from "hardhat";

async function main() {
  console.log("💰 Checking testnet token balances...\n");

  const [deployer] = await ethers.getSigners();
  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  
  console.log(`Network: ${networkName}`);
  console.log(`Address: ${deployer.address}`);
  
  try {
    const balance = await ethers.provider.getBalance(deployer.address);
    const balanceEth = ethers.formatEther(balance);
    
    console.log(`Balance: ${balanceEth} ETH`);
    
    const minBalance = ethers.parseEther("0.01");
    if (balance < minBalance) {
      console.log(`⚠️  Insufficient balance! Need at least 0.01 ETH for deployment`);
      console.log(`\n🚰 Get testnet tokens from:`);
      
      const faucets = {
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
      
      const networkFaucets = faucets[networkName] || [];
      networkFaucets.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });
    } else {
      console.log(`✅ Sufficient balance for deployment!`);
      console.log(`\n🚀 Ready to deploy spoke contracts:`);
      console.log(`   npx hardhat run scripts/deploy-multi-spoke.ts --network ${networkName}`);
    }
  } catch (error) {
    console.error("❌ Error checking balance:", error);
    console.log("\n💡 Make sure you're connected to the right network");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
