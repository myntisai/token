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
  deployer?: string;
};

function loadDeployment(): Deployment {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
  if (!MULTISIG || !ethers.isAddress(MULTISIG)) {
    throw new Error("Missing or invalid MULTISIG/TREASURY env var.");
  }
  const d = loadDeployment();
  const [signer] = await ethers.getSigners();
  const deployer = (d.deployer || signer.address).toLowerCase();

  const myntis = await ethers.getContractAt("Myntis", d.myntis);
  const emissions = await ethers.getContractAt("EmissionsContract", d.emissionsContract);
  const staking = await ethers.getContractAt("DualPoolStaking", d.dualPoolStaking);
  const vault = await ethers.getContractAt("LiquidStakingVault", d.liquidStakingVault);
  const dist = await ethers.getContractAt("ZKMerkleDistributor", d.zkMerkleDistributor);
  const gsr = await ethers.getContractAt("GlobalSupplyRegistry", d.globalSupplyRegistry);

  console.log("Network:", network.name);
  console.log("Deployer:", deployer);
  console.log("Multisig:", MULTISIG);

  console.log("\n-- Myntis --");
  console.log("owner:", await myntis.owner());
  const minter = await myntis.MINTER_ROLE();
  const pauser = await myntis.PAUSER_ROLE();
  console.log("deployer MINTER_ROLE:", await myntis.hasRole(minter, deployer));
  console.log("deployer PAUSER_ROLE:", await myntis.hasRole(pauser, deployer));
  console.log("multisig MINTER_ROLE:", await myntis.hasRole(minter, MULTISIG));
  console.log("multisig PAUSER_ROLE:", await myntis.hasRole(pauser, MULTISIG));

  console.log("\n-- EmissionsContract --");
  const eAdmin = await emissions.ADMIN_ROLE();
  console.log("deployer ADMIN_ROLE:", await emissions.hasRole(eAdmin, deployer));
  console.log("multisig ADMIN_ROLE:", await emissions.hasRole(eAdmin, MULTISIG));

  console.log("\n-- DualPoolStaking --");
  const sAdmin = await staking.DEFAULT_ADMIN_ROLE();
  const sUpgrader = await staking.UPGRADER_ROLE();
  console.log("deployer DEFAULT_ADMIN_ROLE:", await staking.hasRole(sAdmin, deployer));
  console.log("deployer UPGRADER_ROLE:", await staking.hasRole(sUpgrader, deployer));
  console.log("multisig DEFAULT_ADMIN_ROLE:", await staking.hasRole(sAdmin, MULTISIG));
  console.log("multisig UPGRADER_ROLE:", await staking.hasRole(sUpgrader, MULTISIG));

  console.log("\n-- LiquidStakingVault --");
  const vAdmin = await vault.ADMIN_ROLE();
  console.log("deployer ADMIN_ROLE:", await vault.hasRole(vAdmin, deployer));
  console.log("multisig ADMIN_ROLE:", await vault.hasRole(vAdmin, MULTISIG));

  console.log("\n-- ZKMerkleDistributor --");
  const dAdmin = await dist.ADMIN_ROLE();
  console.log("deployer ADMIN_ROLE:", await dist.hasRole(dAdmin, deployer));
  console.log("multisig ADMIN_ROLE:", await dist.hasRole(dAdmin, MULTISIG));

  console.log("\n-- GlobalSupplyRegistry --");
  console.log("owner:", await gsr.owner());
  const gAdmin = await gsr.ADMIN_ROLE();
  console.log("deployer ADMIN_ROLE:", await gsr.hasRole(gAdmin, deployer));
  console.log("multisig ADMIN_ROLE:", await gsr.hasRole(gAdmin, MULTISIG));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
