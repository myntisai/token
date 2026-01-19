import { ethers, run } from "hardhat";

async function main() {
  const proxyAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  // EIP-1967 storage slots
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  
  console.log("\n=== Reading Proxy Storage ===\n");
  
  const implStorage = await ethers.provider.getStorage(proxyAddr, IMPL_SLOT);
  const adminStorage = await ethers.provider.getStorage(proxyAddr, ADMIN_SLOT);
  
  const implAddr = ethers.getAddress("0x" + implStorage.slice(-40));
  const adminAddr = ethers.getAddress("0x" + adminStorage.slice(-40));
  
  console.log("Proxy Address:          ", proxyAddr);
  console.log("Implementation Address: ", implAddr);
  console.log("ProxyAdmin Address:     ", adminAddr);
  
  // Step 1: Verify implementation
  console.log("\n=== Step 1: Verifying Implementation (Myntis.sol) ===\n");
  console.log(`Address: ${implAddr}`);
  
  try {
    await run("verify:verify", {
      address: implAddr,
      constructorArguments: [],
      contract: "contracts/Myntis.sol:Myntis",
    });
    console.log("✅ Implementation verified successfully!");
  } catch (e: any) {
    if (e.message.includes("Already Verified") || e.message.includes("already verified")) {
      console.log("✅ Implementation already verified!");
    } else {
      console.log("❌ Error:", e.message);
      console.log("\nManual command:");
      console.log(`npx hardhat verify --network base-sepolia ${implAddr}`);
    }
  }

  // Step 2: Also try to verify the ProxyAdmin
  console.log("\n=== Step 2: Verifying ProxyAdmin ===\n");
  console.log(`Address: ${adminAddr}`);
  
  try {
    await run("verify:verify", {
      address: adminAddr,
      constructorArguments: [],
      contract: "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin",
    });
    console.log("✅ ProxyAdmin verified!");
  } catch (e: any) {
    if (e.message.includes("Already Verified") || e.message.includes("already verified")) {
      console.log("✅ ProxyAdmin already verified!");
    } else {
      console.log("❌ ProxyAdmin verification failed (this is normal):", e.message?.slice(0, 100));
    }
  }

  console.log("\n=== Summary ===\n");
  console.log("Proxy:          ", proxyAddr);
  console.log("Implementation: ", implAddr);
  console.log("ProxyAdmin:     ", adminAddr);
  console.log("\nOnce implementation is verified, Basescan will show 'Read as Proxy' on the contract page.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
