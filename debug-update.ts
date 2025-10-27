import { ethers } from "hardhat";

async function main() {
  const stakingAddress = "0x4660368b25e05Fd6e322cE2776ea18FCA65231D6";
  const newEmissionsAddress = "0x72846079AcBf42ae7E7c3E51EdDF87AA0D11BAAF";
  
  const staking = await ethers.getContractAt("StakingContract", stakingAddress);
  
  console.log("Current emissions contract:", await staking.emissionContract());
  console.log("Trying to update to:", newEmissionsAddress);
  
  try {
    // Try with more gas
    const tx = await staking.setEmissionContract(newEmissionsAddress, {
      gasLimit: 500000
    });
    console.log("✅ Success! Tx:", tx.hash);
    await tx.wait();
    console.log("✅ Confirmed!");
  } catch (error: any) {
    console.log("❌ Failed");
    console.log("Error:", error.message);
    if (error.data) {
      console.log("Error data:", error.data);
    }
  }
}

main().catch(console.error);
