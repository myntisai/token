import { network, run } from "hardhat";
import { assertEndpointMatchesNetwork, getLzEndpointV2 } from "./layerzero";

async function main() {
  // Legacy helper script. Prefer scripts/verify-contract-uri.ts and deployment JSONs for new deployments.
  const contractAddr = process.env.TOKEN_ADDRESS || "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  // Constructor arguments for Myntis (from deployment)
  // From CONTRACT_DEPLOYMENT_HISTORY.md:
  // - LZ Endpoint: varies by network (override with LZ_ENDPOINT)
  // - Delegate: deployer/admin that was passed at deploy time (override with DELEGATE)
  const lzEndpoint = process.env.LZ_ENDPOINT || getLzEndpointV2(network.name);
  const delegate = process.env.DELEGATE || "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627";

  assertEndpointMatchesNetwork(network.name, lzEndpoint);
  
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
      console.log(`npx hardhat verify --network ${network.name} ${contractAddr} ${lzEndpoint} ${delegate}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
