import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Checking from account:", signer.address);
  
  const stakingAddress = "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6";
  const staking = await ethers.getContractAt("StakingContract", stakingAddress);
  
  const ADMIN_ROLE = await staking.ADMIN_ROLE();
  console.log("ADMIN_ROLE hash:", ADMIN_ROLE);
  
  const hasRole = await staking.hasRole(ADMIN_ROLE, signer.address);
  console.log("Does", signer.address, "have ADMIN_ROLE?", hasRole);
  
  if (hasRole) {
    console.log("\n✅ You have admin access! Updating emissions contract...");
    const newEmissionsAddress = "0x72846079AcBf42ae7E7c3E51EdDF87AA0D11BAAF";
    const tx = await staking.setEmissionContract(newEmissionsAddress);
    console.log("Transaction:", tx.hash);
    await tx.wait();
    console.log("✅ Update complete!");
  } else {
    console.log("\n❌ You don't have ADMIN_ROLE");
    console.log("Contact the admin to grant role or update manually");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
