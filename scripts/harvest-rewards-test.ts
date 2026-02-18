import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const myntisAddr = deployment.myntis as string;
  const stakingAddr = deployment.dualPoolStaking as string;
  const emissionsAddr = deployment.emissionsContract as string;
  const vaultAddr = deployment.liquidStakingVault as string;

  const [rawSigner] = await ethers.getSigners();
  const signer = new ethers.NonceManager(rawSigner);
  const signerAddress = await rawSigner.getAddress();

  const token = await ethers.getContractAt("Myntis", myntisAddr, signer);
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr, signer);
  const emissions = await ethers.getContractAt("EmissionsContract", emissionsAddr, signer);
  const vault = await ethers.getContractAt("LiquidStakingVault", vaultAddr, signer);

  console.log("=== HARVEST / REWARD TEST ===");
  console.log("Signer:", signerAddress);
  console.log("Token:", myntisAddr);
  console.log("Staking:", stakingAddr);
  console.log("Emissions:", emissionsAddr);
  console.log("Vault:", vaultAddr);

  const balBefore = await token.balanceOf(signerAddress);
  const pendingEmission = await emissions.pendingRewards(signerAddress);
  const pendingStaking = await staking.pendingRewards(signerAddress);
  const pendingVault = await vault.pendingVaultRewards();

  console.log("\n--- BEFORE ---");
  console.log("Wallet balance:", ethers.formatEther(balBefore), "MYNT");
  console.log("Pending emission (provider):", ethers.formatEther(pendingEmission), "MYNT");
  console.log("Pending staking (provider):", ethers.formatEther(pendingStaking), "MYNT");
  console.log("Pending vault rewards:", ethers.formatEther(pendingVault), "MYNT");

  console.log("\n--- HARVEST FROM EMISSIONS ---");
  const harvestEmissionsTx = await staking.harvestFromEmissions(signerAddress);
  console.log("harvestFromEmissions tx:", harvestEmissionsTx.hash);
  await harvestEmissionsTx.wait();

  const pendingStakingAfterSync = await staking.pendingRewards(signerAddress);
  console.log("Pending staking after sync:", ethers.formatEther(pendingStakingAfterSync), "MYNT");

  console.log("\n--- HARVEST STAKING REWARDS (PROVIDER) ---");
  const harvestRewardsTx = await staking.harvestRewards(signerAddress);
  console.log("harvestRewards tx:", harvestRewardsTx.hash);
  await harvestRewardsTx.wait();

  const balAfter = await token.balanceOf(signerAddress);
  console.log("Wallet balance after:", ethers.formatEther(balAfter), "MYNT");
  console.log("Harvested:", ethers.formatEther(balAfter - balBefore), "MYNT");

  console.log("\n--- HARVEST VAULT REWARDS ---");
  const vaultHarvestTx = await vault.harvestVaultRewards();
  console.log("vault harvest tx:", vaultHarvestTx.hash);
  await vaultHarvestTx.wait();

  const pendingVaultAfter = await vault.pendingVaultRewards();
  console.log("Pending vault rewards after:", ethers.formatEther(pendingVaultAfter), "MYNT");

  console.log("\n✅ Harvest/reward test complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
