import pkg from "hardhat";

// Decode GlobalSupplyRegistry logs for a given tx hash.
// Usage:
// TX_HASH=0x... npx hardhat run scripts/decode-gsr-tx.ts --network base-sepolia
async function main() {
  const { ethers } = pkg as unknown as typeof import("hardhat");

  const hash = process.env.TX_HASH;
  if (!hash) throw new Error("Missing TX_HASH");

  const receipt = await ethers.provider.getTransactionReceipt(hash);
  if (!receipt) throw new Error("No receipt");

  // We expect at least one GSR log, but we can decode any log that matches the ABI.
  const gsrIface = (await ethers.getContractFactory("GlobalSupplyRegistry")).interface;

  console.log("txHash:", hash);
  console.log("blockNumber:", receipt.blockNumber);
  console.log("status:", receipt.status);
  console.log("logs:", receipt.logs.length);

  let decodedCount = 0;
  const decodedNames: Record<string, number> = {};
  for (let i = 0; i < receipt.logs.length; i++) {
    const l = receipt.logs[i];
    try {
      const parsed = gsrIface.parseLog({ topics: l.topics, data: l.data });
      decodedCount += 1;
      decodedNames[parsed.name] = (decodedNames[parsed.name] || 0) + 1;
      try {
        console.log(
          JSON.stringify(
            {
              i,
              address: l.address,
              name: parsed.name,
              args: Object.fromEntries(
                parsed.fragment.inputs.map((inp, idx) => {
                  const v = (parsed.args as any)[idx];
                  return [inp.name || String(idx), typeof v === "bigint" ? v.toString() : v];
                })
              ),
            },
            null,
            2
          )
        );
      } catch (fmtErr) {
        console.log(
          JSON.stringify(
            {
              i,
              address: l.address,
              name: parsed.name,
              note: "failed to format args",
              topic0: l.topics?.[0],
            },
            null,
            2
          )
        );
      }
    } catch {
      // not a GSR event
    }
  }

  console.log("decodedCount:", decodedCount);
  console.log("decodedNames:", decodedNames);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
