import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

type Snapshot = {
  token: string;
  snapshotBlock: number;
  recipients: Array<{ address: string; amount: string }>;
};

type Row = {
  address: string;
  sepolia: bigint;
  mainnet: bigint;
  delta: bigint;
};

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  const snapPath =
    process.env.SNAPSHOT_FILE ||
    path.join(__dirname, "..", "migrations", "base-sepolia-holders-snapshot-37378124.json");
  if (!fs.existsSync(snapPath)) throw new Error(`Missing snapshot file: ${snapPath}`);
  const snap = JSON.parse(fs.readFileSync(snapPath, "utf8")) as Snapshot;

  const deploymentPath = path.join(__dirname, "..", "deployments", "deployment-base-mainnet-latest.json");
  if (!fs.existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const mainnetTokenAddr = dep.myntis as string;
  if (!mainnetTokenAddr || !ethers.isAddress(mainnetTokenAddr)) throw new Error("Invalid mainnet token address");

  const sepoliaTokenAddr = process.env.SEPOLIA_TOKEN_ADDRESS || snap.token;
  if (!sepoliaTokenAddr || !ethers.isAddress(sepoliaTokenAddr)) throw new Error("Invalid sepolia token address");

  const sepoliaUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const mainnetUrl = process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";

  const sepoliaProvider = new ethers.JsonRpcProvider(sepoliaUrl);
  const mainnetProvider = new ethers.JsonRpcProvider(mainnetUrl);

  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const mainnetToken = new ethers.Contract(mainnetTokenAddr, erc20Abi, mainnetProvider);
  const sepoliaToken = new ethers.Contract(sepoliaTokenAddr, erc20Abi, sepoliaProvider);
  const decimals: number = await mainnetToken.decimals();

  console.log("Mainnet token:", mainnetTokenAddr);
  console.log("Sepolia token:", sepoliaTokenAddr);
  console.log("Snapshot:", snapPath);
  console.log("Recipients:", snap.recipients.length);
  console.log("");

  const rows: Row[] = [];
  const concurrency = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 5;
  const delayMs = process.env.REQUEST_DELAY_MS ? Number(process.env.REQUEST_DELAY_MS) : 250;
  const recips = snap.recipients;

  for (let i = 0; i < recips.length; i += concurrency) {
    const batch = recips.slice(i, i + concurrency);
    const [sepBals, mainBals] = await Promise.all([
      Promise.all(batch.map((r) => sepoliaToken.balanceOf(r.address))),
      Promise.all(batch.map((r) => mainnetToken.balanceOf(r.address))),
    ]);

    for (let j = 0; j < batch.length; j++) {
      const address = batch[j].address;
      const sepolia = sepBals[j] as bigint;
      const mainnet = mainBals[j] as bigint;
      rows.push({ address, sepolia, mainnet, delta: mainnet - sepolia });
    }

    if ((i + concurrency) % (concurrency * 5) === 0 || i + concurrency >= recips.length) {
      console.log(`Checked ${Math.min(i + concurrency, recips.length)}/${recips.length}`);
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const totalSepolia = rows.reduce((acc, r) => acc + r.sepolia, 0n);
  const totalMainnet = rows.reduce((acc, r) => acc + r.mainnet, 0n);
  const totalDelta = totalMainnet - totalSepolia;

  const mismatches = rows.filter((r) => r.delta !== 0n);
  mismatches.sort((a, b) => (a.delta > b.delta ? -1 : a.delta < b.delta ? 1 : 0));

  console.log("");
  console.log("Total Sepolia (snapshot recipients):", ethers.formatUnits(totalSepolia, decimals));
  console.log("Total Mainnet (snapshot recipients):", ethers.formatUnits(totalMainnet, decimals));
  console.log("Total delta (mainnet - sepolia):", ethers.formatUnits(totalDelta, decimals));
  console.log("Mismatched recipients:", mismatches.length);

  const maxRows = process.env.MAX_ROWS ? Number(process.env.MAX_ROWS) : 20;
  if (mismatches.length > 0) {
    console.log("");
    console.log("Top mismatches:");
    for (let i = 0; i < Math.min(mismatches.length, maxRows); i++) {
      const r = mismatches[i];
      console.log(
        `${i + 1}. ${r.address} sepolia=${ethers.formatUnits(r.sepolia, decimals)} ` +
          `mainnet=${ethers.formatUnits(r.mainnet, decimals)} delta=${ethers.formatUnits(r.delta, decimals)}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
