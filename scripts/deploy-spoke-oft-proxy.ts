import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS || deployer.address;
  const hubChainId = 84532; // Base Sepolia
  const hubToken = process.env.HUB_TOKEN_ADDRESS!;

  if (!hubToken || !ethers.isAddress(hubToken)) {
    throw new Error("Missing or invalid HUB_TOKEN_ADDRESS");
  }

  console.log("👷 Deploying MyntisSpokeOFT proxy with:");
  console.log("  Deployer:", deployer.address);
  console.log("  Admin:", admin);
  console.log("  HubChainId:", hubChainId);
  console.log("  HubToken:", hubToken);

  const Factory = await ethers.getContractFactory("MyntisSpokeOFT");
  const proxy = await upgrades.deployProxy(
    Factory,
    ["Myntis", "MYNT", admin, hubChainId, hubToken],
    { initializer: "initialize", kind: "uups" }
  );
  await proxy.waitForDeployment();
  console.log("✅ MyntisSpokeOFT (proxy):", await proxy.getAddress());
}

main().catch((e)=>{console.error(e); process.exit(1);});
