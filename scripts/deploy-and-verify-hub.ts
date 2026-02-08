import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();
import { assertEndpointMatchesNetwork, getLzEndpointV2 } from "./layerzero";

/**
 * Deploy and Verify Hub Contracts
 * 
 * This script deploys all hub contracts on Base Sepolia and verifies each one
 * immediately after deployment to prevent bytecode drift issues.
 * 
 * Deployment order:
 * 1. Groth16Verifier (ZK verifier - no dependencies)
 * 2. RewardClaimVerifier (wraps Groth16Verifier)
 * 3. GlobalSupplyRegistry (supply tracking)
 * 4. Myntis (Hub OFT token)
 * 5. DualPoolStaking (UUPS proxy)
 * 6. EmissionsContract (mints to staking)
 * 7. LiquidStakingVault (ERC-4626 vault)
 * 8. ZKMerkleDistributor (claim distribution)
 * 9. RewardWeightingRegistry (UUPS proxy)
 */

// LayerZero V2 Endpoint (selected by network; can be overridden with LZ_ENDPOINT env var)
const LZ_ENDPOINT = getLzEndpointV2(network.name);

// Delay for block confirmations before verification
const CONFIRMATION_DELAY_MS = 30000;

interface DeployedContracts {
  groth16Verifier: string;
  rewardClaimVerifier: string;
  globalSupplyRegistry: string;
  myntis: string;
  dualPoolStaking: string;
  dualPoolStakingImpl: string;
  emissionsContract: string;
  liquidStakingVault: string;
  zkMerkleDistributor: string;
  rewardWeightingRegistry: string;
  rewardWeightingRegistryImpl: string;
}

async function delay(ms: number): Promise<void> {
  console.log(`⏳ Waiting ${ms / 1000} seconds for block confirmations...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyContract(
  address: string,
  constructorArgs: any[],
  contractName?: string
): Promise<void> {
  console.log(`\n🔍 Verifying ${contractName || address}...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
      contract: contractName,
    });
    console.log(`✅ Verified: ${address}`);
  } catch (error: any) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      console.log(`✅ Already verified: ${address}`);
    } else {
      console.error(`❌ Verification failed: ${error.message}`);
      console.log(`   Manual command: npx hardhat verify --network base-sepolia ${address} ${constructorArgs.join(" ")}`);
    }
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("MYNTIS HUB DEPLOYMENT WITH VERIFICATION");
  console.log("=".repeat(80));

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log(`\nNetwork: ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`LZ Endpoint: ${LZ_ENDPOINT}`);
  assertEndpointMatchesNetwork(network.name, LZ_ENDPOINT);

  const deployed: Partial<DeployedContracts> = {};

  // ============================================================
  // 1. Deploy Groth16Verifier
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("1. DEPLOYING GROTH16VERIFIER");
  console.log("=".repeat(60));

  const Groth16Verifier = await ethers.getContractFactory("Groth16Verifier");
  const groth16Verifier = await Groth16Verifier.deploy();
  await groth16Verifier.waitForDeployment();
  deployed.groth16Verifier = await groth16Verifier.getAddress();
  console.log(`✅ Groth16Verifier deployed: ${deployed.groth16Verifier}`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(deployed.groth16Verifier, [], "contracts/RewardClaimVerifier_generated.sol:Groth16Verifier");

  // ============================================================
  // 2. Deploy RewardClaimVerifier
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("2. DEPLOYING REWARDCLAIMVERIFIER");
  console.log("=".repeat(60));

  const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
  const rewardClaimVerifier = await RewardClaimVerifier.deploy();
  await rewardClaimVerifier.waitForDeployment();
  deployed.rewardClaimVerifier = await rewardClaimVerifier.getAddress();
  console.log(`✅ RewardClaimVerifier deployed: ${deployed.rewardClaimVerifier}`);

  // Configure Groth16Verifier
  await rewardClaimVerifier.setVerifierContract(deployed.groth16Verifier);
  console.log(`✅ Groth16Verifier set in RewardClaimVerifier`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(deployed.rewardClaimVerifier, [], "contracts/RewardClaimVerifier.sol:RewardClaimVerifier");

  // ============================================================
  // 3. Deploy GlobalSupplyRegistry
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("3. DEPLOYING GLOBALSUPPLYREGISTRY");
  console.log("=".repeat(60));

  const GlobalSupplyRegistry = await ethers.getContractFactory("GlobalSupplyRegistry");
  const globalSupplyRegistry = await GlobalSupplyRegistry.deploy(LZ_ENDPOINT, deployer.address);
  await globalSupplyRegistry.waitForDeployment();
  deployed.globalSupplyRegistry = await globalSupplyRegistry.getAddress();
  console.log(`✅ GlobalSupplyRegistry deployed: ${deployed.globalSupplyRegistry}`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(deployed.globalSupplyRegistry, [LZ_ENDPOINT, deployer.address], "contracts/GlobalSupplyRegistry.sol:GlobalSupplyRegistry");

  // ============================================================
  // 4. Deploy Myntis (Hub OFT)
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("4. DEPLOYING MYNTIS (HUB OFT)");
  console.log("=".repeat(60));

  const Myntis = await ethers.getContractFactory("Myntis");
  const myntis = await Myntis.deploy(LZ_ENDPOINT, deployer.address);
  await myntis.waitForDeployment();
  deployed.myntis = await myntis.getAddress();
  console.log(`✅ Myntis deployed: ${deployed.myntis}`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(deployed.myntis, [LZ_ENDPOINT, deployer.address], "contracts/Myntis.sol:Myntis");

  // ============================================================
  // 5. Deploy EmissionsContract FIRST (with stakingContract = address(0))
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("5. DEPLOYING EMISSIONSCONTRACT (First - staking will be set later)");
  console.log("=".repeat(60));

  const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
  // Deploy with stakingContract = address(0) initially - will set via setStakingContract() later
  const emissionsContract = await EmissionsContract.deploy(
    deployed.myntis,
    ethers.ZeroAddress,  // stakingContract - set to zero initially
    deployer.address
  );
  await emissionsContract.waitForDeployment();
  deployed.emissionsContract = await emissionsContract.getAddress();
  console.log(`✅ EmissionsContract deployed: ${deployed.emissionsContract}`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(
    deployed.emissionsContract,
    [deployed.myntis, ethers.ZeroAddress, deployer.address],
    "contracts/EmissionsContract.sol:EmissionsContract"
  );

  // ============================================================
  // 6. Deploy DualPoolStaking (UUPS Proxy) with EmissionsContract
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("6. DEPLOYING DUALPOOLSTAKING (UUPS PROXY)");
  console.log("=".repeat(60));

  // Deploy implementation
  const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
  const dualPoolStakingImpl = await DualPoolStaking.deploy();
  await dualPoolStakingImpl.waitForDeployment();
  deployed.dualPoolStakingImpl = await dualPoolStakingImpl.getAddress();
  console.log(`✅ DualPoolStaking Implementation: ${deployed.dualPoolStakingImpl}`);

  // Encode initialize call with 3 arguments: token, emissionsContract, admin
  const dualPoolStakingInitData = DualPoolStaking.interface.encodeFunctionData("initialize", [
    deployed.myntis,
    deployed.emissionsContract,
    deployer.address
  ]);

  // Deploy proxy using ERC1967Proxy (since DualPoolStaking uses UUPS pattern)
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const dualPoolStakingProxy = await ERC1967Proxy.deploy(
    deployed.dualPoolStakingImpl,
    dualPoolStakingInitData
  );
  await dualPoolStakingProxy.waitForDeployment();
  deployed.dualPoolStaking = await dualPoolStakingProxy.getAddress();
  console.log(`✅ DualPoolStaking Proxy: ${deployed.dualPoolStaking}`);

  await delay(CONFIRMATION_DELAY_MS);
  
  // Verify implementation
  await verifyContract(deployed.dualPoolStakingImpl, [], "contracts/DualPoolStaking.sol:DualPoolStaking");

  // NOW set the staking contract on EmissionsContract
  console.log("\n📌 Setting staking contract on EmissionsContract...");
  await emissionsContract.setStakingContract(deployed.dualPoolStaking);
  console.log(`✅ StakingContract set on EmissionsContract`);

  // ============================================================
  // 7. Deploy LiquidStakingVault (needs Myntis and DualPoolStaking)
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("7. DEPLOYING LIQUIDSTAKINGVAULT");
  console.log("=".repeat(60));

  const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
  const liquidStakingVault = await LiquidStakingVault.deploy(
    deployed.myntis,
    deployed.dualPoolStaking,
    deployer.address
  );
  await liquidStakingVault.waitForDeployment();
  deployed.liquidStakingVault = await liquidStakingVault.getAddress();
  console.log(`✅ LiquidStakingVault deployed: ${deployed.liquidStakingVault}`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(
    deployed.liquidStakingVault,
    [deployed.myntis, deployed.dualPoolStaking, deployer.address],
    "contracts/LiquidStakingVault.sol:LiquidStakingVault"
  );

  // ============================================================
  // 8. Deploy ZKMerkleDistributor
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("8. DEPLOYING ZKMERKLEDISTRIBUTOR");
  console.log("=".repeat(60));

  const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
  const zkMerkleDistributor = await ZKMerkleDistributor.deploy(
    deployed.myntis,
    deployed.rewardClaimVerifier,
    deployer.address
  );
  await zkMerkleDistributor.waitForDeployment();
  deployed.zkMerkleDistributor = await zkMerkleDistributor.getAddress();
  console.log(`✅ ZKMerkleDistributor deployed: ${deployed.zkMerkleDistributor}`);

  await delay(CONFIRMATION_DELAY_MS);
  await verifyContract(
    deployed.zkMerkleDistributor,
    [deployed.myntis, deployed.rewardClaimVerifier, deployer.address],
    "contracts/ZKMerkleDistributor.sol:ZKMerkleDistributor"
  );

  // ============================================================
  // 9. Deploy RewardWeightingRegistry (UUPS Proxy)
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("9. DEPLOYING REWARDWEIGHTINGREGISTRY (UUPS PROXY)");
  console.log("=".repeat(60));

  // Deploy implementation
  const RewardWeightingRegistry = await ethers.getContractFactory("RewardWeightingRegistry");
  const rewardWeightingRegistryImpl = await RewardWeightingRegistry.deploy();
  await rewardWeightingRegistryImpl.waitForDeployment();
  deployed.rewardWeightingRegistryImpl = await rewardWeightingRegistryImpl.getAddress();
  console.log(`✅ RewardWeightingRegistry Implementation: ${deployed.rewardWeightingRegistryImpl}`);

  // Encode initialize call
  const rewardWeightingRegistryInitData = RewardWeightingRegistry.interface.encodeFunctionData("initialize", [
    deployer.address
  ]);

  // Deploy proxy
  const rewardWeightingRegistryProxy = await ERC1967Proxy.deploy(
    deployed.rewardWeightingRegistryImpl,
    rewardWeightingRegistryInitData
  );
  await rewardWeightingRegistryProxy.waitForDeployment();
  deployed.rewardWeightingRegistry = await rewardWeightingRegistryProxy.getAddress();
  console.log(`✅ RewardWeightingRegistry Proxy: ${deployed.rewardWeightingRegistry}`);

  await delay(CONFIRMATION_DELAY_MS);
  
  // Verify implementation
  await verifyContract(deployed.rewardWeightingRegistryImpl, [], "contracts/RewardWeightingRegistry.sol:RewardWeightingRegistry");

  // ============================================================
  // WIRING CONTRACTS
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("WIRING CONTRACTS TOGETHER");
  console.log("=".repeat(60));

  // Get contract instances
  const myntisContract = Myntis.attach(deployed.myntis);
  const dualPoolStakingContract = DualPoolStaking.attach(deployed.dualPoolStaking);

  // 1. Grant MINTER_ROLE to EmissionsContract on Myntis
  console.log("\n📌 Granting MINTER_ROLE to EmissionsContract...");
  const MINTER_ROLE = await myntisContract.MINTER_ROLE();
  await myntisContract.grantRole(MINTER_ROLE, deployed.emissionsContract);
  console.log(`✅ MINTER_ROLE granted to EmissionsContract`);

  // 2. Set EmissionsContract in DualPoolStaking
  console.log("\n📌 Setting EmissionsContract in DualPoolStaking...");
  await dualPoolStakingContract.setEmissionsContract(deployed.emissionsContract);
  console.log(`✅ EmissionsContract set in DualPoolStaking`);

  // 3. Set LiquidStakingVault in DualPoolStaking
  console.log("\n📌 Setting LiquidStakingVault in DualPoolStaking...");
  await dualPoolStakingContract.setLiquidStakingVault(deployed.liquidStakingVault);
  console.log(`✅ LiquidStakingVault set in DualPoolStaking`);

  // 4. Set ZKMerkleDistributor in DualPoolStaking
  console.log("\n📌 Setting ZKMerkleDistributor in DualPoolStaking...");
  await dualPoolStakingContract.setZKMerkleDistributor(deployed.zkMerkleDistributor);
  console.log(`✅ ZKMerkleDistributor set in DualPoolStaking`);

  // 5. Grant PROVIDER_ROLE to deployer in ZKMerkleDistributor
  console.log("\n📌 Granting PROVIDER_ROLE to deployer in ZKMerkleDistributor...");
  const zkDistributor = ZKMerkleDistributor.attach(deployed.zkMerkleDistributor);
  const PROVIDER_ROLE = await zkDistributor.PROVIDER_ROLE();
  await zkDistributor.grantRole(PROVIDER_ROLE, deployer.address);
  console.log(`✅ PROVIDER_ROLE granted to deployer`);

  // 6. Grant DISTRIBUTOR_ROLE to ZKMerkleDistributor in RewardClaimVerifier
  console.log("\n📌 Granting DISTRIBUTOR_ROLE to ZKMerkleDistributor...");
  await rewardClaimVerifier.grantDistributorRole(deployed.zkMerkleDistributor);
  console.log(`✅ DISTRIBUTOR_ROLE granted to ZKMerkleDistributor`);

  // 7. Set GlobalSupplyRegistry on Myntis
  console.log("\n📌 Setting GlobalSupplyRegistry on Myntis...");
  await myntisContract.setGlobalSupplyRegistry(deployed.globalSupplyRegistry);
  console.log(`✅ GlobalSupplyRegistry set on Myntis`);

  // ============================================================
  // SAVE DEPLOYMENT ADDRESSES
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));

  const deployment = {
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployed as DeployedContracts
  };

  console.log("\n📋 Deployed Contracts:");
  console.log(`  Groth16Verifier:          ${deployed.groth16Verifier}`);
  console.log(`  RewardClaimVerifier:      ${deployed.rewardClaimVerifier}`);
  console.log(`  GlobalSupplyRegistry:     ${deployed.globalSupplyRegistry}`);
  console.log(`  Myntis (Hub OFT):         ${deployed.myntis}`);
  console.log(`  DualPoolStaking (Proxy):  ${deployed.dualPoolStaking}`);
  console.log(`  DualPoolStaking (Impl):   ${deployed.dualPoolStakingImpl}`);
  console.log(`  EmissionsContract:        ${deployed.emissionsContract}`);
  console.log(`  LiquidStakingVault:       ${deployed.liquidStakingVault}`);
  console.log(`  ZKMerkleDistributor:      ${deployed.zkMerkleDistributor}`);
  console.log(`  RewardWeightingRegistry:  ${deployed.rewardWeightingRegistry}`);
  console.log(`  RewardWeightingReg (Impl):${deployed.rewardWeightingRegistryImpl}`);

  // Save to file
  const filename = `deployments/hub-deployment-${Date.now()}.json`;
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Deployment saved to: ${filename}`);

  // Save latest
  fs.writeFileSync("deployments/hub-latest.json", JSON.stringify(deployment, null, 2));
  console.log(`💾 Latest deployment: deployments/hub-latest.json`);

  // Print env vars for easy copy
  console.log("\n" + "=".repeat(60));
  console.log("ENVIRONMENT VARIABLES (copy to .env.prod)");
  console.log("=".repeat(60));
  console.log(`
# Hub Contracts (Base Sepolia) - ${new Date().toISOString()}
MYNTIS_TOKEN_ADDRESS=${deployed.myntis}
ZK_MERKLE_DISTRIBUTOR_ADDRESS=${deployed.zkMerkleDistributor}
STAKING_CONTRACT_ADDRESS=${deployed.dualPoolStaking}
EMISSIONS_CONTRACT_ADDRESS=${deployed.emissionsContract}
LIQUID_STAKING_VAULT_ADDRESS=${deployed.liquidStakingVault}
GLOBAL_SUPPLY_REGISTRY_ADDRESS=${deployed.globalSupplyRegistry}
REWARD_CLAIM_VERIFIER_ADDRESS=${deployed.rewardClaimVerifier}
REWARD_WEIGHTING_REGISTRY_ADDRESS=${deployed.rewardWeightingRegistry}
GROTH16_VERIFIER_ADDRESS=${deployed.groth16Verifier}
PROVIDER_ADDRESS=${deployer.address}
MERKLE_DISTRIBUTOR_ADDRESS=${deployed.zkMerkleDistributor}
`);

  console.log("\n🎉 Hub deployment complete!");
  console.log("\nNext steps:");
  console.log("  1. Deploy spoke contracts on Ethereum Sepolia");
  console.log("  2. Configure LayerZero peers between hub and spoke");
  console.log("  3. Run balance migration");
  console.log("  4. Set contractURI for token metadata");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
