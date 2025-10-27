import { promises as fs } from "fs";
import path from "path";
import { ethers } from "hardhat";

type PeerConfig = { eid: number; peer: string };

function parsePeers(raw?: string | null): PeerConfig[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [eidStr, peer] = entry.split(":").map((segment) => segment.trim());
      if (!eidStr || !peer) {
        throw new Error(`Invalid peer entry "${entry}". Expected format "<eid>:<address>"`);
      }
      const eid = Number(eidStr);
      if (!Number.isInteger(eid) || eid <= 0) {
        throw new Error(`Invalid endpoint id "${eidStr}" in entry "${entry}"`);
      }
      if (!ethers.isAddress(peer)) {
        throw new Error(`Invalid peer address "${peer}" for eid ${eid}`);
      }
      return { eid, peer: ethers.getAddress(peer) };
    });
}

function addressToBytes32(address: string): string {
  return ethers.zeroPadValue(address, 32);
}

async function updateDeploymentInfo(
  tokenAddress: string,
  deployer: string
): Promise<void> {
  const deploymentInfoPath = path.resolve(__dirname, "..", "..", "deployment-info.json");
  let contents: any = {};

  try {
    const existing = await fs.readFile(deploymentInfoPath, "utf8");
    contents = JSON.parse(existing);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      console.warn("⚠️  Could not read existing deployment-info.json, starting fresh:", err.message);
    }
  }

  const next = {
    timestamp: new Date().toISOString(),
    deployer,
    network: contents.network ?? "unknown",
    contracts: {
      ...(contents.contracts ?? {}),
      myntisOFT: tokenAddress
    }
  };

  await fs.writeFile(deploymentInfoPath, JSON.stringify(next, null, 2));
  console.log(`📝 Updated deployment-info.json with MyntisOFT at ${tokenAddress}`);
}

async function main() {
  const endpoint = process.env.LZ_ENDPOINT;
  const adminAddress = process.env.ADMIN_ADDRESS;
  const peersRaw = process.env.LZ_PEERS;

  if (!endpoint || !ethers.isAddress(endpoint)) {
    throw new Error("Missing or invalid LZ_ENDPOINT");
  }

  const [deployer] = await ethers.getSigners();
  const admin = adminAddress ? ethers.getAddress(adminAddress) : deployer.address;

  console.log("👷 Deploying MyntisOFT with account:", deployer.address);
  console.log("   Admin:", admin);
  console.log("   Endpoint:", endpoint);

  const MyntisOFTFactory = await ethers.getContractFactory("MyntisOFT");
  const oft = await MyntisOFTFactory.deploy("Myntis", "MYNT", endpoint, admin);
  await oft.waitForDeployment();
  const oftAddress = await oft.getAddress();

  console.log(`✅ MyntisOFT deployed at ${oftAddress}`);

  const peers = parsePeers(peersRaw);
  if (peers.length > 0) {
    console.log("🔗 Configuring peers...");
    for (const { eid, peer } of peers) {
      const tx = await oft.setPeer(eid, addressToBytes32(peer));
      await tx.wait();
      console.log(`   - Peer for eid ${eid}: ${peer}`);
    }
  } else {
    console.log("ℹ️  No peers provided via LZ_PEERS (skipping setPeer)");
  }

  await updateDeploymentInfo(oftAddress, deployer.address);

  console.log("🎉 MyntisOFT deployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
