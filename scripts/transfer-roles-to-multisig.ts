import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const MULTISIG = process.env.MULTISIG || process.env.TREASURY;

type Deployment = {
  myntis: string;
  emissionsContract: string;
  dualPoolStaking: string;
  liquidStakingVault: string;
  zkMerkleDistributor: string;
  globalSupplyRegistry: string;
};

function loadDeployment(): Deployment {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function runTx(label: string, txPromise: Promise<any>) {
  const tx = await txPromise;
  console.log(`${label} tx:`, tx.hash);
  await tx.wait();
}

async function grantRoleIfNeeded(contract: any, role: string, account: string, label: string) {
  const has = await contract.hasRole(role, account);
  if (has) {
    console.log(`skip ${label}: already granted`);
    return;
  }
  await runTx(`grant ${label}`, contract.grantRole(role, account));
}

async function removeRoleIfNeeded(contract: any, role: string, account: string, label: string, signerAddr: string) {
  const has = await contract.hasRole(role, account);
  if (!has) {
    console.log(`skip ${label}: already removed`);
    return;
  }
  const admin = await contract.getRoleAdmin(role);
  const signerHasAdmin = await contract.hasRole(admin, signerAddr);
  if (signerHasAdmin) {
    await runTx(`revoke ${label}`, contract.revokeRole(role, account));
    return;
  }
  if (account.toLowerCase() === signerAddr.toLowerCase()) {
    await runTx(`renounce ${label}`, contract.renounceRole(role, account));
    return;
  }
  throw new Error(`Cannot remove ${label}: signer lacks admin and is not the role holder.`);
}

async function main() {
  if (!MULTISIG || !ethers.isAddress(MULTISIG)) {
    throw new Error("Missing or invalid MULTISIG/TREASURY env var.");
  }

  const d = loadDeployment();
  const [signer] = await ethers.getSigners();
  const signerAddr = signer.address;

  console.log("Network:", network.name);
  console.log("Signer:", signerAddr);
  console.log("Multisig:", MULTISIG);

  const myntis = await ethers.getContractAt("Myntis", d.myntis);
  const emissions = await ethers.getContractAt("EmissionsContract", d.emissionsContract);
  const staking = await ethers.getContractAt("DualPoolStaking", d.dualPoolStaking);
  const vault = await ethers.getContractAt("LiquidStakingVault", d.liquidStakingVault);
  const dist = await ethers.getContractAt("ZKMerkleDistributor", d.zkMerkleDistributor);
  const gsr = await ethers.getContractAt("GlobalSupplyRegistry", d.globalSupplyRegistry);

  console.log("\n-- Myntis --");
  const currentOwner = await myntis.owner();
  if (currentOwner.toLowerCase() === signerAddr.toLowerCase()) {
    const minterRole = await myntis.MINTER_ROLE();
    const pauserRole = await myntis.PAUSER_ROLE();
    await runTx("grant MINTER_ROLE", myntis.grantRole(minterRole, MULTISIG));
    await runTx("grant PAUSER_ROLE", myntis.grantRole(pauserRole, MULTISIG));
    await runTx("revoke MINTER_ROLE", myntis.revokeRole(minterRole, signerAddr));
    await runTx("revoke PAUSER_ROLE", myntis.revokeRole(pauserRole, signerAddr));
    await runTx("transferOwnership", myntis.transferOwnership(MULTISIG));
  } else {
    console.log("skip Myntis: signer is not owner");
  }

  console.log("\n-- EmissionsContract --");
  const emissionsAdmin = await emissions.ADMIN_ROLE();
  await grantRoleIfNeeded(emissions, emissionsAdmin, MULTISIG, "Emissions ADMIN_ROLE");
  await removeRoleIfNeeded(emissions, emissionsAdmin, signerAddr, "Emissions ADMIN_ROLE", signerAddr);

  console.log("\n-- DualPoolStaking --");
  const stakingAdmin = await staking.DEFAULT_ADMIN_ROLE();
  const stakingUpgrader = await staking.UPGRADER_ROLE();
  await grantRoleIfNeeded(staking, stakingAdmin, MULTISIG, "Staking DEFAULT_ADMIN_ROLE");
  await grantRoleIfNeeded(staking, stakingUpgrader, MULTISIG, "Staking UPGRADER_ROLE");
  await removeRoleIfNeeded(staking, stakingUpgrader, signerAddr, "Staking UPGRADER_ROLE", signerAddr);
  await removeRoleIfNeeded(staking, stakingAdmin, signerAddr, "Staking DEFAULT_ADMIN_ROLE", signerAddr);

  console.log("\n-- LiquidStakingVault --");
  const vaultAdmin = await vault.ADMIN_ROLE();
  await grantRoleIfNeeded(vault, vaultAdmin, MULTISIG, "Vault ADMIN_ROLE");
  await removeRoleIfNeeded(vault, vaultAdmin, signerAddr, "Vault ADMIN_ROLE", signerAddr);

  console.log("\n-- ZKMerkleDistributor --");
  const distAdmin = await dist.ADMIN_ROLE();
  await grantRoleIfNeeded(dist, distAdmin, MULTISIG, "ZKDist ADMIN_ROLE");
  await removeRoleIfNeeded(dist, distAdmin, signerAddr, "ZKDist ADMIN_ROLE", signerAddr);

  console.log("\n-- GlobalSupplyRegistry --");
  const gsrAdmin = await gsr.ADMIN_ROLE();
  await grantRoleIfNeeded(gsr, gsrAdmin, MULTISIG, "GSR ADMIN_ROLE");
  await removeRoleIfNeeded(gsr, gsrAdmin, signerAddr, "GSR ADMIN_ROLE", signerAddr);
  const gsrOwner = await gsr.owner();
  if (gsrOwner.toLowerCase() === signerAddr.toLowerCase()) {
    await runTx("transferOwnership", gsr.transferOwnership(MULTISIG));
  } else {
    console.log("skip GSR transferOwnership: signer is not owner");
  }

  console.log("\n✅ Transfer complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
