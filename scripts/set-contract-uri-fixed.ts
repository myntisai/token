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
    console.log("\nYou need to:");
    console.log("1. Add PINATA_API_KEY and PINATA_SECRET to your .env file");
    console.log("2. Manually upload token/metadata/token-metadata.json to Pinata");
    console.log("3. Get the IPFS hash and set contractURI manually");
    return;
  }
  
  console.log("\n=== Uploading to IPFS ===");
  
  // Create FormData manually for Node.js
  const FormData = require("form-data");
  const formData = new FormData();
  
  // Add the JSON file
  formData.append("file", fs.createReadStream(metadataPath), {
    filename: "token-metadata.json",
    contentType: "application/json",
  });
  
  // Add metadata
  const pinataMetadata = {
    name: "Myntis Token Metadata",
    keyvalues: {
      token: "MYNT",
      version: "2.0"
    }
  };
  formData.append("pinataMetadata", JSON.stringify(pinataMetadata));
  
  // Add options
  const pinataOptions = { cidVersion: 0 };
  formData.append("pinataOptions", JSON.stringify(pinataOptions));
  
  try {
    // Use built-in fetch (Node 18+) or dynamic import
    const fetch = (globalThis.fetch || (await import("node-fetch")).default);
    
    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET,
        ...formData.getHeaders(),
      },
      body: formData as any,
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
    if (error.message.includes("form-data") || error.message.includes("node-fetch")) {
      console.log("\n⚠️  Missing dependencies. Install with:");
      console.log("npm install form-data node-fetch@2");
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
