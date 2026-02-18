import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const latest = await ethers.provider.getTransactionCount(signer.address, "latest");
  const pending = await ethers.provider.getTransactionCount(signer.address, "pending");
  console.log("Signer:", signer.address);
  console.log("Nonce latest:", latest);
  console.log("Nonce pending:", pending);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

