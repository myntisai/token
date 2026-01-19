import { ethers } from "hardhat";

async function main() {
  const proxyAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  console.log("🔍 Getting implementation address for proxy verification...\n");
  
  // EIP-1967 implementation slot
  const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  
  const storage = await ethers.provider.getStorage(proxyAddr, IMPLEMENTATION_SLOT);
  
  if (storage === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.error("❌ No implementation found");
    return;
  }
  
  const implAddr = ethers.getAddress("0x" + storage.slice(-40));
  console.log("Proxy address:", proxyAddr);
  console.log("Implementation address:", implAddr);
  
  // Also get ProxyAdmin address for proxy verification
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminStorage = await ethers.provider.getStorage(proxyAddr, ADMIN_SLOT);
  const adminAddr = ethers.getAddress("0x" + adminStorage.slice(-40));
  console.log("ProxyAdmin address:", adminAddr);
  
  console.log("\n📝 Verification commands:");
  console.log("\n1. Verify the implementation contract:");
  console.log(`   npx hardhat verify --network base-sepolia ${implAddr}`);
  
  console.log("\n2. Verify the proxy contract (TransparentUpgradeableProxy):");
  console.log(`   npx hardhat verify --network base-sepolia ${proxyAddr} \\`);
  console.log(`     --constructor-args $(cast abi-encode "constructor(address,address,bytes)" ${implAddr} ${adminAddr} 0x)`);
  console.log("\n   Or manually:");
  console.log(`   npx hardhat verify --network base-sepolia ${proxyAddr} ${implAddr} ${adminAddr} 0x`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
