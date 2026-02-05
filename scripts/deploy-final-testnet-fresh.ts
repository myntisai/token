import { ethers, upgrades, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

/**
 * Comprehensive Final Testnet Deployment Script
 * 
 * This script performs a complete fresh deployment with all security fixes:
 * 
 * Phase 1: Deploy Core Hub Contracts (7 contracts)
 *   - Myntis.sol (Standard OFT contract)
 *   - EmissionsContract.sol (Standard contract)
 *   - DualPoolStaking.sol (UUPS proxy - ONLY upgradeable contract)
 *   - Groth16Verifier.sol (Standard contract)
 *   - ZKMerkleDistributor.sol (Standard contract)
 *   - GlobalSupplyRegistry.sol (Standard contract)
 *   - LiquidStakingVault.sol (Standard ERC-4626 vault)
 * 
 * Phase 2: Configure & Wire Contracts
 *   - Grant all roles (MINTER_ROLE, ADMIN_ROLE, PROVIDER_ROLE)
 *   - Wire contracts together (emissions ↔ staking ↔ distributor)
 *   - Configure LayerZero endpoints
 * 
 * Phase 3: Balance Migration (Optional)
 *   - Snapshot old contract balances
 *   - Batch mint to new contract
 *   - Transfer staked amounts
 * 
 * Phase 4: Verification
 *   - Verify all contracts on Basescan
 *   - DualPoolStaking proxy auto-verified by Hardhat
 * 
 * Phase 5: Generate Environment Variables
 *   - Create updated .env.prod with all addresses
 *   - Save deployment summary JSON
 */

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Configuration
const CONFIG = {
    // Network
    NETWORK: process.env.HARDHAT_NETWORK || "base-sepolia",
    
    // LayerZero V2 Endpoint (Base Sepolia)
    LZ_ENDPOINT: process.env.LZ_ENDPOINT || "0x6EDCE65403992e310A62460808c4b910D972f10f",
    
    // Token Configuration
    TOKEN_CAP: ethers.parseEther("1000000000"), // 1B cap
    TOKEN_MAX_SUPPLY: ethers.parseEther("1000000000"), // 1B max supply
    
    // Migration Configuration (if migrating from old contract)
    MIGRATE_BALANCES: process.env.MIGRATE_BALANCES === "true",
    OLD_TOKEN_ADDRESS: process.env.OLD_TOKEN_ADDRESS || "",
    OLD_STAKING_ADDRESS: process.env.OLD_STAKING_ADDRESS || "",
    
    // Verification
    VERIFY_CONTRACTS: process.env.VERIFY_CONTRACTS !== "false", // Default true
    
    // Batch size for migration
    MIGRATION_BATCH_SIZE: 100,
};

interface DeploymentResult {
    // Core Contracts
    myntis: string;
    myntisImplementation: string;
    emissionsContract: string;
    dualPoolStaking: string;
    dualPoolStakingImplementation: string;
    groth16Verifier: string;
    zkMerkleDistributor: string;
    zkMerkleDistributorImplementation: string;
    globalSupplyRegistry: string;
    liquidStakingVault: string;
    liquidStakingVaultImplementation: string;
    
    // Metadata
    network: string;
    chainId: number;
    deployer: string;
    timestamp: string;
    gasUsed: string;
    
    // Migration Stats (if applicable)
    migrationStats?: {
        totalHolders: number;
        totalMigrated: string;
        batchesProcessed: number;
    };
}

// Utility: Save deployment result
function saveDeploymentResult(result: DeploymentResult) {
    const outputDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `deployment-${result.network}-${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
    console.log(`\n📄 Deployment result saved to: ${filepath}`);
    
    // Also save as "latest"
    const latestPath = path.join(outputDir, `deployment-${result.network}-latest.json`);
    fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));
    console.log(`📄 Latest deployment saved to: ${latestPath}`);
}

// Utility: Generate .env.prod
function generateEnvFile(result: DeploymentResult) {
    const envContent = `# Generated on ${result.timestamp}
# Network: ${result.network} (Chain ID: ${result.chainId})
# Deployer: ${result.deployer}

# Core Token
TOKEN_ADDRESS=${result.myntis}
MYNTIS_TOKEN_ADDRESS=${result.myntis}

# Staking & Emissions
STAKING_CONTRACT_ADDRESS=${result.dualPoolStaking}
DUAL_POOL_STAKING_ADDRESS=${result.dualPoolStaking}
EMISSIONS_CONTRACT_ADDRESS=${result.emissionsContract}

# Distribution
ZK_MERKLE_DISTRIBUTOR_ADDRESS=${result.zkMerkleDistributor}
ZK_MERKLE_DISTRIBUTOR_V2_ADDRESS=${result.zkMerkleDistributor}
GROTH16_VERIFIER_ADDRESS=${result.groth16Verifier}

# Cross-Chain
GLOBAL_SUPPLY_REGISTRY_ADDRESS=${result.globalSupplyRegistry}

# Liquid Staking
LIQUID_STAKING_VAULT_ADDRESS=${result.liquidStakingVault}

# Implementation Addresses (for verification)
MYNTIS_IMPLEMENTATION=${result.myntisImplementation}
STAKING_IMPLEMENTATION=${result.dualPoolStakingImplementation}
DISTRIBUTOR_IMPLEMENTATION=${result.zkMerkleDistributorImplementation}
VAULT_IMPLEMENTATION=${result.liquidStakingVaultImplementation}

# LayerZero
LZ_ENDPOINT=${CONFIG.LZ_ENDPOINT}

# Network
CHAIN_ID=${result.chainId}
NETWORK=${result.network}
`;
    
    const envPath = path.join(__dirname, "../../.env.prod");
    const backupPath = path.join(__dirname, "../../.env.prod.backup");
    
    // Backup existing .env.prod if it exists
    if (fs.existsSync(envPath)) {
        fs.copyFileSync(envPath, backupPath);
        console.log(`\n📋 Backed up existing .env.prod to .env.prod.backup`);
    }
    
    // Write new .env.prod
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Generated new .env.prod with deployment addresses`);
}

// Utility: Verify contract on Basescan
async function verifyContract(address: string, constructorArguments: any[] = []) {
    if (!CONFIG.VERIFY_CONTRACTS) {
        console.log(`  ⏭️  Skipping verification (VERIFY_CONTRACTS=false)`);
        return;
    }
    
    try {
        console.log(`  🔍 Verifying contract at ${address}...`);
        await run("verify:verify", {
            address: address,
            constructorArguments: constructorArguments,
        });
        console.log(`  ✅ Verified!`);
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`  ✅ Already verified`);
        } else {
            console.log(`  ⚠️  Verification failed: ${error.message}`);
        }
    }
}

// Phase 1: Deploy Core Contracts
async function deployCore(deployer: any): Promise<Partial<DeploymentResult>> {
    console.log("\n" + "=".repeat(80));
    console.log("PHASE 1: DEPLOYING CORE CONTRACTS");
    console.log("=".repeat(80));
    
    const result: Partial<DeploymentResult> = {};
    let totalGasUsed = BigInt(0);
    
    // 1. Deploy Myntis (Standard OFT with constructor)
    console.log("\n📦 1/7: Deploying Myntis (Hub Token - OFT)...");
    const MyntisFactory = await ethers.getContractFactory("Myntis");
    const myntis = await MyntisFactory.deploy(
        CONFIG.LZ_ENDPOINT,     // lzEndpoint
        deployer.address        // delegate (admin/owner)
    );
    await myntis.waitForDeployment();
    const deployTx = myntis.deploymentTransaction();
    if (deployTx) {
        await deployTx.wait(2); // Wait for 2 block confirmations
    }
    result.myntis = await myntis.getAddress();
    result.myntisImplementation = result.myntis; // Not a proxy
    console.log(`  ✅ Myntis: ${result.myntis}`);
    
    // 2. Deploy EmissionsContract (non-upgradeable)
    console.log("\n📦 2/7: Deploying EmissionsContract...");
    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    const emissions = await EmissionsFactory.deploy(
        result.myntis,          // token
        ethers.ZeroAddress,     // staking (will be set later)
        deployer.address        // admin
    );
    await emissions.waitForDeployment();
    const emissionsTx = emissions.deploymentTransaction();
    if (emissionsTx) {
        await emissionsTx.wait(1); // Wait for 1 confirmation
    }
    result.emissionsContract = await emissions.getAddress();
    console.log(`  ✅ EmissionsContract: ${result.emissionsContract}`);
    
    // 3. Deploy DualPoolStaking (UUPS Proxy)
    console.log("\n📦 3/7: Deploying DualPoolStaking (UUPS)...");
    const StakingFactory = await ethers.getContractFactory("DualPoolStaking");
    const staking = await upgrades.deployProxy(
        StakingFactory,
        [
            result.myntis,              // token
            result.emissionsContract,   // emissions
            deployer.address            // admin
        ],
        { 
            initializer: "initialize"
            // kind auto-detected from contract
        }
    );
    await staking.waitForDeployment();
    const stakingTx = staking.deploymentTransaction();
    if (stakingTx) {
        await stakingTx.wait(1); // Wait for 1 confirmation
    }
    result.dualPoolStaking = await staking.getAddress();
    result.dualPoolStakingImplementation = await upgrades.erc1967.getImplementationAddress(result.dualPoolStaking);
    console.log(`  ✅ Proxy: ${result.dualPoolStaking}`);
    console.log(`  ✅ Implementation: ${result.dualPoolStakingImplementation}`);
    
    // 4. Deploy Groth16Verifier
    console.log("\n📦 4/7: Deploying Groth16Verifier...");
    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();
    result.groth16Verifier = await verifier.getAddress();
    console.log(`  ✅ Groth16Verifier: ${result.groth16Verifier}`);
    
    // 5. Deploy ZKMerkleDistributor (Standard contract with constructor)
    console.log("\n📦 5/7: Deploying ZKMerkleDistributor...");
    const DistributorFactory = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await DistributorFactory.deploy(
        result.myntis,              // token
        result.groth16Verifier,     // batchVerifier
        deployer.address            // admin
    );
    await distributor.waitForDeployment();
    result.zkMerkleDistributor = await distributor.getAddress();
    result.zkMerkleDistributorImplementation = result.zkMerkleDistributor; // Not a proxy
    console.log(`  ✅ ZKMerkleDistributor: ${result.zkMerkleDistributor}`);
    
    // 6. Deploy GlobalSupplyRegistry
    console.log("\n📦 6/7: Deploying GlobalSupplyRegistry...");
    const RegistryFactory = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry = await RegistryFactory.deploy(
        CONFIG.LZ_ENDPOINT,         // endpoint
        deployer.address            // admin
    );
    await registry.waitForDeployment();
    result.globalSupplyRegistry = await registry.getAddress();
    console.log(`  ✅ GlobalSupplyRegistry: ${result.globalSupplyRegistry}`);
    
    // 7. Deploy LiquidStakingVault (Standard contract with constructor)
    console.log("\n📦 7/7: Deploying LiquidStakingVault...");
    const VaultFactory = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await VaultFactory.deploy(
        result.myntis,              // asset
        result.dualPoolStaking,     // dualPoolStaking
        deployer.address            // admin
    );
    await vault.waitForDeployment();
    result.liquidStakingVault = await vault.getAddress();
    result.liquidStakingVaultImplementation = result.liquidStakingVault; // Not a proxy
    console.log(`  ✅ LiquidStakingVault: ${result.liquidStakingVault}`);
    
    return result;
}

// Phase 2: Configure & Wire Contracts
async function configureContracts(deployer: any, contracts: Partial<DeploymentResult>) {
    console.log("\n" + "=".repeat(80));
    console.log("PHASE 2: CONFIGURING & WIRING CONTRACTS");
    console.log("=".repeat(80));
    
    // Attach to deployed contracts
    const myntis = await ethers.getContractAt("Myntis", contracts.myntis!);
    const emissions = await ethers.getContractAt("EmissionsContract", contracts.emissionsContract!);
    const staking = await ethers.getContractAt("DualPoolStaking", contracts.dualPoolStaking!);
    const distributor = await ethers.getContractAt("ZKMerkleDistributor", contracts.zkMerkleDistributor!);
    const vault = await ethers.getContractAt("LiquidStakingVault", contracts.liquidStakingVault!);
    
    // 1. Configure EmissionsContract → Staking
    console.log("\n⚙️  1/8: Configuring EmissionsContract...");
    console.log("  Setting staking contract...");
    await (await emissions.setStakingContract(contracts.dualPoolStaking!)).wait();
    console.log("  ✅ Done!");
    
    // 2. Configure DualPoolStaking → Distributor
    console.log("\n⚙️  2/8: Configuring DualPoolStaking...");
    console.log("  Setting ZK distributor...");
    await (await staking.setZkMerkleDistributor(contracts.zkMerkleDistributor!)).wait();
    console.log("  ✅ Done!");
    
    // 2b. Configure ZKMerkleDistributor → Staking
    console.log("\n⚙️  2b/8: Configuring ZKMerkleDistributor...");
    console.log("  Setting staking contract...");
    await (await distributor.setStakingContract(contracts.dualPoolStaking!)).wait();
    console.log("  ✅ Done!");
    
    // 3. Grant Myntis Roles
    console.log("\n⚙️  3/8: Granting Myntis roles...");
    const MINTER_ROLE = await myntis.MINTER_ROLE();
    console.log("  Granting MINTER_ROLE to EmissionsContract...");
    await (await myntis.grantRole(MINTER_ROLE, contracts.emissionsContract!)).wait();
    console.log("  ✅ Done!");
    
    // 4. Grant Distributor Roles
    console.log("\n⚙️  4/8: Granting ZKMerkleDistributor roles...");
    const PROVIDER_ROLE = await distributor.PROVIDER_ROLE();
    console.log("  Granting PROVIDER_ROLE to deployer...");
    await (await distributor.grantRole(PROVIDER_ROLE, deployer.address)).wait();
    console.log("  ✅ Done!");
    
    // 5. Configure GlobalSupplyRegistry in Myntis
    console.log("\n⚙️  5/8: Configuring GlobalSupplyRegistry...");
    console.log("  Setting registry in Myntis...");
    await (await myntis.setGlobalSupplyRegistry(contracts.globalSupplyRegistry!)).wait();
    console.log("  ✅ Done!");
    
    // 6. Configure Vault Roles
    console.log("\n⚙️  6/8: Configuring LiquidStakingVault roles...");
    // Vault is already configured with staking address in constructor
    console.log("  ✅ Vault already configured!");
    
    // 7. Emissions parameters (hardcoded in contract)
    console.log("\n⚙️  7/8: Emissions parameters...");
    console.log("  ✅ Emissions rate is hardcoded in contract (3.17 MYNT/sec initial)");
    
    // 8. Summary of Configuration
    console.log("\n⚙️  8/8: Configuration Summary");
    console.log("  ✅ EmissionsContract → DualPoolStaking");
    console.log("  ✅ DualPoolStaking → ZKMerkleDistributor");
    console.log("  ✅ Myntis → GlobalSupplyRegistry");
    console.log("  ✅ EmissionsContract has MINTER_ROLE on Myntis");
    console.log("  ✅ Deployer has PROVIDER_ROLE on ZKMerkleDistributor");
    console.log("  ✅ LiquidStakingVault configured with DualPoolStaking");
}

// Phase 3: Balance Migration (Optional)
async function migrateBalances(deployer: any, contracts: Partial<DeploymentResult>): Promise<any> {
    if (!CONFIG.MIGRATE_BALANCES || !CONFIG.OLD_TOKEN_ADDRESS) {
        console.log("\n⏭️  Skipping balance migration (MIGRATE_BALANCES=false)");
        return null;
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("PHASE 3: MIGRATING BALANCES");
    console.log("=".repeat(80));
    
    console.log("\n📸 Snapshotting old contract balances...");
    
    // TODO: Implement balance snapshot and migration
    // This would involve:
    // 1. Reading old contract state (holders, balances)
    // 2. Batch minting to new contract
    // 3. Transferring staked amounts
    
    console.log("\n⚠️  Migration not yet implemented in this script");
    console.log("Run manual migration scripts if needed");
    
    return {
        totalHolders: 0,
        totalMigrated: "0",
        batchesProcessed: 0,
    };
}

// Phase 4: Verify Contracts
async function verifyContracts(contracts: Partial<DeploymentResult>) {
    console.log("\n" + "=".repeat(80));
    console.log("PHASE 4: VERIFYING CONTRACTS ON BASESCAN");
    console.log("=".repeat(80));
    
    // Wait a bit for Basescan to index the contracts
    console.log("\n⏳ Waiting 30 seconds for Basescan to index...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    const deployer = (await ethers.getSigners())[0];
    
    // Verify Myntis
    console.log("\n🔍 1/7: Verifying Myntis...");
    await verifyContract(contracts.myntis!, [
        CONFIG.LZ_ENDPOINT,
        deployer.address
    ]);
    
    // Verify EmissionsContract
    console.log("\n🔍 2/7: Verifying EmissionsContract...");
    await verifyContract(contracts.emissionsContract!, [
        contracts.myntis,
        ethers.ZeroAddress,
        deployer.address
    ]);
    
    // Verify DualPoolStaking Implementation
    console.log("\n🔍 3/7: Verifying DualPoolStaking Implementation...");
    await verifyContract(contracts.dualPoolStakingImplementation!);
    
    // Verify Groth16Verifier
    console.log("\n🔍 4/7: Verifying Groth16Verifier...");
    await verifyContract(contracts.groth16Verifier!);
    
    // Verify ZKMerkleDistributor
    console.log("\n🔍 5/7: Verifying ZKMerkleDistributor...");
    await verifyContract(contracts.zkMerkleDistributor!, [
        contracts.myntis,
        contracts.groth16Verifier,
        deployer.address
    ]);
    
    // Verify GlobalSupplyRegistry
    console.log("\n🔍 6/7: Verifying GlobalSupplyRegistry...");
    await verifyContract(contracts.globalSupplyRegistry!, [
        CONFIG.LZ_ENDPOINT,
        deployer.address
    ]);
    
    // Verify LiquidStakingVault
    console.log("\n🔍 7/7: Verifying LiquidStakingVault...");
    await verifyContract(contracts.liquidStakingVault!, [
        contracts.myntis,
        contracts.dualPoolStaking,
        deployer.address
    ]);
    
    // Note: DualPoolStaking proxy is automatically verified by Hardhat upgrades plugin
    console.log("\n✅ DualPoolStaking Proxy (auto-verified by Hardhat):");
    console.log(`  Proxy: ${contracts.dualPoolStaking}`);
    console.log(`  Implementation: ${contracts.dualPoolStakingImplementation}`);
    
    console.log("\n🔍 Verification complete!");
}

// Main Deployment Function
async function main() {
    console.log("=".repeat(80));
    console.log("MYNTIS FINAL TESTNET DEPLOYMENT - FRESH START WITH SECURITY FIXES");
    console.log("=".repeat(80));
    
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log(`\n📍 Deployer: ${deployer.address}`);
    console.log(`💰 Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`🌐 Network: ${CONFIG.NETWORK}`);
    console.log(`🔗 Chain ID: ${chainId}`);
    console.log(`📡 LayerZero Endpoint: ${CONFIG.LZ_ENDPOINT}`);
    console.log(`💎 Token Cap: ${ethers.formatEther(CONFIG.TOKEN_CAP)} MYNT`);
    console.log(`🔄 Migrate Balances: ${CONFIG.MIGRATE_BALANCES}`);
    console.log(`✅ Verify Contracts: ${CONFIG.VERIFY_CONTRACTS}`);
    
    const startTime = Date.now();
    
    try {
        // Phase 1: Deploy Core Contracts
        const contracts = await deployCore(deployer);
        
        // Phase 2: Configure & Wire Contracts
        await configureContracts(deployer, contracts);
        
        // Phase 3: Balance Migration (Optional)
        const migrationStats = await migrateBalances(deployer, contracts);
        
        // Phase 4: Verify Contracts
        await verifyContracts(contracts);
        
        // Prepare final result
        const endTime = Date.now();
        const deploymentTime = ((endTime - startTime) / 1000).toFixed(2);
        
        const result: DeploymentResult = {
            ...contracts as Required<typeof contracts>,
            network: CONFIG.NETWORK,
            chainId: chainId,
            deployer: deployer.address,
            timestamp: new Date().toISOString(),
            gasUsed: "0", // TODO: Track actual gas used
            migrationStats: migrationStats || undefined,
        };
        
        // Phase 5: Save Results & Generate Env File
        console.log("\n" + "=".repeat(80));
        console.log("PHASE 5: SAVING DEPLOYMENT RESULTS");
        console.log("=".repeat(80));
        
        saveDeploymentResult(result);
        generateEnvFile(result);
        
        // Final Summary
        console.log("\n" + "=".repeat(80));
        console.log("✅ DEPLOYMENT COMPLETE!");
        console.log("=".repeat(80));
        console.log(`\n⏱️  Total Time: ${deploymentTime}s`);
        console.log(`\n📋 Contract Addresses:`);
        console.log(`  Myntis: ${result.myntis}`);
        console.log(`  DualPoolStaking: ${result.dualPoolStaking}`);
        console.log(`  EmissionsContract: ${result.emissionsContract}`);
        console.log(`  ZKMerkleDistributor: ${result.zkMerkleDistributor}`);
        console.log(`  GlobalSupplyRegistry: ${result.globalSupplyRegistry}`);
        console.log(`  LiquidStakingVault: ${result.liquidStakingVault}`);
        console.log(`  Groth16Verifier: ${result.groth16Verifier}`);
        
        console.log(`\n🔗 View on Basescan:`);
        const basescanUrl = chainId === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
        console.log(`  Myntis: ${basescanUrl}/address/${result.myntis}#code`);
        console.log(`  Staking: ${basescanUrl}/address/${result.dualPoolStaking}#code`);
        console.log(`  Distributor: ${basescanUrl}/address/${result.zkMerkleDistributor}#code`);
        
        console.log(`\n📄 Deployment files saved to: ./deployments/`);
        console.log(`📋 Environment variables updated: ../../.env.prod`);
        
        console.log("\n" + "=".repeat(80));
        console.log("Next Steps:");
        console.log("1. Update claim-generation-service with new addresses");
        console.log("2. Update frontend .env with new distributor address");
        console.log("3. Test staking flow on testnet");
        console.log("4. Test distribution flow on testnet");
        console.log("5. Deploy spoke contracts (if needed)");
        console.log("=".repeat(80));
        
    } catch (error) {
        console.error("\n❌ Deployment failed:", error);
        process.exit(1);
    }
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
