import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const ARB_SEPOLIA_EID = 40231;

function buildOptions(gas: bigint, value: bigint = 0n): string {
  const type3 = "0003";
  const workerType = "01"; // Executor
  const optionType = "01"; // lzReceive
  const gasHex = gas.toString(16).padStart(32, "0");
  const valueHex = value.toString(16).padStart(32, "0");
  const optionData = optionType + gasHex + valueHex;
  const length = (optionData.length / 2).toString(16).padStart(4, "0");
  return "0x" + type3 + workerType + length + optionData;
}

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const hubAddr = base.myntis as string;
  const hub = await ethers.getContractAt("Myntis", hubAddr);
  const options = buildOptions(400000n);

  const enforcedParams = [
    {
      eid: ARB_SEPOLIA_EID,
      msgType: 1,
      options,
    },
  ];

  console.log("Setting enforced options for Arbitrum Sepolia...");
  console.log("Hub:", hubAddr);
  console.log("Options:", options);
  const tx = await hub.setEnforcedOptions(enforcedParams);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✅ Enforced options set.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
