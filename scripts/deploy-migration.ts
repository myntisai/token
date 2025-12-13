import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Full State Contract Migration Deployment Script
 * 
 * Deploys all 7 required contracts in the correct order:
 * 1. Myntis.sol (Hub OFT)
 * 2. Execute balance migration in batches
 * 3. RewardClaimVerifier (stub for ZK)
 * 4. EmissionsContract (with address(0) for staking initially)
 * 5. DualPoolStaking (UUPS Proxy)
 * 6. Update EmissionsContract to point to DualPoolStaking
 * 7. ZKMerkleDistributor
 * 8. LiquidStakingVault
 * 9. GlobalSupplyRegistry
 * 
 * Then configures all contracts with proper roles and connections.
 */

// LayerZero V2 Endpoint
const LAYERZERO_ENDPOINT = process.env.LZ_ENDPOINT_HUB || "0x6EDCE65403992e310A62460808c4b910D972f10f";

// Batch size for migration minting
const MIGRATION_BATCH_SIZE = 100;

interface MigrationDeploymentResult {
    myntis: string;
    rewardClaimVerifier: string;
    emissionsContract: string;
    dualPoolStaking: string;
    dualPoolStakingImpl: string;
    zkMerkleDistributor: string;
    globalNullifier: string;
    liquidStakingVault: string;
    globalSupplyRegistry: string;
    network: string;
    chainId: number;
    deployer: string;
    timestamp: string;
    migrationStats: {
        totalHolders: number;
        totalMigrated: string;
        batchesProcessed: number;
    };
}

interface HolderData {
    address: string;
    balance: string;
    balanceWei: string;
}

interface MigrationSnapshot {
    holders: HolderData[];
    holderCount: number;
    tokenInfo: {
        totalSupply: string;
        totalSupplyWei: string;
    };
    emissions: {
        mintedEmissionsWei: string;
        accountedEmissionsWei: string;
        accRewardPerShare: string;
        lastRewardTime: number;
        providerDebts: { address: string; debtWei: string }[];
    };
}

async function loadSnapshot(): Promise<MigrationSnapshot> {
    const snapshotPath = path.join(__dirname, "migration-snapshot-latest.json");
    if (!fs.existsSync(snapshotPath)) {
        throw new Error(`Snapshot file not found at ${snapshotPath}. Run snapshot-state.ts first.`);
    }
    const data = fs.readFileSync(snapshotPath, "utf-8");
    return JSON.parse(data);
}

async function deployMigration(): Promise<MigrationDeploymentResult> {
    console.log("=".repeat(80));
    console.log("FULL STATE CONTRACT MIGRATION DEPLOYMENT");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);

    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${chainId})`);
    console.log(`LayerZero Endpoint: ${LAYERZERO_ENDPOINT}`);

    // Load snapshot
    console.log(`\n${"=".repeat(80)}`);
    console.log("LOADING MIGRATION SNAPSHOT");
    console.log("=".repeat(80));
    
    const snapshot = await loadSnapshot();
    console.log(`  Holders to migrate: ${snapshot.holderCount}`);
    console.log(`  Total supply: ${snapshot.tokenInfo.totalSupply} MYNT`);

    // ============================================================
    // STEP 1: Deploy Myntis.sol (Hub OFT)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 1: Deploying Myntis.sol (Hub OFT)");
    console.log("=".repeat(80));

    const MyntisFactory = await ethers.getContractFactory("Myntis");
    const myntis = await MyntisFactory.deploy(LAYERZERO_ENDPOINT, deployer.address);
    await myntis.waitForDeployment();
    const myntisAddress = await myntis.getAddress();
    console.log(`  Myntis deployed to: ${myntisAddress}`);

    // ============================================================
    // STEP 2: Execute Balance Migration
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 2: Migrating Token Balances");
    console.log("=".repeat(80));

    const holders = snapshot.holders;
    const totalBatches = Math.ceil(holders.length / MIGRATION_BATCH_SIZE);
    let totalMigrated = 0n;

    console.log(`  Total holders: ${holders.length}`);
    console.log(`  Batch size: ${MIGRATION_BATCH_SIZE}`);
    console.log(`  Total batches: ${totalBatches}`);

    for (let i = 0; i < holders.length; i += MIGRATION_BATCH_SIZE) {
        const batch = holders.slice(i, i + MIGRATION_BATCH_SIZE);
        const batchNum = Math.floor(i / MIGRATION_BATCH_SIZE) + 1;

        const recipients = batch.map(h => h.address);
        const amounts = batch.map(h => BigInt(h.balanceWei));

        console.log(`  Processing batch ${batchNum}/${totalBatches} (${batch.length} holders)...`);

        try {
            const tx = await myntis.migrateMint(recipients, amounts);
            await tx.wait();
            
            const batchTotal = amounts.reduce((sum, a) => sum + a, 0n);
            totalMigrated += batchTotal;
            
            console.log(`    Batch ${batchNum} complete: ${ethers.formatEther(batchTotal)} MYNT`);
        } catch (error: any) {
            console.error(`    ERROR in batch ${batchNum}: ${error.message}`);
            throw error;
        }
    }

    console.log(`\n  Total migrated: ${ethers.formatEther(totalMigrated)} MYNT`);

    // Complete migration
    console.log(`  Completing migration...`);
    const completeTx = await myntis.completeMigration();
    await completeTx.wait();
    console.log(`  Migration completed!`);

    // ============================================================
    // STEP 3: Deploy RewardClaimVerifier (Stub for ZK)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 3: Deploying RewardClaimVerifier (Stub)");
    console.log("=".repeat(80));

    const VerifierFactory = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();
    const verifierAddress = await verifier.getAddress();
    console.log(`  RewardClaimVerifier deployed to: ${verifierAddress}`);

    // ============================================================
    // STEP 4: Deploy EmissionsContract (with address(0) staking)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 4: Deploying EmissionsContract");
    console.log("=".repeat(80));

    const EmissionsFactory = await ethers.getContractFactory("EmissionsContract");
    // Deploy with address(0) for staking - will update after DualPoolStaking deploys
    const emissions = await EmissionsFactory.deploy(
        myntisAddress,
        ethers.ZeroAddress, // Staking will be set later
        deployer.address
    );
    await emissions.waitForDeployment();
    const emissionsAddress = await emissions.getAddress();
    console.log(`  EmissionsContract deployed to: ${emissionsAddress}`);

    // ============================================================
    // STEP 5: Deploy DualPoolStaking (UUPS Proxy)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 5: Deploying DualPoolStaking (UUPS Proxy)");
    console.log("=".repeat(80));

    const StakingFactory = await ethers.getContractFactory("DualPoolStaking");
    const staking = await upgrades.deployProxy(
        StakingFactory,
        [myntisAddress, emissionsAddress, deployer.address],
        { kind: "uups" }
    );
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    const stakingImpl = await upgrades.erc1967.getImplementationAddress(stakingAddress);
    console.log(`  DualPoolStaking proxy deployed to: ${stakingAddress}`);
    console.log(`  DualPoolStaking implementation: ${stakingImpl}`);

    // ============================================================
    // STEP 6: Update EmissionsContract + Initialize Migration State
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 6: Configuring EmissionsContract");
    console.log("=".repeat(80));

    // Set staking contract
    console.log(`  Setting staking contract...`);
    const setStakingTx = await emissions.setStakingContract(stakingAddress);
    await setStakingTx.wait();
    console.log(`  Staking contract set!`);

    // Initialize migration state if we have snapshot data
    if (snapshot.emissions && snapshot.emissions.accRewardPerShare !== "0") {
        console.log(`  Initializing migration state...`);
        
        const providers = snapshot.emissions.providerDebts.map(p => p.address);
        const debts = snapshot.emissions.providerDebts.map(p => BigInt(p.debtWei));

        const initTx = await emissions.initializeMigration(
            BigInt(snapshot.emissions.mintedEmissionsWei),
            BigInt(snapshot.emissions.accountedEmissionsWei),
            BigInt(snapshot.emissions.accRewardPerShare),
            snapshot.emissions.lastRewardTime,
            providers,
            debts
        );
        await initTx.wait();
        console.log(`  Migration state initialized!`);
    } else {
        console.log(`  Skipping migration initialization (no prior state)`);
    }

    // ============================================================
    // STEP 7: Deploy ZKMerkleDistributor
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 7: Deploying ZKMerkleDistributor");
    console.log("=".repeat(80));

    const DistributorFactory = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await DistributorFactory.deploy(
        myntisAddress,
        verifierAddress,
        deployer.address
    );
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log(`  ZKMerkleDistributor deployed to: ${distributorAddress}`);

    // ============================================================
    // STEP 8: Deploy LiquidStakingVault
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 8: Deploying LiquidStakingVault");
    console.log("=".repeat(80));

    const VaultFactory = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await VaultFactory.deploy(
        myntisAddress,
        stakingAddress,
        deployer.address
    );
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log(`  LiquidStakingVault deployed to: ${vaultAddress}`);

    // ============================================================
    // STEP 9: Deploy GlobalNullifier
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 9: Deploying GlobalNullifier");
    console.log("=".repeat(80));

    const GlobalNullifierFactory = await ethers.getContractFactory("GlobalNullifier");
    const globalNullifier = await GlobalNullifierFactory.deploy(deployer.address);
    await globalNullifier.waitForDeployment();
    const globalNullifierAddress = await globalNullifier.getAddress();
    console.log(`  GlobalNullifier deployed to: ${globalNullifierAddress}`);

    // ============================================================
    // STEP 10: Deploy GlobalSupplyRegistry (Optional)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 10: Deploying GlobalSupplyRegistry (Optional)");
    console.log("=".repeat(80));

    const RegistryFactory = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry = await RegistryFactory.deploy(
        LAYERZERO_ENDPOINT,
        deployer.address
    );
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log(`  GlobalSupplyRegistry deployed to: ${registryAddress}`);

    // ============================================================
    // STEP 11: Configure Contracts
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 11: Configuring Contracts");
    console.log("=".repeat(80));

    // Grant MINTER_ROLE to EmissionsContract
    console.log(`  Granting MINTER_ROLE to EmissionsContract...`);
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    await myntis.grantRole(MINTER_ROLE, emissionsAddress);
    console.log(`  MINTER_ROLE granted!`);

    // Configure DualPoolStaking
    console.log(`  Setting LiquidStakingVault on DualPoolStaking...`);
    await staking.setLiquidStakingVault(vaultAddress);
    console.log(`  LiquidStakingVault set!`);

    console.log(`  Setting treasury on DualPoolStaking...`);
    await staking.setTreasury(deployer.address);
    console.log(`  Treasury set to deployer!`);

    // Configure ZKMerkleDistributor
    console.log(`  Granting PROVIDER_ROLE to deployer on ZKMerkleDistributor...`);
    const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
    await distributor.grantRole(PROVIDER_ROLE, deployer.address);
    console.log(`  PROVIDER_ROLE granted!`);

    // Grant DISTRIBUTOR_ROLE to ZKMerkleDistributor on RewardClaimVerifier
    console.log(`  Granting DISTRIBUTOR_ROLE to ZKMerkleDistributor on RewardClaimVerifier...`);
    await verifier.grantDistributorRole(distributorAddress);
    console.log(`  DISTRIBUTOR_ROLE granted!`);

    // Configure GlobalSupplyRegistry
    console.log(`  Registering Myntis token on GlobalSupplyRegistry...`);
    await registry.registerToken(myntisAddress);
    console.log(`  Token registered!`);

    // Set GlobalSupplyRegistry on Myntis
    console.log(`  Setting GlobalSupplyRegistry on Myntis...`);
    await myntis.setGlobalSupplyRegistry(registryAddress);
    console.log(`  GlobalSupplyRegistry set!`);

    // Seed initial supply on registry
    console.log(`  Seeding initial supply on GlobalSupplyRegistry...`);
    const currentSupply = await myntis.totalSupply();
    await registry.seedChainSupply(chainId, currentSupply);
    console.log(`  Initial supply seeded: ${ethers.formatEther(currentSupply)} MYNT`);

    // ============================================================
    // DEPLOYMENT SUMMARY
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(80));
    
    const result: MigrationDeploymentResult = {
        myntis: myntisAddress,
        rewardClaimVerifier: verifierAddress,
        emissionsContract: emissionsAddress,
        dualPoolStaking: stakingAddress,
        dualPoolStakingImpl: stakingImpl,
        zkMerkleDistributor: distributorAddress,
        globalNullifier: globalNullifierAddress,
        liquidStakingVault: vaultAddress,
        globalSupplyRegistry: registryAddress,
        network: network.name,
        chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        migrationStats: {
            totalHolders: holders.length,
            totalMigrated: ethers.formatEther(totalMigrated),
            batchesProcessed: totalBatches
        }
    };

    console.log(`\nContracts Deployed:`);
    console.log(`  1. Myntis:              ${myntisAddress}`);
    console.log(`  2. RewardClaimVerifier: ${verifierAddress}`);
    console.log(`  3. EmissionsContract:   ${emissionsAddress}`);
    console.log(`  4. DualPoolStaking:     ${stakingAddress}`);
    console.log(`     (Implementation):    ${stakingImpl}`);
    console.log(`  5. ZKMerkleDistributor: ${distributorAddress}`);
    console.log(`  6. GlobalNullifier:     ${globalNullifierAddress}`);
    console.log(`  7. LiquidStakingVault:  ${vaultAddress}`);
    console.log(`  8. GlobalSupplyRegistry: ${registryAddress}`);
    
    console.log(`\nMigration Stats:`);
    console.log(`  Holders migrated: ${result.migrationStats.totalHolders}`);
    console.log(`  Total migrated:   ${result.migrationStats.totalMigrated} MYNT`);
    console.log(`  Batches processed: ${result.migrationStats.batchesProcessed}`);

    // Save deployment info
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentDir, `${network.name}-migration-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    console.log(`\nDeployment saved to: ${deploymentFile}`);

    // Also save as latest
    const latestFile = path.join(deploymentDir, `${network.name}-migration-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));
    console.log(`Latest deployment: ${latestFile}`);

    // Generate .env update suggestions
    console.log(`\n${"=".repeat(80)}`);
    console.log("ENV FILE UPDATES REQUIRED");
    console.log("=".repeat(80));
    console.log(`\nAdd these to your .env.prod:`);
    console.log(`\n# New Migration Contracts (${new Date().toISOString().split('T')[0]})`);
    console.log(`MYNTIS_TOKEN_ADDRESS=${myntisAddress}`);
    console.log(`MYNTIS_OFT_ADDRESS=${myntisAddress}`);
    console.log(`STAKING_CONTRACT_ADDRESS=${stakingAddress}`);
    console.log(`EMISSIONS_CONTRACT_ADDRESS=${emissionsAddress}`);
    console.log(`MERKLE_DISTRIBUTOR_ADDRESS=${distributorAddress}`);
    console.log(`REWARD_CLAIM_VERIFIER_ADDRESS=${verifierAddress}`);
    console.log(`GLOBAL_NULLIFIER_ADDRESS=${globalNullifierAddress}`);
    console.log(`LIQUID_STAKING_VAULT_ADDRESS=${vaultAddress}`);
    console.log(`GLOBAL_SUPPLY_REGISTRY_ADDRESS=${registryAddress}`);

    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE");
    console.log("=".repeat(80));
    console.log(`\nNext steps:`);
    console.log(`  1. Update .env.prod with new addresses`);
    console.log(`  2. Run verify-migration.ts to verify all state`);
    console.log(`  3. Close all epochs on old MerkleDistributor`);
    console.log(`  4. Update frontend ABIs and addresses`);
    console.log(`  5. Restart all services`);

    return result;
}

async function main() {
    try {
        const result = await deployMigration();
        console.log("\n✅ Migration deployment completed successfully!");
        process.exit(0);
    } catch (error: any) {
        console.error("\n❌ Migration deployment failed:", error.message);
        if (error.transaction) {
            console.error("Transaction:", error.transaction);
        }
        process.exit(1);
    }
}

main();
