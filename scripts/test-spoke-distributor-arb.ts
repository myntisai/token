import { ethers } from "hardhat";

const SPOKE_DISTRIBUTOR = "0xc2c0653213623cb274f6675cB9f12cC384E338a7"; // legacy from history

async function main() {
  const [signer] = await ethers.getSigners();
  const distributor = await ethers.getContractAt("SpokeDistributor", SPOKE_DISTRIBUTOR);

  console.log("=== SPOKE DISTRIBUTOR TEST (ARB SEPOLIA) ===");
  console.log("Distributor:", SPOKE_DISTRIBUTOR);
  console.log("Signer:", signer.address);

  const before = await distributor.getProviderBalance(signer.address);
  console.log("ProviderBalance before:", before.toString());

  const amount = ethers.parseEther("1");
  const tx = await distributor.addProviderBalance(signer.address, amount);
  console.log("addProviderBalance tx:", tx.hash);
  await tx.wait();

  const after = await distributor.getProviderBalance(signer.address);
  console.log("ProviderBalance after:", after.toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
