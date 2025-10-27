import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.MYNTIS_OFT_ADDRESS;
  const recipient = process.env.MINT_RECIPIENT;
  const amountRaw = process.env.MINT_AMOUNT;

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error("Missing or invalid MYNTIS_OFT_ADDRESS");
  }
  if (!recipient || !ethers.isAddress(recipient)) {
    throw new Error("Missing or invalid MINT_RECIPIENT");
  }
  if (!amountRaw) {
    throw new Error("Missing MINT_AMOUNT");
  }

  const amount = ethers.parseEther(amountRaw);
  const token = await ethers.getContractAt("MyntisOFT", tokenAddress);
  const tx = await token.mint(recipient, amount);
  console.log(`Mint tx: ${tx.hash}`);
  await tx.wait();
  console.log("Minted", amountRaw, "MYNT to", recipient);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
