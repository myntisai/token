// Cross-chain peer configuration for Myntis OFT tokens
// Uses Myntis.sol (hub) and MyntisOFTSpoke.sol (spokes)
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// LayerZero V2 Endpoint IDs (EIDs) - Updated November 2024
// Reference: https://docs.layerzero.network/v2/developers/evm/technical-reference/endpoints
const LAYERZERO_EIDS: { [key: string]: number } = {
  "base-sepolia": process.env.LZ_EID_BASE_SEPOLIA ? parseInt(process.env.LZ_EID_BASE_SEPOLIA) : 40245,
  "ethereum-sepolia": process.env.LZ_EID_ETHEREUM_SEPOLIA ? parseInt(process.env.LZ_EID_ETHEREUM_SEPOLIA) : 40161,
  "arbitrum-sepolia": process.env.LZ_EID_ARBITRUM_SEPOLIA ? parseInt(process.env.LZ_EID_ARBITRUM_SEPOLIA) : 40231,
  "optimism-sepolia": process.env.LZ_EID_OPTIMISM_SEPOLIA ? parseInt(process.env.LZ_EID_OPTIMISM_SEPOLIA) : 40232,
  "polygon-amoy": process.env.LZ_EID_POLYGON_AMOY ? parseInt(process.env.LZ_EID_POLYGON_AMOY) : 40267,
  "bsc-testnet": process.env.LZ_EID_BSC_TESTNET ? parseInt(process.env.LZ_EID_BSC_TESTNET) : 40102,
  "linea-sepolia": process.env.LZ_EID_LINEA_SEPOLIA ? parseInt(process.env.LZ_EID_LINEA_SEPOLIA) : 40287,
  "scroll-sepolia": process.env.LZ_EID_SCROLL_SEPOLIA ? parseInt(process.env.LZ_EID_SCROLL_SEPOLIA) : 40214,
  // Legacy - deprecated but kept for reference
  "polygon-mumbai": 40109, // DEPRECATED - Use polygon-amoy instead
};

interface DeploymentInfo {
  network: string;
  chainId: number;
  layerZeroEid: number;
  contracts: {
    myntis: string;
  };
}

async function loadHubDeployment(): Promise<DeploymentInfo> {
  const deploymentFile = path.join(__dirname, "../deployments/deployment-base-sepolia-latest.json");
  if (!fs.existsSync(deploymentFile)) {
    throw new Error("Hub deployment not found: deployment-base-sepolia-latest.json");
  }
  const data = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  return {
    network: data.network || "base-sepolia",
    chainId: Number(data.chainId || 84532),
    layerZeroEid: LAYERZERO_EIDS["base-sepolia"],
    contracts: { myntis: data.myntis }
  };
}

async function loadSpokeDeployment(networkName: string): Promise<DeploymentInfo | null> {
  const deploymentFile = path.join(__dirname, `../deployments/${networkName}-oft-v2-spoke.json`);
  if (!fs.existsSync(deploymentFile)) return null;
  const data = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
  return {
    network: data.network,
    chainId: Number(data.chainId),
    layerZeroEid: data.layerZeroEid || LAYERZERO_EIDS[networkName],
    contracts: { myntis: data.contracts.myntisOFTSpoke }
  };
}

async function configurePeers() {
  console.log("🔗 Configuring cross-chain peers for Myntis OFT tokens...\n");

  const hubNetwork = "base-sepolia";
  // Add more spoke networks as you deploy them
  const spokeNetworks = ["ethereum-sepolia", "arbitrum-sepolia", "optimism-sepolia"];

  // Load hub deployment
  const hubDeployment = await loadHubDeployment();

  console.log(`Hub: ${hubNetwork}`);
  console.log(`Hub Myntis: ${hubDeployment.contracts.myntis}`);
  console.log(`Hub EID: ${hubDeployment.layerZeroEid}\n`);

  // Load spoke deployments
  const spokeDeployments: { [key: string]: DeploymentInfo } = {};
  for (const network of spokeNetworks) {
    const deployment = await loadSpokeDeployment(network);
    if (deployment) {
      spokeDeployments[network] = deployment;
      console.log(`Spoke: ${network}`);
      console.log(`  MyntisOFTSpoke: ${deployment.contracts.myntis}`);
      console.log(`  EID: ${deployment.layerZeroEid}`);
    } else {
      console.log(`⚠️  Spoke deployment not found for ${network}`);
    }
  }

  console.log("\n📝 Configuring peers...\n");

  // Configure hub to know about spokes
  console.log("Configuring hub peers...");
  // Use Myntis.sol for hub (not deprecated MyntisOFT.sol)
  const hubContract = await ethers.getContractAt(
    "Myntis",
    hubDeployment.contracts.myntis
  );

  for (const [network, deployment] of Object.entries(spokeDeployments)) {
    const spokeEid = deployment.layerZeroEid;
    const spokeAddress = deployment.contracts.myntis;
    const spokeAddressBytes32 = ethers.zeroPadValue(spokeAddress, 32);

    try {
      const tx = await hubContract.setPeer(spokeEid, spokeAddressBytes32);
      await tx.wait();
      console.log(`✅ Hub peer configured: ${network} (EID ${spokeEid}) -> ${spokeAddress}`);
    } catch (error: any) {
      console.error(`❌ Failed to configure hub peer for ${network}:`, error.message);
    }
  }

  // Configure spokes to know about hub
  console.log("\nConfiguring spoke peers...");
  const hubEid = hubDeployment.layerZeroEid;
  const hubAddress = hubDeployment.contracts.myntis;
  const hubAddressBytes32 = ethers.zeroPadValue(hubAddress, 32);

  for (const [network, deployment] of Object.entries(spokeDeployments)) {
    try {
      const spokeContract = await ethers.getContractAt(
        "MyntisOFTSpoke",
        deployment.contracts.myntis
      );

      const tx = await spokeContract.setPeer(hubEid, hubAddressBytes32);
      await tx.wait();
      console.log(`✅ Spoke peer configured: ${network} -> Hub (EID ${hubEid})`);
    } catch (error: any) {
      console.error(`❌ Failed to configure spoke peer for ${network}:`, error.message);
    }
  }

  console.log("\n✅ Peer configuration completed!");
}

async function main() {
  try {
    await configurePeers();
  } catch (error: any) {
    console.error("❌ Configuration failed:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
