import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Deployment = {
  myntis: string;
};

function loadDeployment(): Deployment {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
  const d = loadDeployment();
  const [signer] = await ethers.getSigners();
  const myntis = await ethers.getContractAt("Myntis", d.myntis);

  const owner = await myntis.owner();
  const migrationComplete = await myntis.migrationComplete();

  console.log("Network:", network.name);
  console.log("Signer:", signer.address);
  console.log("Myntis:", d.myntis);
  console.log("Owner:", owner);
  console.log("MigrationComplete:", migrationComplete);

  if (migrationComplete) {
    console.log("Migration already complete. No action needed.");
    return;
  }

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    const data = myntis.interface.encodeFunctionData("completeMigration");
    console.log("\nSigner is not owner. Submit this via multisig:");
    console.log("to:", d.myntis);
    console.log("value:", "0");
    console.log("data:", data);
    return;
  }

  const tx = await myntis.completeMigration();
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("MigrationComplete:", await myntis.migrationComplete());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
