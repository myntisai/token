import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));
  const spokeAddr = deployment.contracts.myntisOFTSpoke as string;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddr);

  const options: string = await spoke.supplyUpdateOptions();
  const refund: string = await spoke.supplyUpdateRefundAddress();

  const useOptions = options && options !== "0x" ? options : "0x0003";
  const refundAddress = refund !== ethers.ZeroAddress ? refund : signer.address;

  console.log("=== REPORT SPOKE SUPPLY UPDATE ===");
  console.log("Spoke:", spokeAddr);
  console.log("Signer:", signer.address);
  console.log("Options:", useOptions);
  console.log("Refund:", refundAddress);

  const tx = await spoke.reportSupplyUpdate(useOptions, refundAddress, {
    value: ethers.parseEther("0.005"),
  });
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ reportSupplyUpdate confirmed in block:", receipt?.blockNumber);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
