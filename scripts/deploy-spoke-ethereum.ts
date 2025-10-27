import { ethers } from "hardhat";
import { Contract } from "ethers";

interface SpokeDeploymentResult {
  myntisSpokeOFT: Contract;
}

async function deploySpokeEthereum(): Promise<SpokeDeploymentResult> {
  console.log("🚀 Deploying Myntis Spoke on Ethereum Sepolia...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // LayerZero endpoint for Ethereum Sepolia
  const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f"; // Ethereum Sepolia LZ endpoint

  // Deploy MyntisSpokeOFT
  console.log("📝 Deploying MyntisSpokeOFT...");
  const MyntisSpokeOFT = await ethers.getContractFactory("MyntisSpokeOFT");
  const myntisSpokeOFT = await MyntisSpokeOFT.deploy();
  await myntisSpokeOFT.waitForDeployment();
  console.log(`✅ MyntisSpokeOFT deployed to: ${await myntisSpokeOFT.getAddress()}`);

  // Initialize MyntisSpokeOFT
  await myntisSpokeOFT.initialize(
    "Myntis",
    "MYNT",
    LZ_ENDPOINT,
    deployer.address
  );
  console.log("✅ MyntisSpokeOFT initialized");

  // Display deployment summary
  console.log("\n📊 Spoke Deployment Summary:");
  console.log("============================");
  console.log(`MyntisSpokeOFT: ${await myntisSpokeOFT.getAddress()}`);
  console.log(`Chain ID: ${await myntisSpokeOFT.getChainInfo().then(info => info.chainId)}`);
  console.log(`Is Hub: ${await myntisSpokeOFT.getChainInfo().then(info => info.isHub)}`);
  console.log(`Is Spoke: ${await myntisSpokeOFT.isSpokeToken()}`);

  // Display contract info
  console.log("\n📋 Contract Information:");
  console.log("========================");
  
  const tokenInfo = await myntisSpokeOFT.getContractInfo();
  console.log(`Token Name: ${tokenInfo[0]}`);
  console.log(`Token Symbol: ${tokenInfo[1]}`);
  console.log(`Total Supply: ${ethers.formatEther(tokenInfo[2])} MYNT`);
  console.log(`Paused: ${tokenInfo[3]}`);

  console.log("\n🎉 Spoke deployment completed successfully!");
  console.log("\nNext steps:");
  console.log("1. Configure LayerZero peer connections");
  console.log("2. Test cross-chain transfers");
  console.log("3. Test cross-chain reward claims");

  return {
    myntisSpokeOFT
  };
}

// Main execution
if (require.main === module) {
  deploySpokeEthereum()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Spoke deployment failed:", error);
      process.exit(1);
    });
}

export { deploySpokeEthereum };
