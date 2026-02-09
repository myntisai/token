import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const txHash = process.env.TX_HASH;
  if (!txHash) throw new Error("Missing TX_HASH");

  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json"), "utf8")
  );
  const stakingAddr = dep.dualPoolStaking as string;

  const tx = await ethers.provider.getTransaction(txHash);
  if (!tx) throw new Error("tx not found");

  console.log("tx.hash", txHash);
  console.log("tx.to", tx.to);
  console.log("tx.from", tx.from);
  console.log("tx.nonce", tx.nonce);
  console.log("tx.data", tx.data.slice(0, 10), "len", tx.data.length - 2);

  if (!tx.to) return;

  if (tx.to.toLowerCase() !== stakingAddr.toLowerCase()) {
    console.log("note: tx.to is not current staking contract", stakingAddr);
  }

  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr);

  try {
    const parsed = staking.interface.parseTransaction({ data: tx.data });
    console.log("decoded.fn", parsed.name);
    console.log(
      "decoded.args",
      JSON.stringify(parsed.args, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    );
  } catch (e) {
    console.log("could not decode with DualPoolStaking ABI");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
