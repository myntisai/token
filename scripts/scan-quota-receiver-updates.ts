import pkg from "hardhat";

// Usage:
// SPOKE_TOKEN=0x... FROM_BLOCK=0 npx hardhat run scripts/scan-quota-receiver-updates.ts --network arbitrum-sepolia
async function main() {
  const { ethers } = pkg as unknown as typeof import("hardhat");

  const spokeTokenAddr = process.env.SPOKE_TOKEN;
  if (!spokeTokenAddr || !ethers.isAddress(spokeTokenAddr)) {
    throw new Error("Missing/invalid SPOKE_TOKEN");
  }

  const fromBlock = process.env.FROM_BLOCK ? Number(process.env.FROM_BLOCK) : 0;
  const toBlock = process.env.TO_BLOCK ? Number(process.env.TO_BLOCK) : "latest";

  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeTokenAddr);

  // event QuotaReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
  // Some RPCs + ABIs can be finicky with typed filters, so also support a raw topic scan.
  const topic0 = ethers.id("QuotaReceiverUpdated(address,address)");
  const raw = await ethers.provider.getLogs({
    address: spokeTokenAddr,
    fromBlock,
    toBlock: toBlock as any,
    topics: [topic0],
  });
  const logs = raw.map((l) => spoke.interface.parseLog({ topics: l.topics, data: l.data }) as any);

  console.log("Spoke:", spokeTokenAddr);
  console.log("fromBlock:", fromBlock, "toBlock:", toBlock);
  console.log("events:", logs.length);

  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    const parsed = logs[i];
    const args = parsed.args as unknown as { oldReceiver: string; newReceiver: string };
    console.log(
      JSON.stringify(
        {
          blockNumber: l.blockNumber,
          txHash: l.transactionHash,
          oldReceiver: args.oldReceiver,
          newReceiver: args.newReceiver,
        },
        null,
        2
      )
    );
  }

  const current = await spoke.quotaReceiver();
  console.log("current.quotaReceiver:", current);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
