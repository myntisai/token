import { ethers, run } from "hardhat";

// Hub contract addresses
const HUB_MYNTIS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";

// Existing verifiers (no need to redeploy)
const EXISTING_GROTH16_VERIFIER = "0x750B47229257df099060264181AaED395f8a1fd6";
const EXISTING_REWARD_CLAIM_VERIFIER = "0xC28C3Dc544bB2ad2C6CFDA287AbcD14c2b305c76";

// LayerZero configuration
const ETH_SEPOLIA_LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const BASE_SEPOLIA_EID = 40245;
const ETH_SEPOLIA_EID = 40161;

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
    return false;
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("================================================================================");
  console.log("MYNTIS SPOKE REDEPLOYMENT (ETHEREUM SEPOLIA)");
  console.log("================================================================================");
  console.log("This script redeploys MyntisOFTSpoke with MINTER_ROLE support");
  console.log();
  console.log(`Network: ethereum-sepolia (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  console.log(`LZ Endpoint: ${ETH_SEPOLIA_LZ_ENDPOINT}`);
  console.log(`Hub Chain EID: ${BASE_SEPOLIA_EID}`);
  console.log();
  console.log("Using existing verifiers:");
  console.log(`  Groth16Verifier:      ${EXISTING_GROTH16_VERIFIER}`);
  console.log(`  RewardClaimVerifier:  ${EXISTING_REWARD_CLAIM_VERIFIER}`);
  console.log();

  const deployed: Record<string, string> = {
    Groth16Verifier: EXISTING_GROTH16_VERIFIER,
    RewardClaimVerifier: EXISTING_REWARD_CLAIM_VERIFIER,
  };

  // ============================================================
  // 1. Deploy MyntisOFTSpoke (with MINTER_ROLE support)
  // ============================================================
  console.log("============================================================");
  console.log("1. DEPLOYING MYNTISOFTSPOKE (with MINTER_ROLE)");
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
  // 2. Deploy SpokeDistributor
  // ============================================================
  console.log("\n============================================================");
  console.log("2. DEPLOYING SPOKEDISTRIBUTOR");
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
  // 3. Grant MINTER_ROLE to SpokeDistributor
  // ============================================================
  console.log("\n============================================================");
  console.log("3. GRANTING MINTER_ROLE TO SPOKEDISTRIBUTOR");
  console.log("============================================================");
  
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const grantTx = await spokeToken.grantRole(MINTER_ROLE, deployed.SpokeDistributor);
  await grantTx.wait();
  console.log(`✅ MINTER_ROLE granted to SpokeDistributor`);
  
  // Verify
  const hasMinter = await spokeToken.hasRole(MINTER_ROLE, deployed.SpokeDistributor);
  console.log(`   Verified: ${hasMinter}`);

  // ============================================================
  // 4. Grant PROVIDER_ROLE to deployer on SpokeDistributor
  // ============================================================
  console.log("\n============================================================");
  console.log("4. GRANTING PROVIDER_ROLE TO DEPLOYER");
  console.log("============================================================");
  
  const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
  const providerTx = await distributor.grantRole(PROVIDER_ROLE, deployer.address);
  await providerTx.wait();
  console.log(`✅ PROVIDER_ROLE granted to deployer`);
  
  // Verify
  const hasProvider = await distributor.hasRole(PROVIDER_ROLE, deployer.address);
  console.log(`   Verified: ${hasProvider}`);

  // ============================================================
  // 5. Configure LayerZero peer on spoke -> hub
  // ============================================================
  console.log("\n============================================================");
  console.log("5. CONFIGURING LAYERZERO PEER (SPOKE -> HUB)");
  console.log("============================================================");
  
  const hubPeerBytes32 = ethers.zeroPadValue(HUB_MYNTIS, 32);
  console.log(`Setting peer for EID ${BASE_SEPOLIA_EID}: ${hubPeerBytes32}`);
  
  const setPeerTx = await spokeToken.setPeer(BASE_SEPOLIA_EID, hubPeerBytes32);
  await setPeerTx.wait();
  console.log(`✅ Peer set on spoke`);
  
  // Verify
  await delay(2000);
  const peer = await spokeToken.peers(BASE_SEPOLIA_EID);
  console.log(`   Verified peer: ${peer}`);

  // ============================================================
  // 6. Set enforced options on spoke
  // ============================================================
  console.log("\n============================================================");
  console.log("6. SETTING ENFORCED OPTIONS ON SPOKE");
  console.log("============================================================");
  
  // LZ v2 Options: version 3, executor (01), size 17 (0011), lzReceive (01), gas 200k
  const enforcedOptions = "0x00030100110100000000000000000000000000030d40";
  
  const setOptsTx = await spokeToken.setEnforcedOptions([
    { eid: BASE_SEPOLIA_EID, msgType: 1, options: enforcedOptions },
    { eid: BASE_SEPOLIA_EID, msgType: 2, options: enforcedOptions }
  ]);
  await setOptsTx.wait();
  console.log(`✅ Enforced options set`);

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n================================================================================");
  console.log("SPOKE REDEPLOYMENT COMPLETE");
  console.log("================================================================================");
  console.log("\nDeployed Contracts (Ethereum Sepolia):");
  console.log(`  MyntisOFTSpoke:       ${deployed.MyntisOFTSpoke}`);
  console.log(`  SpokeDistributor:     ${deployed.SpokeDistributor}`);
  console.log("\nExisting Contracts (unchanged):");
  console.log(`  Groth16Verifier:      ${deployed.Groth16Verifier}`);
  console.log(`  RewardClaimVerifier:  ${deployed.RewardClaimVerifier}`);
  
  console.log("\n📋 Environment Variables:");
  console.log(`ETH_SEPOLIA_MYNTIS_SPOKE=${deployed.MyntisOFTSpoke}`);
  console.log(`ETH_SEPOLIA_SPOKE_DISTRIBUTOR=${deployed.SpokeDistributor}`);
  
  console.log("\n⚠️ NEXT STEPS:");
  console.log("1. Update hub peer to point to NEW spoke:");
  console.log(`   Run on Base Sepolia:`);
  console.log(`   hub.setPeer(${ETH_SEPOLIA_EID}, "${ethers.zeroPadValue(deployed.MyntisOFTSpoke, 32)}")`);
  console.log();
  console.log("2. Update .env.prod and CONTRACT_DEPLOYMENT_HISTORY.md");
  console.log();
  console.log("3. Test bridge and claim flow");
  
  return deployed;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
