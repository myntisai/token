import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// LayerZero V2 Endpoint IDs (EIDs) - Load from environment variables
const LAYERZERO_EIDS: { [key: string]: number } = {
  "base-sepolia": process.env.LZ_EID_BASE_SEPOLIA ? parseInt(process.env.LZ_EID_BASE_SEPOLIA) : 40245,
  "ethereum-sepolia": process.env.LZ_EID_ETHEREUM_SEPOLIA ? parseInt(process.env.LZ_EID_ETHEREUM_SEPOLIA) : 40161,
  "arbitrum-sepolia": process.env.LZ_EID_ARBITRUM_SEPOLIA ? parseInt(process.env.LZ_EID_ARBITRUM_SEPOLIA) : 40120,
  "optimism-sepolia": process.env.LZ_EID_OPTIMISM_SEPOLIA ? parseInt(process.env.LZ_EID_OPTIMISM_SEPOLIA) : 40232,
  "polygon-mumbai": process.env.LZ_EID_POLYGON_MUMBAI ? parseInt(process.env.LZ_EID_POLYGON_MUMBAI) : 40109,
};

interface DeploymentInfo {
  network: string;
  chainId: number;
  layerZeroEid: number;
  contracts: {
    myntisOFT: string;
  };
}

async function loadDeployment(networkName: string): Promise<DeploymentInfo | null> {
  // Try multiple possible file names
  const possibleFiles = [
    `${networkName}-oft-standard.json`,
    `${networkName}-full-stack.json`
  ];
  
  for (const fileName of possibleFiles) {
    const deploymentFile = path.join(__dirname, `../deployments/${fileName}`);
    if (fs.existsSync(deploymentFile)) {
      const data = JSON.parse(fs.readFileSync(deploymentFile, "utf-8"));
      // Handle both formats
      if (data.contracts && data.contracts.myntisOFT) {
        return {
          network: data.network,
          chainId: data.chainId,
          layerZeroEid: data.layerZeroEid,
          contracts: { myntisOFT: data.contracts.myntisOFT }
        };
      } else if (data.myntisOFT) {
        return {
          network: data.network,
          chainId: data.chainId,
          layerZeroEid: data.layerZeroEid || LAYERZERO_EIDS[networkName],
          contracts: { myntisOFT: data.myntisOFT }
        };
      }
    }
  }
  return null;
}

async function configurePeers() {
  console.log("🔗 Configuring cross-chain peers for MyntisOFT...\n");

  const hubNetwork = "base-sepolia";
  const spokeNetworks = ["ethereum-sepolia", "arbitrum-sepolia"];

  // Load hub deployment
  const hubDeployment = await loadDeployment(hubNetwork);
  if (!hubDeployment) {
    throw new Error(`Hub deployment not found for ${hubNetwork}. Deploy hub first.`);
  }

  console.log(`Hub: ${hubNetwork}`);
  console.log(`Hub MyntisOFT: ${hubDeployment.contracts.myntisOFT}`);
  console.log(`Hub EID: ${hubDeployment.layerZeroEid}\n`);

  // Load spoke deployments
  const spokeDeployments: { [key: string]: DeploymentInfo } = {};
  for (const network of spokeNetworks) {
    const deployment = await loadDeployment(network);
    if (deployment) {
      spokeDeployments[network] = deployment;
      console.log(`Spoke: ${network}`);
      console.log(`  MyntisOFT: ${deployment.contracts.myntisOFT}`);
      console.log(`  EID: ${deployment.layerZeroEid}`);
    } else {
      console.log(`⚠️  Spoke deployment not found for ${network}`);
    }
  }

  console.log("\n📝 Configuring peers...\n");

  // Configure hub to know about spokes
  console.log("Configuring hub peers...");
  const hubContract = await ethers.getContractAt(
    "contracts/MyntisOFT.sol:MyntisOFT",
    hubDeployment.contracts.myntisOFT
  );

  for (const [network, deployment] of Object.entries(spokeDeployments)) {
    const spokeEid = deployment.layerZeroEid;
    const spokeAddress = deployment.contracts.myntisOFT;
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
  const hubAddress = hubDeployment.contracts.myntisOFT;
  const hubAddressBytes32 = ethers.zeroPadValue(hubAddress, 32);

  for (const [network, deployment] of Object.entries(spokeDeployments)) {
    try {
      const spokeContract = await ethers.getContractAt(
        "contracts/MyntisOFT.sol:MyntisOFT",
        deployment.contracts.myntisOFT
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

