import { ethers } from "hardhat";

const ENDPOINT_ABI = ["function delegates(address) view returns (address)"];

async function main() {
  const endpointAddr = process.env.LZ_ENDPOINT;
  const app = process.env.LZ_APP_ADDRESS;
  if (!endpointAddr || !ethers.isAddress(endpointAddr)) throw new Error("Missing/invalid LZ_ENDPOINT");
  if (!app || !ethers.isAddress(app)) throw new Error("Missing/invalid LZ_APP_ADDRESS");

  const [signer] = await ethers.getSigners();
  const endpoint = new ethers.Contract(endpointAddr, ENDPOINT_ABI, signer);
  const delegate = await endpoint.delegates(app);
  console.log("Endpoint:", endpointAddr);
  console.log("App:", app);
  console.log("Delegate:", delegate);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

