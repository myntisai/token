import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(__dirname, "..", "deployments", "deployment-base-sepolia-latest.json");

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const myntisAddr = deployment.myntis as string;
  const stakingAddr = deployment.dualPoolStaking as string;
  const vaultAddr = deployment.liquidStakingVault as string;

  const providerStake = process.env.PROVIDER_STAKE ? ethers.parseEther(process.env.PROVIDER_STAKE) : ethers.parseEther("1000");
  const userStake = process.env.USER_STAKE ? ethers.parseEther(process.env.USER_STAKE) : ethers.parseEther("200");
  const mintAmount = process.env.MINT_AMOUNT ? ethers.parseEther(process.env.MINT_AMOUNT) : ethers.parseEther("1500");

  const [rawSigner] = await ethers.getSigners();
  const signer = new ethers.NonceManager(rawSigner);
  const signerAddress = await rawSigner.getAddress();
  const token = await ethers.getContractAt("Myntis", myntisAddr, signer);
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddr, signer);
  const vault = await ethers.getContractAt("LiquidStakingVault", vaultAddr, signer);

  console.log("Minting and staking...\n");
  console.log("Signer:", signerAddress);
  console.log("Token:", myntisAddr);
  console.log("Staking:", stakingAddr);
  console.log("Vault:", vaultAddr);
  console.log("Mint amount:", ethers.formatEther(mintAmount));
  console.log("Provider stake:", ethers.formatEther(providerStake));
  console.log("User stake:", ethers.formatEther(userStake));

  if (mintAmount > 0n) {
    const mintTx = await token.mintImmediate(signerAddress, mintAmount);
    console.log("Mint tx:", mintTx.hash);
    await mintTx.wait();
  } else {
    console.log("Skipping mint (MINT_AMOUNT=0)");
  }

  if (providerStake > 0n) {
    const approveStaking = await token.approve(stakingAddr, providerStake);
    console.log("Approve staking tx:", approveStaking.hash);
    await approveStaking.wait();

    const stakeTx = await staking.stakeToProviderPool(providerStake);
    console.log("Provider stake tx:", stakeTx.hash);
    await stakeTx.wait();
  } else {
    console.log("Skipping provider stake (PROVIDER_STAKE=0)");
  }

  if (userStake > 0n) {
    const approveVault = await token.approve(vaultAddr, userStake);
    console.log("Approve vault tx:", approveVault.hash);
    await approveVault.wait();

    const depositTx = await vault.deposit(userStake, signerAddress);
    console.log("User deposit tx:", depositTx.hash);
    await depositTx.wait();
  } else {
    console.log("Skipping user stake (USER_STAKE=0)");
  }

  console.log("✅ Staking complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
