import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

function parseHex(value: string | undefined, fallback = "0x"): string {
  if (!value) return fallback;
  if (!value.startsWith("0x")) {
    throw new Error(`Expected hex string for options/metadata, received "${value}"`);
  }
  return value;
}

async function main() {
  const [signer] = await ethers.getSigners();

  const oftAddress = process.env.MYNTIS_OFT_ADDRESS;
  const dstEidRaw = process.env.DST_EID;
  const recipient = process.env.BRIDGE_RECIPIENT ?? signer.address;
  const amountRaw = process.env.BRIDGE_AMOUNT ?? "0";
  const metadata = parseHex(process.env.BRIDGE_METADATA);
  const options = parseHex(process.env.LZ_OPTIONS);
  const refundAddress = process.env.REFUND_ADDRESS ?? signer.address;
  const payInLzToken = process.env.PAY_IN_LZ_TOKEN === "true";

  if (!oftAddress || !ethers.isAddress(oftAddress)) {
    throw new Error("Missing or invalid MYNTIS_OFT_ADDRESS");
  }
  if (!dstEidRaw) {
    throw new Error("Missing DST_EID");
  }
  const dstEid = Number(dstEidRaw);
  if (!Number.isInteger(dstEid) || dstEid <= 0) {
    throw new Error(`Invalid DST_EID "${dstEidRaw}"`);
  }

  const amount = ethers.parseEther(amountRaw);
  if (amount === 0n) {
    throw new Error("BRIDGE_AMOUNT must be greater than zero");
  }

  const oft = await ethers.getContractAt("MyntisOFT", oftAddress, signer);
  console.log("🔗 MyntisOFT bridge");
  console.log("   signer:", signer.address);
  console.log("   contract:", oftAddress);
  console.log("   dstEid:", dstEid);
  console.log("   recipient:", recipient);
  console.log("   amount:", ethers.formatEther(amount), "MYNT");

  let fee = ethers.parseEther(process.env.BRIDGE_FEE || "0");
  try {
    const quote = await oft.quoteBridge(dstEid, recipient, amount, metadata, options, payInLzToken);
    fee = quote.nativeFee;
    console.log("   estimatedFee:", ethers.formatEther(fee), "ETH");
  } catch (err) {
    if (!fee || fee === 0n) {
      fee = ethers.parseEther(process.env.FALLBACK_FEE || "0.005");
    }
    console.log("   quote unavailable, using fallback fee:", ethers.formatEther(fee), "ETH");
  }

  const tx = await oft.bridge(
    dstEid,
    recipient,
    amount,
    metadata,
    options,
    refundAddress,
    payInLzToken,
    { value: fee }
  );

  console.log("⏳ Bridge tx submitted:", tx.hash);
  const receipt = await tx.wait();
  console.log(`✅ Bridge confirmed in block ${receipt?.blockNumber ?? "unknown"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
