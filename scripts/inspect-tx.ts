import { ethers } from "hardhat";

async function main() {
  const hash = process.env.TX_HASH;
  if (!hash) throw new Error("Missing TX_HASH");
  const tx = await ethers.provider.getTransaction(hash);
  const receipt = await ethers.provider.getTransactionReceipt(hash);
  console.log("tx.to:", tx?.to);
  console.log("tx.from:", tx?.from);
  console.log("tx.nonce:", tx?.nonce);
  console.log("tx.data:", tx?.data?.slice(0, 10), "(len", (tx?.data?.length || 0) - 2, ")");
  try {
    const spoke = await ethers.getContractAt("MyntisOFTSpoke", tx?.to || ethers.ZeroAddress);
    const parsed = spoke.interface.parseTransaction({ data: tx?.data || "0x" });
    console.log("decoded.fn:", parsed?.name);
    console.log(
      "decoded.args:",
      parsed?.args ? JSON.stringify(parsed.args, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : "n/a"
    );
  } catch {
    // ignore decode failures
  }
  console.log("receipt.status:", receipt?.status);
  console.log("receipt.blockNumber:", receipt?.blockNumber);
  console.log("receipt.logs:", receipt?.logs?.length);
  if (receipt?.logs?.length) {
    for (let i = 0; i < receipt.logs.length; i++) {
      const l = receipt.logs[i];
      console.log(`log[${i}].address:`, l.address);
      console.log(`log[${i}].topics[0]:`, l.topics?.[0]);
      try {
        const spoke = await ethers.getContractAt("MyntisOFTSpoke", l.address);
        const parsed = spoke.interface.parseLog({ topics: l.topics, data: l.data });
        console.log(`log[${i}].decoded:`, parsed.name);
      } catch {
        // ignore parse failures
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
