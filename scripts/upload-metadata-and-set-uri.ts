import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const tokenAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  const [signer] = await ethers.getSigners();
  
  console.log("Signer:", signer.address);
  
  // Read metadata JSON
  const metadataPath = path.join(__dirname, "../metadata/token-metadata.json");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  
  console.log("\n=== Metadata JSON ===");
  console.log(JSON.stringify(metadata, null, 2));
  
  // Upload to IPFS using Pinata API
  const PINATA_API_KEY = process.env.PINATA_API_KEY;
  const PINATA_SECRET = process.env.PINATA_SECRET;
  
  if (!PINATA_API_KEY || !PINATA_SECRET) {
    console.error("\n❌ PINATA_API_KEY and PINATA_SECRET must be set in .env");
    console.log("\nUsing existing metadata hash from deployment history...");
    console.log("Metadata hash: QmeCRTQUR4Dx1QymvcKymLEPmNyLWJ1oJ9UocpawJvDbkP");
    console.log("\nIf image doesn't work, the issue might be:");
    console.log("1. Image URL in metadata should be: ipfs://QmZC5gVHds6FqVL8V1PF9ayEJJBWMbiMzpAUXmHpC5zMcV");
    console.log("2. Or use gateway URL: https://gateway.pinata.cloud/ipfs/QmZC5gVHds6FqVL8V1PF9ayEJJBWMbiMzpAUXmHpC5zMcV");
    return;
  }
  
  console.log("\n=== Uploading to IPFS ===");
  
  // Upload JSON to IPFS
  const formData = new FormData();
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
  formData.append("file", blob, "token-metadata.json");
  
  const pinataMetadata = JSON.stringify({
    name: "Myntis Token Metadata",
    keyvalues: {
      token: "MYNT",
      version: "1.0"
    }
  });
  formData.append("pinataMetadata", pinataMetadata);
  
  const pinataOptions = JSON.stringify({
    cidVersion: 0
  });
  formData.append("pinataOptions", pinataOptions);
  
  try {
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET,
      },
      body: formData,
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
    
    // Set contractURI on token
    console.log("\n=== Setting contractURI on token ===");
    const Myntis = await ethers.getContractFactory("Myntis");
    const token = Myntis.attach(tokenAddr);
    
    const contractURI = "ipfs://" + ipfsHash;
    console.log("Setting contractURI to:", contractURI);
    
    const tx = await token.setContractURI(contractURI);
    console.log("Transaction:", tx.hash);
    await tx.wait();
    
    console.log("✅ contractURI updated!");
    
    // Verify
    const newURI = await token.contractURI();
    console.log("\n=== Verification ===");
    console.log("New contractURI:", newURI);
    
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
