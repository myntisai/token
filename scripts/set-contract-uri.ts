import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const tokenAddr = deployment.myntis as string;
  if (!tokenAddr || !ethers.isAddress(tokenAddr)) {
    throw new Error(`Invalid myntis address in ${deploymentPath}`);
  }

  // If not provided, default to the already-pinned metadata JSON hash used in testnet history.
  const contractURI =
    process.env.CONTRACT_URI ||
    "ipfs://QmeCRTQUR4Dx1QymvcKymLEPmNyLWJ1oJ9UocpawJvDbkP";

  const [rawSigner] = await ethers.getSigners();
  // Avoid nonce clashes when running multiple scripts back-to-back.
  const signer = new ethers.NonceManager(rawSigner);
  console.log("Network:", network.name);
  console.log("Signer:", await rawSigner.getAddress());
  console.log("Token:", tokenAddr);
  console.log("Setting contractURI to:", contractURI);

  const token = await ethers.getContractAt("Myntis", tokenAddr, signer);
  const before = await token.contractURI();
  console.log("Before:", before);

  const tx = await token.setContractURI(contractURI);
  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Status:", receipt?.status);

  const after = await token.contractURI();
  console.log("After:", after);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
