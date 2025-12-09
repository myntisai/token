import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Continue Migration Script v3
 * 
 * Uses SimpleProxy contract directly to avoid OZ upgrades plugin RPC issues.
 */

const ALREADY_DEPLOYED = {
    myntis: "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55",
    verifier: "0xC24e30632a02950d476d27D2De6Ceb7F2C5E9978",
    emissions: "0x39a211De877c74a9e181e2253EDe847bB4eC70cf",
    stakingImpl: "0x425DA859900706E8E40eB09276BBDeB2eea4be21" // Already deployed impl
};

const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

async function main() {
    console.log("=".repeat(80));
    console.log("CONTINUE MIGRATION v3 (SimpleProxy)");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

    // Get contract factories
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = Myntis.attach(ALREADY_DEPLOYED.myntis);
    
    const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
    const emissions = EmissionsContract.attach(ALREADY_DEPLOYED.emissions);
    
    const StakingFactory = await ethers.getContractFactory("DualPoolStaking");

    const supply = await myntis.totalSupply();
    console.log(`\nMyntis Supply: ${ethers.formatEther(supply)} MYNT`);

    // ============================================================
    // STEP 5: Deploy DualPoolStaking Proxy using SimpleProxy
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 5: Deploying DualPoolStaking Proxy");
    console.log("=".repeat(80));

    console.log(`  Using existing implementation: ${ALREADY_DEPLOYED.stakingImpl}`);

    // Encode initialize call
    const initData = StakingFactory.interface.encodeFunctionData("initialize", [
        ALREADY_DEPLOYED.myntis,
        ALREADY_DEPLOYED.emissions,
        deployer.address
    ]);
    console.log(`  Initialize data prepared`);

    // Deploy SimpleProxy
    console.log("  Deploying SimpleProxy...");
    const SimpleProxyFactory = await ethers.getContractFactory("SimpleProxy");
    const proxy = await SimpleProxyFactory.deploy(ALREADY_DEPLOYED.stakingImpl, initData);
    await proxy.waitForDeployment();
    const stakingAddress = await proxy.getAddress();
    console.log(`  Proxy deployed to: ${stakingAddress}`);

    // Attach staking interface
    const staking = StakingFactory.attach(stakingAddress);

    // Verify
    try {
        const token = await staking.token();
        console.log(`  Verified: token = ${token}`);
    } catch (e) {
        console.log(`  Note: Verification will be done separately`);
    }

    // ============================================================
    // STEP 6: Configure EmissionsContract
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 6: Configuring EmissionsContract");
    console.log("=".repeat(80));

    console.log("  Setting staking contract...");
    await (await emissions.setStakingContract(stakingAddress)).wait();
    console.log("  Done!");

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

    // Grant MINTER_ROLE
    console.log("  Granting MINTER_ROLE to EmissionsContract...");
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    await (await myntis.grantRole(MINTER_ROLE, ALREADY_DEPLOYED.emissions)).wait();
    console.log("  Done!");

    // Configure DualPoolStaking
    console.log("  Setting LiquidStakingVault on DualPoolStaking...");
    await (await staking.setLiquidStakingVault(vaultAddress)).wait();
    console.log("  Done!");

    console.log("  Setting treasury...");
    await (await staking.setTreasury(deployer.address)).wait();
    console.log("  Done!");

    // Configure ZKMerkleDistributor
    console.log("  Granting PROVIDER_ROLE...");
    const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
    await (await distributor.grantRole(PROVIDER_ROLE, deployer.address)).wait();
    console.log("  Done!");

    // Grant DISTRIBUTOR_ROLE
    console.log("  Granting DISTRIBUTOR_ROLE on verifier...");
    const Verifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = Verifier.attach(ALREADY_DEPLOYED.verifier);
    await (await verifier.grantDistributorRole(distributorAddress)).wait();
    console.log("  Done!");

    // Configure GlobalSupplyRegistry
    console.log("  Registering token on registry...");
    await (await registry.registerToken(ALREADY_DEPLOYED.myntis)).wait();
    console.log("  Done!");

    console.log("  Setting registry on Myntis...");
    await (await myntis.setGlobalSupplyRegistry(registryAddress)).wait();
    console.log("  Done!");

    console.log("  Seeding initial supply...");
    await (await registry.seedChainSupply(chainId, supply)).wait();
    console.log(`  Done! Seeded ${ethers.formatEther(supply)} MYNT`);

    // ============================================================
    // SAVE RESULTS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE!");
    console.log("=".repeat(80));
    
    const result = {
        myntis: ALREADY_DEPLOYED.myntis,
        rewardClaimVerifier: ALREADY_DEPLOYED.verifier,
        emissionsContract: ALREADY_DEPLOYED.emissions,
        dualPoolStaking: stakingAddress,
        dualPoolStakingImpl: ALREADY_DEPLOYED.stakingImpl,
        zkMerkleDistributor: distributorAddress,
        liquidStakingVault: vaultAddress,
        globalSupplyRegistry: registryAddress,
        network: network.name,
        chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\n📋 All Deployed Contracts:`);
    console.log(`  1. Myntis (OFT):         ${result.myntis}`);
    console.log(`  2. RewardClaimVerifier:  ${result.rewardClaimVerifier}`);
    console.log(`  3. EmissionsContract:    ${result.emissionsContract}`);
    console.log(`  4. DualPoolStaking:      ${result.dualPoolStaking}`);
    console.log(`     (Implementation):     ${result.dualPoolStakingImpl}`);
    console.log(`  5. ZKMerkleDistributor:  ${result.zkMerkleDistributor}`);
    console.log(`  6. LiquidStakingVault:   ${result.liquidStakingVault}`);
    console.log(`  7. GlobalSupplyRegistry: ${result.globalSupplyRegistry}`);

    // Save deployment
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const latestFile = path.join(deploymentDir, `${network.name}-migration-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));
    console.log(`\n💾 Saved to: ${latestFile}`);

    // ENV updates
    console.log(`\n${"=".repeat(80)}`);
    console.log("🔧 UPDATE YOUR .env.prod WITH:");
    console.log("=".repeat(80));
    console.log(`
MYNTIS_TOKEN_ADDRESS=${result.myntis}
MYNTIS_OFT_ADDRESS=${result.myntis}
STAKING_CONTRACT_ADDRESS=${result.dualPoolStaking}
EMISSIONS_CONTRACT_ADDRESS=${result.emissionsContract}
MERKLE_DISTRIBUTOR_ADDRESS=${result.zkMerkleDistributor}
REWARD_CLAIM_VERIFIER_ADDRESS=${result.rewardClaimVerifier}
LIQUID_STAKING_VAULT_ADDRESS=${result.liquidStakingVault}
GLOBAL_SUPPLY_REGISTRY_ADDRESS=${result.globalSupplyRegistry}
`);

    console.log(`\n✅ Migration deployment complete!`);
    console.log(`\nNext steps:`);
    console.log(`  1. Update .env.prod with the addresses above`);
    console.log(`  2. Run verify-migration.ts to verify all state`);
    console.log(`  3. Close epochs on old MerkleDistributor`);
    console.log(`  4. Update frontend ABIs and restart services`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
