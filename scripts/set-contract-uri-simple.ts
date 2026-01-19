import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
// Hardhat.config.ts already loads .env, so we can use process.env directly

async function main() {
  // Current production token (Dec 28, 2025)
  const tokenAddr = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
  const [signer] = await ethers.getSigners();
  
  console.log("Signer:", signer.address);
  
  // Read metadata JSON
  const metadataPath = path.join(__dirname, "../metadata/token-metadata.json");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  
  console.log("\n=== Metadata JSON ===");
  console.log(JSON.stringify(metadata, null, 2));
  
  // Upload to IPFS using Pinata JSON API
  // Hardhat should already load .env
  const PINATA_API_KEY = process.env.PINATA_API_KEY;
  const PINATA_SECRET = process.env.PINATA_SECRET_API_KEY || process.env.PINATA_SECRET_KEY || process.env.PINATA_SECRET;
  
  if (!PINATA_API_KEY || !PINATA_SECRET) {
    console.error("\n❌ PINATA_API_KEY and PINATA_SECRET_API_KEY must be set in .env");
    console.error("Found PINATA_API_KEY:", !!PINATA_API_KEY);
    console.error("Found PINATA_SECRET_API_KEY:", !!process.env.PINATA_SECRET_API_KEY);
    console.error("Found PINATA_SECRET:", !!process.env.PINATA_SECRET);
    console.error("\nAll PINATA vars:", Object.keys(process.env).filter(k => k.toUpperCase().includes('PINATA')));
    return;
  }
  
  console.log("\n=== Uploading JSON to IPFS via Pinata ===");
  
  try {
    // Pin JSON using Pinata's pinJSONToIPFS endpoint
    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: "Myntis Token Metadata v2",
          keyvalues: {
            token: "MYNT",
            version: "2.0",
            updated: new Date().toISOString()
          }
        },
        pinataOptions: {
          cidVersion: 0
        }
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }
    
    const result = await response.json();
    const ipfsHash = result.IpfsHash;
    
    console.log("✅ Metadata uploaded to IPFS:", ipfsHash);
    console.log("IPFS URI: ipfs://" + ipfsHash);
    console.log("Gateway URL: https://gateway.pinata.cloud/ipfs/" + ipfsHash);
    
    // Set contractURI on token - use Pinata gateway for better compatibility
    console.log("\n=== Setting contractURI on token ===");
    const Myntis = await ethers.getContractFactory("Myntis");
    const token = Myntis.attach(tokenAddr);
    
    // Use Pinata gateway URL for better explorer/wallet compatibility
    const contractURI = "https://gateway.pinata.cloud/ipfs/" + ipfsHash;
    console.log("Setting contractURI to:", contractURI);
    
    const tx = await token.setContractURI(contractURI);
    console.log("Transaction:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    
    // Verify
    const newURI = await token.contractURI();
    console.log("\n=== Verification ===");
    console.log("New contractURI:", newURI);
    console.log("\n✅ contractURI updated successfully!");
    console.log("\nYou can verify at:");
    console.log("  https://sepolia.basescan.org/address/" + tokenAddr + "#readContract");
    console.log("  Check contractURI() function");
    
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
