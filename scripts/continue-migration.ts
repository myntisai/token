import { ethers, upgrades } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Continue Migration Script
 * 
 * Continues from where deploy-migration.ts left off.
 * Already deployed:
 * - Myntis: 0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55
 * - RewardClaimVerifier: 0xC24e30632a02950d476d27D2De6Ceb7F2C5E9978
 * - EmissionsContract: 0x39a211De877c74a9e181e2253EDe847bB4eC70cf
 */

const ALREADY_DEPLOYED = {
    myntis: "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55",
    verifier: "0xC24e30632a02950d476d27D2De6Ceb7F2C5E9978",
    emissions: "0x39a211De877c74a9e181e2253EDe847bB4eC70cf"
};

const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

async function main() {
    console.log("=".repeat(80));
    console.log("CONTINUE MIGRATION DEPLOYMENT");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    console.log(`\nAlready deployed:`);
    console.log(`  Myntis: ${ALREADY_DEPLOYED.myntis}`);
    console.log(`  Verifier: ${ALREADY_DEPLOYED.verifier}`);
    console.log(`  Emissions: ${ALREADY_DEPLOYED.emissions}`);

    // Get contract instances
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = Myntis.attach(ALREADY_DEPLOYED.myntis);
    
    const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
    const emissions = EmissionsContract.attach(ALREADY_DEPLOYED.emissions);

    // Verify Myntis state
    console.log(`\n${"=".repeat(80)}`);
    console.log("VERIFYING MYNTIS STATE");
    console.log("=".repeat(80));
    
    const supply = await myntis.totalSupply();
    console.log(`  Total Supply: ${ethers.formatEther(supply)} MYNT`);
    
    const migrationComplete = await myntis.migrationComplete();
    console.log(`  Migration Complete: ${migrationComplete}`);

    // ============================================================
    // STEP 5: Deploy DualPoolStaking (UUPS Proxy)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 5: Deploying DualPoolStaking (UUPS Proxy)");
    console.log("=".repeat(80));

    const StakingFactory = await ethers.getContractFactory("DualPoolStaking");
    
    console.log("  Deploying proxy...");
    const staking = await upgrades.deployProxy(
        StakingFactory,
        [ALREADY_DEPLOYED.myntis, ALREADY_DEPLOYED.emissions, deployer.address],
        { kind: "uups" }
    );
    await staking.waitForDeployment();
    const stakingAddress = await staking.getAddress();
    const stakingImpl = await upgrades.erc1967.getImplementationAddress(stakingAddress);
    console.log(`  DualPoolStaking proxy: ${stakingAddress}`);
    console.log(`  DualPoolStaking impl:  ${stakingImpl}`);

    // ============================================================
    // STEP 6: Update EmissionsContract
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 6: Configuring EmissionsContract");
    console.log("=".repeat(80));

    console.log("  Setting staking contract...");
    const setStakingTx = await emissions.setStakingContract(stakingAddress);
    await setStakingTx.wait();
    console.log("  Staking contract set!");

    // ============================================================
    // STEP 7: Deploy ZKMerkleDistributor
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 7: Deploying ZKMerkleDistributor");
    console.log("=".repeat(80));

    const DistributorFactory = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await DistributorFactory.deploy(
        ALREADY_DEPLOYED.myntis,
        ALREADY_DEPLOYED.verifier,
        deployer.address
    );
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log(`  ZKMerkleDistributor: ${distributorAddress}`);

    // ============================================================
    // STEP 8: Deploy LiquidStakingVault
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 8: Deploying LiquidStakingVault");
    console.log("=".repeat(80));

    const VaultFactory = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await VaultFactory.deploy(
        ALREADY_DEPLOYED.myntis,
        stakingAddress,
        deployer.address
    );
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log(`  LiquidStakingVault: ${vaultAddress}`);

    // ============================================================
    // STEP 9: Deploy GlobalSupplyRegistry
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 9: Deploying GlobalSupplyRegistry");
    console.log("=".repeat(80));

    const RegistryFactory = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry = await RegistryFactory.deploy(
        LZ_ENDPOINT,
        deployer.address
    );
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();
    console.log(`  GlobalSupplyRegistry: ${registryAddress}`);

    // ============================================================
    // STEP 10: Configure All Contracts
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 10: Configuring Contracts");
    console.log("=".repeat(80));

    // Grant MINTER_ROLE to EmissionsContract
    console.log("  Granting MINTER_ROLE to EmissionsContract...");
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    await myntis.grantRole(MINTER_ROLE, ALREADY_DEPLOYED.emissions);
    console.log("  MINTER_ROLE granted!");

    // Configure DualPoolStaking
    console.log("  Setting LiquidStakingVault on DualPoolStaking...");
    await staking.setLiquidStakingVault(vaultAddress);
    console.log("  LiquidStakingVault set!");

    console.log("  Setting treasury on DualPoolStaking...");
    await staking.setTreasury(deployer.address);
    console.log("  Treasury set!");

    // Configure ZKMerkleDistributor
    console.log("  Granting PROVIDER_ROLE to deployer...");
    const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
    await distributor.grantRole(PROVIDER_ROLE, deployer.address);
    console.log("  PROVIDER_ROLE granted!");

    // Grant DISTRIBUTOR_ROLE on verifier
    console.log("  Granting DISTRIBUTOR_ROLE on RewardClaimVerifier...");
    const Verifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = Verifier.attach(ALREADY_DEPLOYED.verifier);
    await verifier.grantDistributorRole(distributorAddress);
    console.log("  DISTRIBUTOR_ROLE granted!");

    // Configure GlobalSupplyRegistry
    console.log("  Registering Myntis on GlobalSupplyRegistry...");
    await registry.registerToken(ALREADY_DEPLOYED.myntis);
    console.log("  Token registered!");

    // Set GlobalSupplyRegistry on Myntis
    console.log("  Setting GlobalSupplyRegistry on Myntis...");
    await myntis.setGlobalSupplyRegistry(registryAddress);
    console.log("  Registry set!");

    // Seed initial supply
    console.log("  Seeding initial supply...");
    const chainId = Number(network.chainId);
    await registry.seedChainSupply(chainId, supply);
    console.log(`  Supply seeded: ${ethers.formatEther(supply)} MYNT`);

    // ============================================================
    // DEPLOYMENT SUMMARY
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE");
    console.log("=".repeat(80));
    
    const result = {
        myntis: ALREADY_DEPLOYED.myntis,
        rewardClaimVerifier: ALREADY_DEPLOYED.verifier,
        emissionsContract: ALREADY_DEPLOYED.emissions,
        dualPoolStaking: stakingAddress,
        dualPoolStakingImpl: stakingImpl,
        zkMerkleDistributor: distributorAddress,
        liquidStakingVault: vaultAddress,
        globalSupplyRegistry: registryAddress,
        network: network.name,
        chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\nContracts Deployed:`);
    console.log(`  1. Myntis:              ${result.myntis}`);
    console.log(`  2. RewardClaimVerifier: ${result.rewardClaimVerifier}`);
    console.log(`  3. EmissionsContract:   ${result.emissionsContract}`);
    console.log(`  4. DualPoolStaking:     ${result.dualPoolStaking}`);
    console.log(`     (Implementation):    ${result.dualPoolStakingImpl}`);
    console.log(`  5. ZKMerkleDistributor: ${result.zkMerkleDistributor}`);
    console.log(`  6. LiquidStakingVault:  ${result.liquidStakingVault}`);
    console.log(`  7. GlobalSupplyRegistry: ${result.globalSupplyRegistry}`);

    // Save deployment
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentDir, `${network.name}-migration-${Date.now()}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(result, null, 2));
    console.log(`\nDeployment saved to: ${deploymentFile}`);

    const latestFile = path.join(deploymentDir, `${network.name}-migration-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));

    // Generate .env updates
    console.log(`\n${"=".repeat(80)}`);
    console.log("ENV FILE UPDATES");
    console.log("=".repeat(80));
    console.log(`\n# Add to .env.prod:`);
    console.log(`MYNTIS_TOKEN_ADDRESS=${result.myntis}`);
    console.log(`MYNTIS_OFT_ADDRESS=${result.myntis}`);
    console.log(`STAKING_CONTRACT_ADDRESS=${result.dualPoolStaking}`);
    console.log(`EMISSIONS_CONTRACT_ADDRESS=${result.emissionsContract}`);
    console.log(`MERKLE_DISTRIBUTOR_ADDRESS=${result.zkMerkleDistributor}`);
    console.log(`REWARD_CLAIM_VERIFIER_ADDRESS=${result.rewardClaimVerifier}`);
    console.log(`LIQUID_STAKING_VAULT_ADDRESS=${result.liquidStakingVault}`);
    console.log(`GLOBAL_SUPPLY_REGISTRY_ADDRESS=${result.globalSupplyRegistry}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
