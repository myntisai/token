import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const LZ_ENDPOINT_V2 = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const ARB_DEPLOYMENT = path.join(__dirname, "..", "deployments", "arbitrum-sepolia-oft-v2-spoke.json");
const ARB_EID = 40231;

function buildOptions(gasLimit: bigint, value: bigint = 0n): string {
  const type3 = "0003";
  const workerType = "01"; // Executor
  const optionType = "01"; // lzReceive
  const gasHex = gasLimit.toString(16).padStart(32, "0");
  const valueHex = value.toString(16).padStart(32, "0");
  const optionData = optionType + gasHex + valueHex;
  const length = (optionData.length / 2).toString(16).padStart(4, "0");
  return "0x" + type3 + workerType + length + optionData;
}

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const arb = JSON.parse(fs.readFileSync(ARB_DEPLOYMENT, "utf8"));

  const hubAddr = base.myntis as string;
  const spokeAddr = arb.contracts.myntisOFTSpoke as string;
  const quotaReceiver =
    process.env.QUOTA_RECEIVER || "0x691fb2D51d3178a78612Fd6E1FfFF4c184ce21C9";

  const [deployer] = await ethers.getSigners();
  console.log("=== REDEPLOY GLOBAL SUPPLY REGISTRY (BASE SEPOLIA) ===");
  console.log("Deployer:", deployer.address);
  console.log("Hub:", hubAddr);
  console.log("Spoke:", spokeAddr);
  console.log("QuotaReceiver:", quotaReceiver);

  const Registry = await ethers.getContractFactory("GlobalSupplyRegistry");
  const registry = await Registry.deploy(LZ_ENDPOINT_V2, deployer.address);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("✅ GlobalSupplyRegistry:", registryAddr);

  const myntis = await ethers.getContractAt("Myntis", hubAddr);
  console.log("Setting GlobalSupplyRegistry on Myntis...");
  const tx1 = await myntis.setGlobalSupplyRegistry(registryAddr);
  await tx1.wait();
  console.log("✅ setGlobalSupplyRegistry tx:", tx1.hash);

  console.log("Registering Myntis token on GlobalSupplyRegistry...");
  const tx2 = await registry.registerToken(hubAddr);
  await tx2.wait();
  console.log("✅ registerToken tx:", tx2.hash);

  console.log("Registering spoke + quota receiver on GlobalSupplyRegistry...");
  const tx3 = await registry.registerSpoke(ARB_EID, ethers.zeroPadValue(spokeAddr, 32));
  await tx3.wait();
  const tx4 = await registry.registerQuotaReceiver(ARB_EID, ethers.zeroPadValue(quotaReceiver, 32));
  await tx4.wait();
  console.log("✅ registerSpoke tx:", tx3.hash);
  console.log("✅ registerQuotaReceiver tx:", tx4.hash);

  const options = buildOptions(400000n);
  console.log("Setting quota update options...");
  const tx5 = await registry.setQuotaUpdateOptions(options, deployer.address);
  await tx5.wait();
  console.log("✅ setQuotaUpdateOptions tx:", tx5.hash);

  base.globalSupplyRegistry = registryAddr;
  base.timestamp = new Date().toISOString();
  fs.writeFileSync(BASE_DEPLOYMENT, JSON.stringify(base, null, 2));
  console.log("✅ Updated deployment JSON:", BASE_DEPLOYMENT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
