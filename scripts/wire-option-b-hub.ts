import { ethers } from "hardhat";

/**
 * Option B Hub Wiring Script (Base Sepolia)
 *
 * Fixes the common "everything deployed but not wired" issues:
 * - DualPoolStaking.setEmissionsContract(EMISSIONS_CONTRACT_ADDRESS)
 * - DualPoolStaking.setZkMerkleDistributor(ZK_MERKLE_DISTRIBUTOR_ADDRESS)
 * - EmissionsContract.setStakingContract(STAKING_CONTRACT_ADDRESS) (if needed)
 * - ZKMerkleDistributor.setStakingContract(STAKING_CONTRACT_ADDRESS)
 * - ZKMerkleDistributor.grantRole(PROVIDER_ROLE, PROVIDER_ADDRESS)
 *
 * Usage:
 *   STAKING_CONTRACT_ADDRESS=0x... \
 *   EMISSIONS_CONTRACT_ADDRESS=0x... \
 *   ZK_MERKLE_DISTRIBUTOR_ADDRESS=0x... \
 *   PROVIDER_ADDRESS=0x... \
 *   npx hardhat run scripts/wire-option-b-hub.ts --network base-sepolia
 *
 * Notes:
 * - Requires signer to be DEFAULT_ADMIN_ROLE on DualPoolStaking
 * - Requires signer to be ADMIN_ROLE (DEFAULT_ADMIN_ROLE) on EmissionsContract + ZKMerkleDistributor
 */
async function main() {
  const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS;
  const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS;
  const zkDistributorAddress = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS;
  const providerAddress = process.env.PROVIDER_ADDRESS; // optional; defaults to signer

  if (!stakingAddress) throw new Error("Missing STAKING_CONTRACT_ADDRESS");
  if (!emissionsAddress) throw new Error("Missing EMISSIONS_CONTRACT_ADDRESS");
  if (!zkDistributorAddress) throw new Error("Missing ZK_MERKLE_DISTRIBUTOR_ADDRESS");

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();
  const providerAddr = (providerAddress || signerAddr).trim();

  const net = await ethers.provider.getNetwork();
  console.log(`Network: ${net.name} (${net.chainId})`);
  console.log(`Signer:  ${signerAddr}`);
  console.log("");
  console.log(`DualPoolStaking:      ${stakingAddress}`);
  console.log(`EmissionsContract:    ${emissionsAddress}`);
  console.log(`ZKMerkleDistributor:  ${zkDistributorAddress}`);
  console.log(`Provider (role grant): ${providerAddr}`);
  console.log("");

  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddress, signer);
  const emissions = await ethers.getContractAt("EmissionsContract", emissionsAddress, signer);
  const zk = await ethers.getContractAt("ZKMerkleDistributor", zkDistributorAddress, signer);

  // --- DualPoolStaking wiring ---
  {
    const current = await staking.emissionsContract();
    console.log(`staking.emissionsContract(): ${current}`);
    if (current.toLowerCase() !== emissionsAddress.toLowerCase()) {
      console.log("📝 Setting staking emissions contract...");
      const tx = await staking.setEmissionsContract(emissionsAddress);
      console.log(`Tx: ${tx.hash}`);
      await tx.wait();
      console.log("✅ staking.setEmissionsContract done");
    } else {
      console.log("✅ staking emissions already correct");
    }
  }

  {
    const current = await staking.zkMerkleDistributor();
    console.log(`staking.zkMerkleDistributor(): ${current}`);
    if (current.toLowerCase() !== zkDistributorAddress.toLowerCase()) {
      console.log("📝 Setting staking zk merkle distributor...");
      const tx = await staking.setZkMerkleDistributor(zkDistributorAddress);
      console.log(`Tx: ${tx.hash}`);
      await tx.wait();
      console.log("✅ staking.setZkMerkleDistributor done");
    } else {
      console.log("✅ staking zk distributor already correct");
    }
  }

  // --- Emissions wiring ---
  {
    const current = await emissions.stakingContract();
    console.log(`emissions.stakingContract(): ${current}`);
    if (current.toLowerCase() !== stakingAddress.toLowerCase()) {
      console.log("📝 Setting emissions staking contract...");
      const tx = await emissions.setStakingContract(stakingAddress);
      console.log(`Tx: ${tx.hash}`);
      await tx.wait();
      console.log("✅ emissions.setStakingContract done");
    } else {
      console.log("✅ emissions staking already correct");
    }
  }

  // --- ZK Distributor wiring ---
  {
    const current = await zk.stakingContract();
    console.log(`zkDistributor.stakingContract(): ${current}`);
    if (current.toLowerCase() !== stakingAddress.toLowerCase()) {
      console.log("📝 Setting zk distributor staking contract...");
      const tx = await zk.setStakingContract(stakingAddress);
      console.log(`Tx: ${tx.hash}`);
      await tx.wait();
      console.log("✅ zk.setStakingContract done");
    } else {
      console.log("✅ zk distributor staking already correct");
    }
  }

  // --- Provider role on ZK distributor ---
  {
    const PROVIDER_ROLE = await zk.PROVIDER_ROLE();
    const has = await zk.hasRole(PROVIDER_ROLE, providerAddr);
    console.log(`zk.hasRole(PROVIDER_ROLE, provider): ${has}`);
    if (!has) {
      console.log("📝 Granting PROVIDER_ROLE on ZK distributor...");
      const tx = await zk.grantRole(PROVIDER_ROLE, providerAddr);
      console.log(`Tx: ${tx.hash}`);
      await tx.wait();
      console.log("✅ zk.grantRole(PROVIDER_ROLE) done");
    } else {
      console.log("✅ provider already has PROVIDER_ROLE");
    }
  }

  console.log("\n✅ Option B hub wiring complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

