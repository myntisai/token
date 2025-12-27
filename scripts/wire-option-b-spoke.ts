import { ethers } from "hardhat";

/**
 * Option B Spoke Wiring Script (Ethereum Sepolia)
 *
 * Ensures the provider wallet can submit merkle roots on the SpokeDistributor.
 *
 * Usage:
 *   ETH_SEPOLIA_SPOKE_DISTRIBUTOR=0x... \
 *   PROVIDER_ADDRESS=0x... \
 *   npx hardhat run scripts/wire-option-b-spoke.ts --network ethereum-sepolia
 *
 * Notes:
 * - Requires signer to have ADMIN_ROLE (DEFAULT_ADMIN_ROLE) on SpokeDistributor.
 */
async function main() {
  const spokeDistributorAddress = process.env.ETH_SEPOLIA_SPOKE_DISTRIBUTOR;
  const providerAddress = process.env.PROVIDER_ADDRESS; // optional; defaults signer

  if (!spokeDistributorAddress) throw new Error("Missing ETH_SEPOLIA_SPOKE_DISTRIBUTOR");

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  const providerAddr = (providerAddress || signerAddr).trim();

  const net = await ethers.provider.getNetwork();
  console.log(`Network: ${net.name} (${net.chainId})`);
  console.log(`Signer:  ${signerAddr}`);
  console.log(`SpokeDistributor: ${spokeDistributorAddress}`);
  console.log(`Provider (role grant): ${providerAddr}`);
  console.log("");

  const dist = await ethers.getContractAt("SpokeDistributor", spokeDistributorAddress, signer);

  const ADMIN_ROLE = await dist.ADMIN_ROLE();
  const PROVIDER_ROLE = await dist.PROVIDER_ROLE();

  const signerIsAdmin = await dist.hasRole(ADMIN_ROLE, signerAddr);
  console.log(`dist.hasRole(ADMIN_ROLE, signer): ${signerIsAdmin}`);
  if (!signerIsAdmin) {
    throw new Error("Signer is not ADMIN_ROLE on SpokeDistributor; cannot grant roles.");
  }

  const hasProvider = await dist.hasRole(PROVIDER_ROLE, providerAddr);
  console.log(`dist.hasRole(PROVIDER_ROLE, provider): ${hasProvider}`);
  if (hasProvider) {
    console.log("✅ Provider already has PROVIDER_ROLE");
    return;
  }

  console.log("📝 Granting PROVIDER_ROLE on SpokeDistributor...");
  const tx = await dist.grantRole(PROVIDER_ROLE, providerAddr);
  console.log(`Tx: ${tx.hash}`);
  await tx.wait();

  const nowHas = await dist.hasRole(PROVIDER_ROLE, providerAddr);
  if (!nowHas) throw new Error("Grant mined, but provider still missing PROVIDER_ROLE (RPC stale/wrong chain?)");

  console.log("✅ Granted PROVIDER_ROLE on SpokeDistributor");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

