import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();

  const spoke = await ethers.getContractAt(
    "MyntisOFTSpoke",
    "0x9bC5fC24778A967f4d42C0789F161a347867A778"
  );

  const BASE_EID = 40245;
  const amountToSend = ethers.parseEther("100");

  console.log("=== BRIDGING 100 MYNT BACK TO BASE SEPOLIA ===");
  console.log("From:", signer.address);
  console.log("Amount:", ethers.formatEther(amountToSend), "MYNT");
  console.log("Balance:", ethers.formatEther(await spoke.balanceOf(signer.address)), "MYNT");

  const peer = await spoke.peers(BASE_EID);
  console.log("Peer bytes32:", peer);

  function buildOptions(gasLimit: number): string {
    const gasHex = gasLimit.toString(16).padStart(64, "0");
    const valueHex = "0".repeat(64);
    return "0x000301" + gasHex + valueHex;
  }

  const extraOptions = await spoke.combineOptions(BASE_EID, 1, buildOptions(200000));
  console.log("\nExtra options (hex):", extraOptions);

  const sendParam = {
    dstEid: BASE_EID,
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
    [nativeFee] = await spoke.quoteSend(sendParam, false);
    console.log("Native fee:", ethers.formatEther(nativeFee), "ETH");
  } catch (error: any) {
    console.error("quoteSend failed:", error?.shortMessage || error?.message || error);
    if (error?.data) {
      try {
        const decoded = spoke.interface.parseError(error.data);
        console.error("Decoded error:", decoded?.name, decoded?.args);
      } catch {
        // ignore decode errors
      }
    }
    throw error;
  }

  console.log("\nSending tokens...");
  const tx = await spoke.send(
    sendParam,
    { nativeFee, lzTokenFee: 0n },
    signer.address,
    { value: nativeFee }
  );
  console.log("TX:", tx.hash);

  const receipt = await tx.wait();
  console.log("✅ Bridge TX confirmed in block:", receipt?.blockNumber);

  console.log("\nBalance after:", ethers.formatEther(await spoke.balanceOf(signer.address)), "MYNT");
  console.log("\n🌉 Tokens bridged back! Check Base Sepolia.");
  console.log("   LayerZero Scan: https://layerzeroscan.com/tx/" + tx.hash);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
