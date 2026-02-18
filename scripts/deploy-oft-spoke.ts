import { ethers } from "hardhat";
import { Contract } from "ethers";

/**
 * Deploy MyntisOFTSpoke (non-upgradeable) and optional SpokeDistributor.
 * This script replaces the legacy UUPS spoke deploy flow.
 */

interface OFTSpokeDeploymentResult {
  myntisOFTSpoke: Contract;
  spokeDistributor?: Contract;
}

async function deployOFTSpoke(): Promise<OFTSpokeDeploymentResult> {
  console.log("🚀 Deploying Myntis OFT Spoke...\n");

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available");
  }
  const deployer = signers[0];
  console.log(`Deploying contracts with account: ${deployer.address}`);
  console.log(`Account balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Get current chain ID
  const chainId = await ethers.provider.getNetwork().then((n) => Number(n.chainId));
  console.log(`Deploying on chain ID: ${chainId}`);

  // Get LayerZero endpoint from environment or use mock for testing
  const endpointAddress = process.env.LZ_ENDPOINT;
  let endpointToUse: string;

  if (!endpointAddress || !ethers.isAddress(endpointAddress)) {
    console.log("⚠️  No LZ_ENDPOINT provided, deploying mock endpoint for testing...");
    const LayerZeroEndpointMock = await ethers.getContractFactory("LayerZeroEndpointMock");
    const mockEndpoint = await LayerZeroEndpointMock.deploy(chainId);
    await mockEndpoint.waitForDeployment();
    endpointToUse = await mockEndpoint.getAddress();
    console.log(`✅ Mock LayerZero endpoint deployed at: ${endpointToUse}`);
  } else {
    endpointToUse = ethers.getAddress(endpointAddress);
    console.log(`✅ Using LayerZero endpoint: ${endpointToUse}`);
  }

  const hubEid = process.env.HUB_EID ? Number(process.env.HUB_EID) : 40245;
  const localEid = process.env.LOCAL_EID ? Number(process.env.LOCAL_EID) : 0;
  if (!localEid) {
    throw new Error("Missing LOCAL_EID for spoke deployment");
  }

  // 1. Deploy MyntisOFTSpoke
  console.log("\n📝 Deploying MyntisOFTSpoke...");
  const SpokeFactory = await ethers.getContractFactory("MyntisOFTSpoke");
  const myntisOFTSpoke = await SpokeFactory.deploy(
    endpointToUse,
    deployer.address,
    hubEid,
    localEid
  );
  await myntisOFTSpoke.waitForDeployment();
  console.log(`✅ MyntisOFTSpoke deployed to: ${await myntisOFTSpoke.getAddress()}`);

  let spokeDistributor: Contract | undefined;
  const deployDistributor = (process.env.DEPLOY_SPOKE_DISTRIBUTOR || "true").toLowerCase() !== "false";
  if (deployDistributor) {
    console.log("\n📝 Deploying SpokeDistributor...");
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    spokeDistributor = await SpokeDistributor.deploy(
      await myntisOFTSpoke.getAddress(),
      deployer.address
    );
    await spokeDistributor.waitForDeployment();
    console.log(`✅ SpokeDistributor deployed to: ${await spokeDistributor.getAddress()}`);

    // Grant MINTER_ROLE to SpokeDistributor
    await myntisOFTSpoke.grantRole(await myntisOFTSpoke.MINTER_ROLE(), await spokeDistributor.getAddress());
    console.log("✅ MINTER_ROLE granted to SpokeDistributor");
  }

  console.log("\n📊 Deployment Summary:");
  console.log(`MyntisOFTSpoke: ${await myntisOFTSpoke.getAddress()}`);
  if (spokeDistributor) {
    console.log(`SpokeDistributor: ${await spokeDistributor.getAddress()}`);
  }

  return { myntisOFTSpoke, spokeDistributor };
}

async function main() {
  await deployOFTSpoke();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
