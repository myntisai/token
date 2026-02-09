import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json"), "utf8"));
  const tokenAddr = dep.myntis as string;
  const stakingAddr = dep.dualPoolStaking as string;

  const lookback = process.env.LOOKBACK ? Number(process.env.LOOKBACK) : 50000;
  const toBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(0, toBlock - lookback);

  const topic = ethers.id("Transfer(address,address,uint256)");
  const stakingTopic = ethers.zeroPadValue(stakingAddr, 32);

  const logsIn = await ethers.provider.getLogs({
    address: tokenAddr,
    fromBlock,
    toBlock,
    topics: [topic, null, stakingTopic],
  });

  const logsOut = await ethers.provider.getLogs({
    address: tokenAddr,
    fromBlock,
    toBlock,
    topics: [topic, stakingTopic, null],
  });

  const iface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

  let totalIn = 0n;
  let totalOut = 0n;

  console.log("token", tokenAddr);
  console.log("staking", stakingAddr);
  console.log("range", fromBlock, "->", toBlock);
  console.log("inCount", logsIn.length);
  console.log("outCount", logsOut.length);

  for (const l of logsIn) {
    const p = iface.parseLog(l);
    totalIn += p.args.value as bigint;
  }
  for (const l of logsOut) {
    const p = iface.parseLog(l);
    totalOut += p.args.value as bigint;
  }

  const token = await ethers.getContractAt("IERC20", tokenAddr);
  const decimals = await (await ethers.getContractAt("Myntis", tokenAddr)).decimals();
  console.log("totalIn", ethers.formatUnits(totalIn, decimals));
  console.log("totalOut", ethers.formatUnits(totalOut, decimals));

  // Print last few outs for debugging.
  const last = logsOut.slice(-10);
  console.log("\nlastOut:");
  for (const l of last) {
    const p = iface.parseLog(l);
    console.log(
      `block=${l.blockNumber} to=${p.args.to} value=${ethers.formatUnits(p.args.value as bigint, decimals)} tx=${l.transactionHash}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
