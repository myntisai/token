import { ethers } from "hardhat";

async function main() {
  // According to deployment history:
  // Logo (PNG): ipfs://QmZC5gVHds6FqVL8V1PF9ayEJJBWMbiMzpAUXmHpC5zMcV
  // Metadata JSON: ipfs://QmeCRTQUR4Dx1QymvcKymLEPmNyLWJ1oJ9UocpawJvDbkP
  
  const LOGO_HASH = "QmZC5gVHds6FqVL8V1PF9ayEJJBWMbiMzpAUXmHpC5zMcV";
  const METADATA_HASH = "QmeCRTQUR4Dx1QymvcKymLEPmNyLWJ1oJ9UocpawJvDbkP";
  
  console.log("=== Current Token Metadata ===");
  console.log("Logo IPFS:", `ipfs://${LOGO_HASH}`);
  console.log("Metadata IPFS:", `ipfs://${METADATA_HASH}`);
  
  // Check what's on-chain
  const tokenAddr = "0x5242925C716225C58459f557E5B4Be51373aB767";
  const [signer] = await ethers.getSigners();
  
  const Myntis = await ethers.getContractFactory("Myntis");
  const token = Myntis.attach(tokenAddr);
  
  const currentURI = await token.contractURI();
  console.log("\n=== Current contractURI on-chain ===");
  console.log(currentURI);
  
  // The issue might be that the metadata JSON has the wrong image format
  // Let's fetch and check the actual metadata
  console.log("\n=== Fetching metadata from IPFS ===");
  const metadataUrl = `https://gateway.pinata.cloud/ipfs/${METADATA_HASH}`;
  console.log("URL:", metadataUrl);
  
  try {
    const response = await fetch(metadataUrl);
    const metadata = await response.json();
    console.log("\nCurrent metadata JSON:");
    console.log(JSON.stringify(metadata, null, 2));
    
    // Check if image URL is correct
    if (metadata.image && !metadata.image.includes(LOGO_HASH)) {
      console.log("\n⚠️  Image hash mismatch!");
      console.log("Expected:", LOGO_HASH);
      console.log("Got:", metadata.image);
    }
    
    // Suggest fix
    console.log("\n=== Suggested Fix ===");
    console.log("The image should be: ipfs://" + LOGO_HASH);
    console.log("Or use a gateway: https://gateway.pinata.cloud/ipfs/" + LOGO_HASH);
    
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
