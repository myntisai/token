import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");
const ARB_EID = 40231;

async function main() {
  const amount = process.env.BRIDGE_AMOUNT ? ethers.parseEther(process.env.BRIDGE_AMOUNT) : ethers.parseEther("100");
  const overrideOptions = process.env.EXTRA_OPTIONS;

  const base = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const hubAddr = base.myntis as string;

  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Myntis", hubAddr);

  console.log("=== BRIDGING MYNT TO ARBITRUM SEPOLIA ===");
  console.log("From:", signer.address);
  console.log("Hub:", hubAddr);
  console.log("Amount:", ethers.formatEther(amount), "MYNT");
  console.log("Balance:", ethers.formatEther(await token.balanceOf(signer.address)), "MYNT");
  console.log("Peer bytes32:", await token.peers(ARB_EID));

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

  const baseOptions = overrideOptions ?? buildOptions(400000n);
  const extraOptions = await token.combineOptions(ARB_EID, 1, baseOptions);
  console.log("Extra options (hex):", extraOptions);

  const sendParam = {
    dstEid: ARB_EID,
    to: ethers.zeroPadValue(signer.address, 32),
    amountLD: amount,
    minAmountLD: (amount * 95n) / 100n,
    extraOptions,
    composeMsg: "0x",
    oftCmd: "0x",
  };

  console.log("\nGetting quote...");
  let nativeFee: bigint;
  try {
    [nativeFee] = await token.quoteSend(sendParam, false);
    console.log("Native fee:", ethers.formatEther(nativeFee), "ETH");
  } catch (error: any) {
    console.error("quoteSend failed:", error?.shortMessage || error?.message || error);
    if (error?.data) {
      try {
        const decoded = token.interface.parseError(error.data);
        console.error("Decoded error:", decoded?.name, decoded?.args);
      } catch {
        // ignore decode errors
      }
    }
    throw error;
  }

  console.log("\nSending tokens...");
  const tx = await token.send(
    sendParam,
    { nativeFee, lzTokenFee: 0n },
    signer.address,
    { value: nativeFee }
  );
  console.log("TX:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Bridge TX confirmed in block:", receipt?.blockNumber);

  console.log("\nBalance after:", ethers.formatEther(await token.balanceOf(signer.address)), "MYNT");
  console.log("\n🌉 Tokens bridged! Check Arbitrum Sepolia in ~2 minutes.");
  console.log("LayerZero Scan: https://layerzeroscan.com/tx/" + tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
