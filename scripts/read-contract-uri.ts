import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const envAddr = process.env.TOKEN_ADDRESS;
  let tokenAddr: string | undefined = envAddr && ethers.isAddress(envAddr) ? envAddr : undefined;

  if (!tokenAddr) {
    const fname = `deployment-${network.name}-latest.json`;
    const p = path.join(__dirname, "..", "deployments", fname);
    if (fs.existsSync(p)) {
      const deployment = JSON.parse(fs.readFileSync(p, "utf8"));
      if (deployment.myntis && ethers.isAddress(deployment.myntis)) tokenAddr = deployment.myntis;
    }
  }

  if (!tokenAddr) {
    throw new Error(
      "Missing TOKEN_ADDRESS and no deployments/deployment-<network>-latest.json with { myntis } found"
    );
  }
  
  console.log("Reading contractURI from Myntis token...\n");
  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  
  // Load the contract ABI (we only need the contractURI function)
  const Myntis = await ethers.getContractFactory("Myntis");
  const token = Myntis.attach(tokenAddr);
  
  try {
    const contractURI = await token.contractURI();
    console.log("✅ contractURI:", contractURI);
    
    // If it's an IPFS URI, show the gateway URL
    if (contractURI.startsWith("ipfs://")) {
      const ipfsHash = contractURI.replace("ipfs://", "");
      console.log("\nIPFS Gateway URLs:");
      console.log(`  Pinata: https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
      console.log(`  IPFS.io: https://ipfs.io/ipfs/${ipfsHash}`);
      console.log(`  Cloudflare: https://cloudflare-ipfs.com/ipfs/${ipfsHash}`);
    }
    
    // Try to fetch and display the metadata
    if (contractURI.startsWith("ipfs://") || contractURI.startsWith("http")) {
      const gatewayUrl = contractURI.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
      console.log(`\nFetching metadata from: ${gatewayUrl}`);
      try {
        const response = await fetch(gatewayUrl);
        const metadata = await response.json();
        console.log("\n📄 Metadata JSON:");
        console.log(JSON.stringify(metadata, null, 2));
      } catch (e) {
        console.log("⚠️  Could not fetch metadata:", (e as Error).message);
      }
    }
    
  } catch (error: any) {
    console.error("❌ Error reading contractURI:", error.message);
    
    // Try to get implementation address
    console.log("\nAttempting to get implementation address...");
    const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const storage = await ethers.provider.getStorage(tokenAddr, IMPLEMENTATION_SLOT);
    const implAddr = "0x" + storage.slice(-40);
    console.log("Implementation address:", implAddr);
    console.log("\nTo verify the implementation, run:");
    console.log(`npx hardhat verify --network ${network.name} ${implAddr}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
