import { ethers } from "hardhat";

async function checkBalance() {
  console.log("💰 Checking Account Balance\n");

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available");
  }
  const deployer = signers[0];
  console.log(`Account: ${deployer.address}\n`);

  try {
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Current Balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
      console.log("\n⚠️ No ETH found. Please get testnet ETH from:");
      console.log("• https://sepoliafaucet.com/");
      console.log("• https://faucet.quicknode.com/ethereum/sepolia");
      console.log("• https://www.alchemy.com/faucets/ethereum-sepolia");
    } else {
      console.log("\n✅ Sufficient balance for deployment!");
    }
  } catch (error) {
    console.log(`❌ Error checking balance: ${error.message}`);
  }

  // Check network info
  try {
    const network = await ethers.provider.getNetwork();
    console.log(`\nNetwork: ${network.name} (Chain ID: ${network.chainId})`);
  } catch (error) {
    console.log(`❌ Error getting network info: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  checkBalance()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

export { checkBalance };