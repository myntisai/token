import { ethers } from "hardhat";

/**
 * Stake provider MYNT into DualPoolStaking (mainnet-safe).
 *
 * Usage:
 *   STAKE_AMOUNT=5000 npx hardhat run scripts/stake-provider.ts --network base-mainnet
 *
 * Requires:
 *   MYNTIS_TOKEN_ADDRESS (or MYNTIS_OFT_ADDRESS)
 *   STAKING_CONTRACT_ADDRESS (or DUAL_POOL_STAKING_ADDRESS)
 */

async function main() {
  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || process.env.MYNTIS_OFT_ADDRESS;
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS || process.env.DUAL_POOL_STAKING_ADDRESS;
  const amountRaw = process.env.STAKE_AMOUNT || process.env.PROVIDER_STAKE;

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error("Missing or invalid MYNTIS_TOKEN_ADDRESS (or MYNTIS_OFT_ADDRESS)");
  }
  if (!stakingAddress || !ethers.isAddress(stakingAddress)) {
    throw new Error("Missing or invalid STAKING_CONTRACT_ADDRESS (or DUAL_POOL_STAKING_ADDRESS)");
  }
  if (!amountRaw) {
    throw new Error("Missing STAKE_AMOUNT (or PROVIDER_STAKE)");
  }

  const amount = ethers.parseEther(amountRaw);
  if (amount <= 0n) {
    throw new Error("STAKE_AMOUNT must be > 0");
  }

  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("Myntis", tokenAddress, signer);
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddress, signer);

  console.log("================================================================================");
  console.log("PROVIDER STAKE");
  console.log("================================================================================\n");
  console.log(`Provider: ${signer.address}`);
  console.log(`Token:    ${tokenAddress}`);
  console.log(`Staking:  ${stakingAddress}`);
  console.log(`Amount:   ${amountRaw} MYNT\n`);

  const ethBalance = await ethers.provider.getBalance(signer.address);
  const myntBalance = await token.balanceOf(signer.address);
  console.log(`ETH balance:  ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`MYNT balance: ${ethers.formatEther(myntBalance)} MYNT`);

  if (myntBalance < amount) {
    throw new Error(`Insufficient MYNT balance. Need ${amountRaw} MYNT, have ${ethers.formatEther(myntBalance)}.`);
  }

  const providerInfo = await staking.getProviderInfo(signer.address);
  console.log(`Current provider stake: ${ethers.formatEther(providerInfo[0])} MYNT\n`);

  const allowance = await token.allowance(signer.address, stakingAddress);
  if (allowance < amount) {
    console.log("Approving staking contract...");
    const approveTx = await token.approve(stakingAddress, amount);
    console.log(`Approve tx: ${approveTx.hash}`);
    await approveTx.wait(1);
  } else {
    console.log("Allowance sufficient, skipping approve.");
  }

  console.log("Staking to provider pool...");
  const stakeTx = await staking.stakeToProviderPool(amount);
  console.log(`Stake tx: ${stakeTx.hash}`);
  await stakeTx.wait(1);

  const updatedInfo = await staking.getProviderInfo(signer.address);
  console.log(`New provider stake: ${ethers.formatEther(updatedInfo[0])} MYNT`);
  console.log("\n✅ Provider stake complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
