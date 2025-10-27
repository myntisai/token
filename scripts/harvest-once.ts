import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const stakingAddress =
    process.env.STAKING_CONTRACT_ADDRESS ||
    "0x22cD2e45f3462d44bAb4ab2427A491c5FE70f7d4";

  console.log("Using signer:", signer.address);
  console.log("Staking contract:", stakingAddress);

  const staking = await ethers.getContractAt("StakingContract", stakingAddress);

  try {
    const tx = await staking.harvestRewards({ gasLimit: 2_000_000 });
    console.log("Submitted harvest tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Harvest succeeded in block", receipt.blockNumber);
  } catch (error: any) {
    console.error("❌ Harvest reverted:", error.shortMessage || error.message);
    if (error.error?.data) {
      console.error("Revert data:", error.error.data);
    }
    const data = staking.interface.encodeFunctionData("harvestRewards");
    try {
      const callResult = await ethers.provider.call({
        to: stakingAddress,
        from: signer.address,
        data,
      });
      console.error("Call result (should not happen):", callResult);
    } catch (callError: any) {
      console.error(
        "Static call revert data:",
        callError.error?.data || callError.data || callError.message
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
