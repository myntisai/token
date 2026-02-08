import { ethers } from "hardhat";

/**
 * Set peer on Hub (Base Sepolia) to point to Spoke (Arbitrum Sepolia)
 */

const LZ_CONFIG = {
  baseSepolia: { chainId: 84532, eid: 40245 },
  arbSepolia: { chainId: 421614, eid: 40231 },
};

const HUB_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const SPOKE_ARB_SEPOLIA = "0x9bC5fC24778A967f4d42C0789F161a347867A778";

async function main() {
  console.log("=".repeat(80));
  console.log("SET HUB PEER - BASE SEPOLIA -> ARB SEPOLIA");
  console.log("=".repeat(80));

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log(`\nDeployer: ${deployer.address}`);
  console.log(`Network: ${network.name} (chainId: ${chainId})`);

  if (chainId !== LZ_CONFIG.baseSepolia.chainId) {
    throw new Error(`Expected Base Sepolia (${LZ_CONFIG.baseSepolia.chainId}), got ${chainId}`);
  }

  const Myntis = await ethers.getContractFactory("Myntis");
  const hub = Myntis.attach(HUB_MYNTIS);

  console.log(`\nHub contract:   ${HUB_MYNTIS}`);
  console.log(`Spoke contract: ${SPOKE_ARB_SEPOLIA}`);

  const spokePeerBytes32 = ethers.zeroPadValue(SPOKE_ARB_SEPOLIA, 32);
  console.log(`Spoke peer (bytes32): ${spokePeerBytes32}`);

  console.log(`\nSetting peer for Arbitrum Sepolia (EID: ${LZ_CONFIG.arbSepolia.eid})...`);
  const tx = await hub.setPeer(LZ_CONFIG.arbSepolia.eid, spokePeerBytes32);
  console.log(`Transaction: ${tx.hash}`);
  await tx.wait();
  console.log("Done!");

  const setPeer = await hub.peers(LZ_CONFIG.arbSepolia.eid);
  console.log(`\nVerified peer: ${setPeer}`);
  console.log(`Expected:      ${spokePeerBytes32}`);
  console.log(`Match: ${setPeer.toLowerCase() === spokePeerBytes32.toLowerCase() ? "✅" : "❌"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
