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
  
  const [signer] = await ethers.getSigners();
  console.log("Checking contractURI with signer:", signer.address);
  console.log("Network:", network.name);
  console.log("Token:", tokenAddr);
  
  const Myntis = await ethers.getContractFactory("Myntis");
  const token = Myntis.attach(tokenAddr);
  
  const contractURI = await token.contractURI();
  console.log("\n=== Current contractURI ===");
  console.log(contractURI);
  
  if (contractURI.startsWith("ipfs://")) {
    const hash = contractURI.replace("ipfs://", "");
    console.log("\n=== IPFS Hash ===");
    console.log(hash);
    
    console.log("\n=== View Metadata ===");
    console.log("Pinata Gateway: https://gateway.pinata.cloud/ipfs/" + hash);
    console.log("Cloudflare Gateway: https://cloudflare-ipfs.com/ipfs/" + hash);
    console.log("IPFS.io Gateway: https://ipfs.io/ipfs/" + hash);
    
    console.log("\n=== View on Block Explorer ===");
    if (network.name === "base-sepolia") {
      console.log("BaseScan: https://sepolia.basescan.org/address/" + tokenAddr + "#readContract");
    } else if (network.name === "base-mainnet") {
      console.log("BaseScan: https://basescan.org/address/" + tokenAddr + "#readContract");
    } else {
      console.log("Explorer: (unknown network) address " + tokenAddr);
    }
    console.log("  → Call contractURI() function to see the URI");
    
    console.log("\n=== Verify on OpenSea Testnet ===");
    console.log("OpenSea Testnet: https://testnets.opensea.io/assets/base-sepolia/" + tokenAddr);
    console.log("(Note: OpenSea may not support testnets or may take time to index)");
    
    // Try to fetch and display metadata
    console.log("\n=== Fetching Metadata JSON ===");
    try {
      const response = await fetch(`https://gateway.pinata.cloud/ipfs/${hash}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const metadata = await response.json();
      console.log(JSON.stringify(metadata, null, 2));
      
      if (metadata.image) {
        console.log("\n=== Image URL ===");
        console.log(metadata.image);
        console.log("\n✅ Image URL found in metadata");
      } else {
        console.log("\n⚠️  No 'image' field in metadata");
      }
    } catch (e: any) {
      console.error("Failed to fetch metadata:", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
