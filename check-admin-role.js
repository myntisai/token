const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Checking from account:", signer.address);
  
  const stakingAddress = "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6";
  const staking = await ethers.getContractAt("StakingContract", stakingAddress);
  
  const ADMIN_ROLE = await staking.ADMIN_ROLE();
  console.log("ADMIN_ROLE hash:", ADMIN_ROLE);
  
  const hasRole = await staking.hasRole(ADMIN_ROLE, signer.address);
  console.log("Does", signer.address, "have ADMIN_ROLE?", hasRole);
  
  // Try to call the function directly
  try {
    console.log("\nAttempting to update emissions contract to test proxy...");
    const newEmissionsAddress = "0x72846079AcBf42ae7E7c3E51EdDF87AA0D11BAAF";
    const tx = await staking.setEmissionContract(newEmissionsAddress);
    console.log("Success! Transaction:", tx.hash);
    await tx.wait();
    console.log("Transaction confirmed!");
  } catch (error) {
    console.log("Failed:", error.message);
    console.log("\nYou need to grant ADMIN_ROLE to:", signer.address);
  }
}

main().catch(console.error);
