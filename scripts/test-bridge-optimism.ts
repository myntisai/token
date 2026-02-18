import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const token = await ethers.getContractAt(
    "Myntis",
    "0x599016bF00eE23d531223c6285C92aa0cAC278EF"
  );

  const OPT_SEPOLIA_EID = 40232;
  const amountToSend = ethers.parseEther("100");

  console.log("=== BRIDGING 100 MYNT TO OPTIMISM SEPOLIA ===");
  console.log("From:", signer.address);
  console.log("Amount:", ethers.formatEther(amountToSend), "MYNT");
  console.log("Balance:", ethers.formatEther(await token.balanceOf(signer.address)), "MYNT");

  const peer = await token.peers(OPT_SEPOLIA_EID);
  console.log("Peer bytes32:", peer);

  function buildOptions(gasLimit: number): string {
    const gasHex = gasLimit.toString(16).padStart(64, "0");
    const valueHex = "0".repeat(64);
    return "0x000301" + gasHex + valueHex;
  }

  const overrideOptions = process.env.EXTRA_OPTIONS;
  const baseOptions = overrideOptions ?? buildOptions(200000);
  const extraOptions = await token.combineOptions(OPT_SEPOLIA_EID, 1, baseOptions);
  console.log("\nExtra options (hex):", extraOptions);

  const sendParam = {
    dstEid: OPT_SEPOLIA_EID,
    to: ethers.zeroPadValue(signer.address, 32),
    amountLD: amountToSend,
    minAmountLD: (amountToSend * 95n) / 100n,
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
  console.log("\n🌉 Tokens bridged! Check Optimism Sepolia.");
  console.log("   LayerZero Scan: https://layerzeroscan.com/tx/" + tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
