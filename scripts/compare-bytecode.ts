import { ethers, artifacts } from "hardhat";

async function main() {
  const contractAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  console.log("Fetching deployed bytecode (runtime)...");
  const deployedCode = await ethers.provider.getCode(contractAddr);
  
  console.log("Getting local DEPLOYED bytecode (runtime)...");
  const artifact = await artifacts.readArtifact("Myntis");
  const localBytecode = artifact.deployedBytecode; // Runtime bytecode, NOT creation
  
  // The deployed code is runtime bytecode (what's stored on chain)
  // The local bytecode includes constructor + runtime
  // We need to compare runtime portions
  
  console.log("\n=== Bytecode Comparison ===\n");
  console.log("Deployed code length:", deployedCode.length);
  console.log("Local bytecode length:", localBytecode.length);
  
  // Find where they differ
  const minLen = Math.min(deployedCode.length, localBytecode.length);
  let firstDiff = -1;
  for (let i = 0; i < minLen; i++) {
    if (deployedCode[i] !== localBytecode[i]) {
      firstDiff = i;
      break;
    }
  }
  
  if (firstDiff === -1 && deployedCode.length === localBytecode.length) {
    console.log("\n✅ Bytecodes match!");
  } else {
    console.log("\n❌ Bytecodes differ");
    if (firstDiff !== -1) {
      console.log(`First difference at position: ${firstDiff}`);
      console.log(`Deployed: ...${deployedCode.slice(Math.max(0, firstDiff-20), firstDiff+20)}...`);
      console.log(`Local:    ...${localBytecode.slice(Math.max(0, firstDiff-20), firstDiff+20)}...`);
    }
  }
  
  // Check first 100 chars (should be similar for same contract structure)
  const deployed100 = deployedCode.slice(0, 100);
  const local100 = localBytecode.slice(0, 100);
  console.log("\nFirst 100 chars match:", deployed100 === local100);
  
  console.log("\nDeployed first 100:", deployed100);
  console.log("Local first 100:   ", local100);
}

main().catch(console.error);
