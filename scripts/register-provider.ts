import { ethers } from "hardhat";

async function main() {
  const tokenAddress = process.env.MYNTIS_OFT_ADDRESS;
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS;
  const amountRaw = process.env.STAKE_AMOUNT;

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error("Missing or invalid MYNTIS_OFT_ADDRESS");
  }
  if (!stakingAddress || !ethers.isAddress(stakingAddress)) {
    throw new Error("Missing or invalid STAKING_CONTRACT_ADDRESS");
  }
  if (!amountRaw) {
    throw new Error("Missing STAKE_AMOUNT");
  }

  const amount = ethers.parseEther(amountRaw);
  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Myntis", tokenAddress, signer);
  const staking = await ethers.getContractAt("StakingContract", stakingAddress, signer);

  const allowance = await token.allowance(signer.address, stakingAddress);
  if (allowance < amount) {
    const approveTx = await token.approve(stakingAddress, amount);
    console.log(`Approve tx: ${approveTx.hash}`);
    await approveTx.wait();
  }

  const tx = await staking.registerProvider(amount);
  console.log(`Register tx: ${tx.hash}`);
  await tx.wait();
  console.log("Provider registered with stake", amountRaw);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
