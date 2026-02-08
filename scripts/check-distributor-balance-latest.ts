import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const tokenAddr = deployment.myntis as string;
  const distributorAddr = deployment.zkMerkleDistributor as string;

  const [signer] = await ethers.getSigners();
  const distributor = await ethers.getContractAt("ZKMerkleDistributor", distributorAddr);
  const token = await ethers.getContractAt("Myntis", tokenAddr);

  const providerBalPublic = await distributor.providerBalance(signer.address);
  const providerBalView = await distributor.getProviderBalance(signer.address);
  const tokenBal = await token.balanceOf(distributorAddr);

  console.log("Distributor:", distributorAddr);
  console.log("Provider:", signer.address);
  console.log("providerBalance (public):", ethers.formatEther(providerBalPublic), "MYNT");
  console.log("getProviderBalance:", ethers.formatEther(providerBalView), "MYNT");
  console.log("Distributor token balance:", ethers.formatEther(tokenBal), "MYNT");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
