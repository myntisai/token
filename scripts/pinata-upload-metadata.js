const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

async function pinFile({ apiKey, apiSecret, filePath, name }) {
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  const fileBlob = new Blob([fileBuffer], { type: "image/png" });
  formData.append("file", fileBlob, path.basename(filePath));

  if (name) {
    formData.append(
      "pinataMetadata",
      JSON.stringify({
        name,
        keyvalues: {
          token: "MYNT",
          background: "white",
        },
      })
    );
  }

  formData.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata file upload failed: ${errorText}`);
  }

  return response.json();
}

async function pinJson({ apiKey, apiSecret, content, name, metadata }) {
  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: {
        name,
        keyvalues: metadata,
      },
      pinataOptions: {
        cidVersion: 0,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata JSON upload failed: ${errorText}`);
  }

  return response.json();
}

async function main() {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });

  const PINATA_API_KEY = process.env.PINATA_API_KEY;
  const PINATA_SECRET =
    process.env.PINATA_SECRET_API_KEY ||
    process.env.PINATA_SECRET_KEY ||
    process.env.PINATA_SECRET;

  requireEnv("PINATA_API_KEY", PINATA_API_KEY);
  requireEnv("PINATA_SECRET_API_KEY|PINATA_SECRET_KEY|PINATA_SECRET", PINATA_SECRET);

  const imagePath =
    process.env.CONTRACT_IMAGE_PATH ||
    path.join(
      __dirname,
      "..",
      "..",
      "frontend",
      "public",
      "icons",
      "icon-512x512-white.png"
    );

  const metadataPath = path.join(__dirname, "..", "metadata", "token-metadata.json");

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Metadata not found: ${metadataPath}`);
  }

  console.log("Using image:", imagePath);

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  console.log("\n=== Uploading image to Pinata ===");
  const imageResult = await pinFile({
    apiKey: PINATA_API_KEY,
    apiSecret: PINATA_SECRET,
    filePath: imagePath,
    name: "Myntis Logo (White Background)",
  });

  const imageCid = imageResult.IpfsHash;
  const imageIpfs = `ipfs://${imageCid}`;
  const imageGateway = `https://gateway.pinata.cloud/ipfs/${imageCid}`;

  console.log("Image CID:", imageCid);
  console.log("Image IPFS:", imageIpfs);
  console.log("Image Gateway:", imageGateway);

  metadata.image = imageIpfs;
  metadata.image_url = imageGateway;

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log("\nUpdated metadata file:", metadataPath);

  console.log("\n=== Uploading metadata JSON to Pinata ===");
  const metadataResult = await pinJson({
    apiKey: PINATA_API_KEY,
    apiSecret: PINATA_SECRET,
    content: metadata,
    name: "Myntis Token Metadata (White Logo)",
    metadata: {
      token: "MYNT",
      imageCid,
      background: "white",
      updated: new Date().toISOString(),
    },
  });

  const metadataCid = metadataResult.IpfsHash;
  const metadataIpfs = `ipfs://${metadataCid}`;
  const metadataGateway = `https://gateway.pinata.cloud/ipfs/${metadataCid}`;

  console.log("Metadata CID:", metadataCid);
  console.log("Metadata IPFS:", metadataIpfs);
  console.log("Metadata Gateway:", metadataGateway);

  console.log("\n=== ContractURI Candidates ===");
  console.log("IPFS:", metadataIpfs);
  console.log("Gateway:", metadataGateway);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});
