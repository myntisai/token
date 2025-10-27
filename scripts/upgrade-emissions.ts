import { ethers, upgrades } from "hardhat";

/**
 * Script to upgrade the Emissions contract
 * 
 * This script:
 * 1. Deploys the new fixed Emissions contract
 * 2. Updates the StakingContract to point to the new Emissions contract
 * 
 * Prerequisites:
 * - You must have ADMIN_ROLE on the StakingContract
 * - The new Emissions contract must be compatible with the IEmissionContract interface
 * 
 * Usage:
 *   npx hardhat run scripts/upgrade-emissions.ts --network base-sepolia
 */

async function main() {
  console.log("🚀 Starting Emissions contract upgrade...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // Get existing contract addresses
  const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6";
  const MYNTIS_TOKEN_ADDRESS = process.env.MYNTIS_TOKEN_ADDRESS || "0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773";
  const OLD_EMISSIONS_ADDRESS = process.env.EMISSIONS_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  
  console.log("📋 Configuration:");
  console.log("  Token Address:           ", MYNTIS_TOKEN_ADDRESS);
  console.log("  Staking Contract:        ", STAKING_CONTRACT_ADDRESS);
  console.log("  Old Emissions Contract:  ", OLD_EMISSIONS_ADDRESS);
  console.log();

  // Get current emissions stats from old contract
  if (OLD_EMISSIONS_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    try {
      const oldEmissions = await ethers.getContractAt("Emissions", OLD_EMISSIONS_ADDRESS);
      const stats = await oldEmissions.getEmissionStats();
      
      console.log("📊 Current Emissions Stats (Old Contract):");
      console.log("  Current Rate:          ", ethers.formatEther(stats.currentRate), "per second");
      console.log("  Total Emitted:         ", ethers.formatEther(stats.totalEmitted_), "tokens");
      console.log("  Remaining Emissions:   ", ethers.formatEther(stats.remainingEmissions), "tokens");
      console.log("  Minted Emissions:      ", ethers.formatEther(stats.mintedEmissions_), "tokens");
      console.log("  Unaccounted:           ", ethers.formatEther(stats.unaccounted_), "tokens");
      console.log();
      
      // Check if there's a mismatch (the bug we're fixing)
      const minted = BigInt(stats.mintedEmissions_);
      const emitted = BigInt(stats.totalEmitted_);
      if (minted > emitted) {
        console.log("⚠️  WARNING: mintedEmissions > totalEmitted");
        console.log("   This confirms the emission overrun bug!");
        console.log("   Difference:", ethers.formatEther(minted - emitted), "tokens");
        console.log();
      }
    } catch (error) {
      console.log("⚠️  Could not fetch stats from old contract:", error.message);
      console.log();
    }
  }

  // Deploy new Emissions contract with the fix
  console.log("📦 Deploying new Emissions contract with fixes...");
  const EmissionsFactory = await ethers.getContractFactory("Emissions");
  
  const newEmissions = await EmissionsFactory.deploy(
    MYNTIS_TOKEN_ADDRESS,
    STAKING_CONTRACT_ADDRESS,
    deployer.address // admin
  );
  
  await newEmissions.waitForDeployment();
  const newEmissionsAddress = await newEmissions.getAddress();
  
  console.log("✅ New Emissions contract deployed at:", newEmissionsAddress);
  console.log();

  // Update StakingContract to use new Emissions
  console.log("🔄 Updating StakingContract to point to new Emissions...");
  const stakingContract = await ethers.getContractAt("StakingContract", STAKING_CONTRACT_ADDRESS);
  
  const updateTx = await stakingContract.setEmissionContract(newEmissionsAddress);
  console.log("  Transaction hash:", updateTx.hash);
  
  await updateTx.wait();
  console.log("✅ StakingContract updated successfully!");
  console.log();

  // Verify the update
  const currentEmissionsAddress = await stakingContract.emissionContract();
  console.log("🔍 Verification:");
  console.log("  Current Emissions Contract:", currentEmissionsAddress);
  console.log("  Expected:                  ", newEmissionsAddress);
  console.log("  Match:                     ", currentEmissionsAddress === newEmissionsAddress ? "✅ YES" : "❌ NO");
  console.log();

  // Get new emissions stats
  try {
    const stats = await newEmissions.getEmissionStats();
    console.log("📊 New Emissions Stats:");
    console.log("  Current Rate:          ", ethers.formatEther(stats.currentRate), "per second");
    console.log("  Total Emitted:         ", ethers.formatEther(stats.totalEmitted_), "tokens");
    console.log("  Remaining Emissions:   ", ethers.formatEther(stats.remainingEmissions), "tokens");
    console.log("  Minted Emissions:      ", ethers.formatEther(stats.mintedEmissions_), "tokens");
    console.log("  Unaccounted:           ", ethers.formatEther(stats.unaccounted_), "tokens");
    console.log();
  } catch (error) {
    console.log("⚠️  Could not fetch new stats:", error.message);
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log("✅ Emissions Upgrade Complete!");
  console.log("═══════════════════════════════════════════════════════");
  console.log();
  console.log("📝 Summary:");
  console.log("  Old Emissions:  ", OLD_EMISSIONS_ADDRESS);
  console.log("  New Emissions:  ", newEmissionsAddress);
  console.log("  Staking:        ", STAKING_CONTRACT_ADDRESS);
  console.log();
  console.log("🔍 Next Steps:");
  console.log("  1. Verify the contract on Etherscan:");
  console.log(`     npx hardhat verify --network base-sepolia ${newEmissionsAddress} ${MYNTIS_TOKEN_ADDRESS} ${STAKING_CONTRACT_ADDRESS} ${deployer.address}`);
  console.log();
  console.log("  2. Test harvesting with the new contract:");
  console.log("     - Check that 'Emission overrun' error no longer occurs");
  console.log("     - Monitor logs for successful harvests");
  console.log();
  console.log("  3. Update your .env with the new address:");
  console.log(`     EMISSIONS_CONTRACT_ADDRESS=${newEmissionsAddress}`);
  console.log();
  
  // Save deployment info
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    oldEmissions: OLD_EMISSIONS_ADDRESS,
    newEmissions: newEmissionsAddress,
    stakingContract: STAKING_CONTRACT_ADDRESS,
    tokenAddress: MYNTIS_TOKEN_ADDRESS,
    transactionHash: updateTx.hash,
    blockNumber: (await updateTx.wait()).blockNumber
  };

  console.log("\n📄 Deployment Info (save this):");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  });



