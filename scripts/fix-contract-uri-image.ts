import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load expected metadata from repo (source of truth for image URL)
  const metadataPath = path.join(__dirname, "../metadata/token-metadata.json");
  const expectedMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  console.log("=== Expected Token Metadata ===");
  console.log("Image:", expectedMetadata.image);
  if (expectedMetadata.image_url) {
    console.log("Image URL:", expectedMetadata.image_url);
  }
  
  // Check what's on-chain
  const tokenAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  const [signer] = await ethers.getSigners();
  
  const Myntis = await ethers.getContractFactory("Myntis");
  const token = Myntis.attach(tokenAddr);
  
  const currentURI = await token.contractURI();
  console.log("\n=== Current contractURI on-chain ===");
  console.log(currentURI);
  
  // Fetch and compare metadata currently referenced by contractURI
  console.log("\n=== Fetching metadata from contractURI ===");
  const metadataUrl = currentURI.startsWith("ipfs://")
    ? currentURI.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")
    : currentURI;
  console.log("URL:", metadataUrl);
  
  try {
    const response = await fetch(metadataUrl);
    const metadata = await response.json();
    console.log("\nCurrent metadata JSON:");
    console.log(JSON.stringify(metadata, null, 2));
    
    // Check if image URL is correct
    if (expectedMetadata.image && metadata.image !== expectedMetadata.image) {
      console.log("\n⚠️  Image mismatch!");
      console.log("Expected:", expectedMetadata.image);
      console.log("Got:", metadata.image);
    }

    if (expectedMetadata.image_url && metadata.image_url !== expectedMetadata.image_url) {
      console.log("\n⚠️  image_url mismatch!");
      console.log("Expected:", expectedMetadata.image_url);
      console.log("Got:", metadata.image_url);
    }

    // Suggest fix
    console.log("\n=== Suggested Fix ===");
    console.log("Re-pin metadata JSON from token/metadata/token-metadata.json");
    console.log("Then call setContractURI(...) with the new metadata CID/URL.");
    
  } catch (e) {
    console.error("Failed to fetch metadata:", e.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
