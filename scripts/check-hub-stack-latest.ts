import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Deployment = {
  myntis: string;
  emissionsContract: string;
  dualPoolStaking: string;
  dualPoolStakingImplementation?: string;
  groth16Verifier: string;
  zkMerkleDistributor: string;
  globalSupplyRegistry: string;
  liquidStakingVault: string;
  network: string;
  chainId: number;
  deployer: string;
  timestamp: string;
};

function loadDeployment(): Deployment {
  const file = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing deployment file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const d = loadDeployment();
  console.log(`Network: ${network.name} (chainId ${d.chainId})`);
  console.log(`Deployment timestamp: ${d.timestamp}`);
  console.log(`Deployer: ${d.deployer}`);
  console.log("");

  const myntis = await ethers.getContractAt("Myntis", d.myntis);
  const emissions = await ethers.getContractAt("EmissionsContract", d.emissionsContract);
  const staking = await ethers.getContractAt("DualPoolStaking", d.dualPoolStaking);
  const dist = await ethers.getContractAt("ZKMerkleDistributor", d.zkMerkleDistributor);
  const gsr = await ethers.getContractAt("GlobalSupplyRegistry", d.globalSupplyRegistry);

  const onchainRegistry = await myntis.globalSupplyRegistry();
  const minterRole = await myntis.MINTER_ROLE();
  const tokenRole = await gsr.TOKEN_ROLE();

  const minterOk = await myntis.hasRole(minterRole, d.emissionsContract);
  const tokenRoleOk = await gsr.hasRole(tokenRole, d.myntis);

  console.log("Myntis");
  console.log("  address:", d.myntis);
  console.log("  globalSupplyRegistry:", onchainRegistry);
  console.log("  MINTER_ROLE(emissions):", minterOk);

  console.log("EmissionsContract");
  console.log("  address:", d.emissionsContract);
  console.log("  stakingContract:", await emissions.stakingContract());

  console.log("DualPoolStaking");
  console.log("  address:", d.dualPoolStaking);
  if (d.dualPoolStakingImplementation) console.log("  implementation:", d.dualPoolStakingImplementation);
  console.log("  emissionsContract:", await staking.emissionsContract());
  console.log("  liquidStakingVault:", await staking.liquidStakingVault());
  console.log("  zkMerkleDistributor:", await staking.zkMerkleDistributor());
  console.log("  treasury:", await staking.treasury());

  console.log("ZKMerkleDistributor");
  console.log("  address:", d.zkMerkleDistributor);
  console.log("  token:", await dist.token());
  console.log("  batchVerifier:", await dist.batchVerifier());
  console.log("  stakingContract:", await dist.stakingContract());
  console.log("  slashRecipient:", await dist.slashRecipient());
  console.log("  verifierUpdateDelay:", (await dist.verifierUpdateDelay()).toString());

  console.log("GlobalSupplyRegistry");
  console.log("  address:", d.globalSupplyRegistry);
  console.log("  TOKEN_ROLE(myntis):", tokenRoleOk);

  console.log("");
  const ok =
    onchainRegistry.toLowerCase() === d.globalSupplyRegistry.toLowerCase() &&
    minterOk &&
    tokenRoleOk &&
    (await emissions.stakingContract()).toLowerCase() === d.dualPoolStaking.toLowerCase() &&
    (await staking.emissionsContract()).toLowerCase() === d.emissionsContract.toLowerCase() &&
    (await staking.liquidStakingVault()).toLowerCase() === d.liquidStakingVault.toLowerCase() &&
    (await staking.zkMerkleDistributor()).toLowerCase() === d.zkMerkleDistributor.toLowerCase() &&
    (await dist.stakingContract()).toLowerCase() === d.dualPoolStaking.toLowerCase();

  console.log(ok ? "✅ Wiring looks consistent." : "❌ Wiring mismatch detected. Investigate above.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

