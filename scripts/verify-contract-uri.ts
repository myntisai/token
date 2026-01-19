import { ethers } from "hardhat";

async function main() {
  const tokenAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  
  const [signer] = await ethers.getSigners();
  console.log("Checking contractURI with signer:", signer.address);
  
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
    console.log("BaseScan: https://sepolia.basescan.org/address/" + tokenAddr + "#readContract");
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
