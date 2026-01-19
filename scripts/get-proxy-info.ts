import { ethers } from "hardhat";

async function main() {
  const proxyAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  console.log("\n=== Proxy Contract Info ===\n");
  console.log("Proxy address:", proxyAddr);
  
  // EIP-1967 slots
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  
  // Get implementation address
  const implStorage = await ethers.provider.getStorage(proxyAddr, IMPL_SLOT);
  const implAddr = ethers.getAddress("0x" + implStorage.slice(-40));
  console.log("Implementation address:", implAddr);
  
  // Get ProxyAdmin address
  const adminStorage = await ethers.provider.getStorage(proxyAddr, ADMIN_SLOT);
  const adminAddr = ethers.getAddress("0x" + adminStorage.slice(-40));
  console.log("ProxyAdmin address:", adminAddr);
  
  console.log("\n=== Verification Commands ===\n");
  console.log("Step 1: Verify the IMPLEMENTATION contract (Myntis.sol):");
  console.log(`  npx hardhat verify --network base-sepolia ${implAddr}\n`);
  
  console.log("Step 2: After implementation is verified, verify the PROXY:");
  console.log(`  npx hardhat verify --network base-sepolia ${proxyAddr} \\`);
  console.log(`    --contract @openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy \\`);
  console.log(`    ${implAddr} ${adminAddr} "0x...initdata..."\n`);
  
  // Try to read contractURI to confirm everything works
  console.log("=== Testing contractURI read ===\n");
  try {
    const Myntis = await ethers.getContractFactory("Myntis");
    const token = Myntis.attach(proxyAddr);
    const uri = await token.contractURI();
    console.log("contractURI:", uri);
  } catch (e: any) {
    console.log("Error reading contractURI:", e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
