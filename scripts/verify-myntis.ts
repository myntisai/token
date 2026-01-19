import { run } from "hardhat";

async function main() {
  const contractAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  // Constructor arguments for Myntis (from deployment)
  // From CONTRACT_DEPLOYMENT_HISTORY.md:
  // - LZ Endpoint: 0x6EDCE65403992e310A62460808c4b910D972f10f
  // - Deployer: 0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627
  const lzEndpoint = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const delegate = "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627";
  
  console.log("\n=== Verifying Myntis Contract ===\n");
  console.log("Contract:", contractAddr);
  console.log("LZ Endpoint:", lzEndpoint);
  console.log("Delegate:", delegate);
  console.log("");

  try {
    await run("verify:verify", {
      address: contractAddr,
      constructorArguments: [lzEndpoint, delegate],
      contract: "contracts/Myntis.sol:Myntis",
    });
    console.log("\n✅ Contract verified successfully!");
  } catch (e: any) {
    if (e.message.includes("Already Verified") || e.message.includes("already verified")) {
      console.log("\n✅ Contract already verified!");
    } else {
      console.log("\n❌ Verification failed:", e.message);
      console.log("\nManual command:");
      console.log(`npx hardhat verify --network base-sepolia ${contractAddr} ${lzEndpoint} ${delegate}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
