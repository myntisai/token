import { ethers } from "hardhat";

// Prints endpoint() for any OApp-style contract that exposes endpoint() getter.
// Usage:
// APP=0x... npx hardhat run scripts/print-endpoint.ts --network arbitrum-sepolia
async function main() {
  const app = process.env.APP;
  if (!app || !ethers.isAddress(app)) throw new Error("Missing/invalid APP");

  const c = new ethers.Contract(
    app,
    ["function endpoint() view returns (address)", "function owner() view returns (address)"],
    await ethers.provider.getSigner()
  );

  const endpoint = await c.endpoint();
  console.log("app:", app);
  console.log("endpoint:", endpoint);
  try {
    console.log("owner:", await c.owner());
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

