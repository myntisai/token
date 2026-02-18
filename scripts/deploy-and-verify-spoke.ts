import { ethers, run } from "hardhat";

// Hub contract addresses (from recent deployment)
const HUB_MYNTIS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
const HUB_REWARD_CLAIM_VERIFIER = "0xe44eE55933BD85C9F899fd4820eE783C9832558D";
const HUB_GROTH16_VERIFIER = "0x2000738e7E3e4dCB58f7e917AAb2fb1F9C78d9E8";

// LayerZero endpoints
const ETH_SEPOLIA_LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const BASE_SEPOLIA_EID = 40245;

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyContract(address: string, args: any[], contractPath?: string) {
  console.log(`\n🔍 Verifying ${contractPath || address}...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: args,
      ...(contractPath && { contract: contractPath }),
    });
    console.log(`✅ Verified!`);
    return true;
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`✅ Already verified`);
      return true;
    }
    console.error(`❌ Verification failed: ${error.message}`);
    console.log(`   Manual: npx hardhat verify --network ethereum-sepolia ${address} ${args.join(" ")}`);
    return false;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("================================================================================");
  console.log("MYNTIS SPOKE DEPLOYMENT (ETHEREUM SEPOLIA)");
  console.log("================================================================================");
  console.log(`Network: ethereum-sepolia (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`LZ Endpoint: ${ETH_SEPOLIA_LZ_ENDPOINT}`);
  console.log(`Hub Chain EID: ${BASE_SEPOLIA_EID}`);
  console.log();

  const deployed: Record<string, string> = {};

  // ============================================================
  // 1. Deploy Groth16Verifier
  // ============================================================
  console.log("============================================================");
  console.log("1. DEPLOYING GROTH16VERIFIER");
  console.log("============================================================");
  
  const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier");
  const groth16 = await Groth16Verifier.deploy();
  await groth16.waitForDeployment();
  deployed.Groth16Verifier = await groth16.getAddress();
  console.log(`✅ Groth16Verifier deployed: ${deployed.Groth16Verifier}`);
  
  await delay(30000);
  await verifyContract(deployed.Groth16Verifier, [], "contracts/RewardClaimVerifier_generated.sol:Groth16Verifier");

  // ============================================================
  // 2. Deploy RewardClaimVerifier
  // ============================================================
  console.log("\n============================================================");
  console.log("2. DEPLOYING REWARDCLAIMVERIFIER");
  console.log("============================================================");
  
  const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
  const verifier = await RewardClaimVerifier.deploy();
  await verifier.waitForDeployment();
  deployed.RewardClaimVerifier = await verifier.getAddress();
  console.log(`✅ RewardClaimVerifier deployed: ${deployed.RewardClaimVerifier}`);
  
  // Set Groth16Verifier
  const setVerifierTx = await verifier.setVerifierContract(deployed.Groth16Verifier);
  await setVerifierTx.wait();
  console.log(`✅ Groth16Verifier set in RewardClaimVerifier`);
  
  await delay(30000);
  await verifyContract(deployed.RewardClaimVerifier, [], "contracts/RewardClaimVerifier.sol:RewardClaimVerifier");

  // ============================================================
  // 3. Deploy MyntisOFTSpoke
  // ============================================================
  console.log("\n============================================================");
  console.log("3. DEPLOYING MYNTISOFTSPOKE");
  console.log("============================================================");
  
  const MyntisOFTSpoke = await ethers.getContractFactory("MyntisOFTSpoke");
  const spokeToken = await MyntisOFTSpoke.deploy(
    ETH_SEPOLIA_LZ_ENDPOINT,
    deployer.address,
    BASE_SEPOLIA_EID,
    ETH_SEPOLIA_EID
  );
  await spokeToken.waitForDeployment();
  deployed.MyntisOFTSpoke = await spokeToken.getAddress();
  console.log(`✅ MyntisOFTSpoke deployed: ${deployed.MyntisOFTSpoke}`);
  
  await delay(30000);
  await verifyContract(
    deployed.MyntisOFTSpoke, 
    [ETH_SEPOLIA_LZ_ENDPOINT, deployer.address, BASE_SEPOLIA_EID, ETH_SEPOLIA_EID],
    "contracts/MyntisOFTSpoke.sol:MyntisOFTSpoke"
  );

  // ============================================================
  // 4. Deploy SpokeDistributor
  // ============================================================
  console.log("\n============================================================");
  console.log("4. DEPLOYING SPOKEDISTRIBUTOR");
  console.log("============================================================");
  
  const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
  const distributor = await SpokeDistributor.deploy(
    deployed.MyntisOFTSpoke,
    deployer.address
  );
  await distributor.waitForDeployment();
  deployed.SpokeDistributor = await distributor.getAddress();
  console.log(`✅ SpokeDistributor deployed: ${deployed.SpokeDistributor}`);
  
  await delay(30000);
  await verifyContract(
    deployed.SpokeDistributor, 
    [deployed.MyntisOFTSpoke, deployer.address],
    "contracts/SpokeDistributor.sol:SpokeDistributor"
  );

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n================================================================================");
  console.log("SPOKE DEPLOYMENT COMPLETE");
  console.log("================================================================================");
  console.log("\nDeployed Contracts (Ethereum Sepolia):");
  console.log(`  Groth16Verifier:      ${deployed.Groth16Verifier}`);
  console.log(`  RewardClaimVerifier:  ${deployed.RewardClaimVerifier}`);
  console.log(`  MyntisOFTSpoke:       ${deployed.MyntisOFTSpoke}`);
  console.log(`  SpokeDistributor:     ${deployed.SpokeDistributor}`);
  
  console.log("\n📋 Environment Variables:");
  console.log(`ETH_SEPOLIA_MYNTIS_SPOKE=${deployed.MyntisOFTSpoke}`);
  console.log(`ETH_SEPOLIA_SPOKE_DISTRIBUTOR=${deployed.SpokeDistributor}`);
  console.log(`ETH_SEPOLIA_GROTH16_VERIFIER=${deployed.Groth16Verifier}`);
  console.log(`ETH_SEPOLIA_REWARD_CLAIM_VERIFIER=${deployed.RewardClaimVerifier}`);
  
  console.log("\n⚠️ NEXT STEPS:");
  console.log("1. Configure LayerZero peers between hub and spoke");
  console.log("2. Run: npx hardhat run scripts/configure-lz-peers.ts --network base-sepolia");
  
  return deployed;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
