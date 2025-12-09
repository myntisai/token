import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Continue Migration Script v2
 * 
 * Uses OpenZeppelin's ERC1967Proxy directly from contracts.
 */

const ALREADY_DEPLOYED = {
    myntis: "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55",
    verifier: "0xC24e30632a02950d476d27D2De6Ceb7F2C5E9978",
    emissions: "0x39a211De877c74a9e181e2253EDe847bB4eC70cf",
    stakingImpl: "0x425DA859900706E8E40eB09276BBDeB2eea4be21" // Already deployed
};

const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

async function main() {
    console.log("=".repeat(80));
    console.log("CONTINUE MIGRATION v2");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

    // Get contract factories and instances
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = Myntis.attach(ALREADY_DEPLOYED.myntis);
    
    const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
    const emissions = EmissionsContract.attach(ALREADY_DEPLOYED.emissions);
    
    const StakingFactory = await ethers.getContractFactory("DualPoolStaking");

    const supply = await myntis.totalSupply();
    console.log(`\nMyntis Supply: ${ethers.formatEther(supply)} MYNT`);

    // ============================================================
    // STEP 5: Deploy ERC1967Proxy for DualPoolStaking
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 5: Deploying DualPoolStaking Proxy");
    console.log("=".repeat(80));

    console.log(`  Implementation: ${ALREADY_DEPLOYED.stakingImpl}`);

    // Get the ERC1967Proxy contract
    // We'll deploy it using the minimal proxy pattern
    const initData = StakingFactory.interface.encodeFunctionData("initialize", [
        ALREADY_DEPLOYED.myntis,
        ALREADY_DEPLOYED.emissions,
        deployer.address
    ]);
    console.log(`  Init data length: ${initData.length} chars`);

    // Deploy using inline assembly proxy
    // Using a simpler transparent proxy pattern
    const proxyBytecode = await generateProxyBytecode(ALREADY_DEPLOYED.stakingImpl, initData);
    
    console.log("  Deploying proxy contract...");
    const tx = await deployer.sendTransaction({
        data: proxyBytecode,
        gasLimit: 500000
    });
    const receipt = await tx.wait();
    if (!receipt || !receipt.contractAddress) {
        throw new Error("Proxy deployment failed - no contract address");
    }
    const stakingAddress = receipt.contractAddress;
    console.log(`  Proxy deployed to: ${stakingAddress}`);

    // Attach staking interface to proxy
    const staking = StakingFactory.attach(stakingAddress);

    // Verify initialization
    try {
        const token = await staking.token();
        console.log(`  Verified token: ${token}`);
    } catch (e) {
        console.log(`  Warning: Could not verify - may need manual check`);
    }

    // ============================================================
    // STEP 6: Update EmissionsContract
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 6: Configuring EmissionsContract");
    console.log("=".repeat(80));

    console.log("  Setting staking contract...");
    const setStakingTx = await emissions.setStakingContract(stakingAddress);
    await setStakingTx.wait();
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
    console.log("  Setting LiquidStakingVault...");
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
    console.log("  Registering token...");
    await (await registry.registerToken(ALREADY_DEPLOYED.myntis)).wait();
    console.log("  Done!");

    console.log("  Setting registry on Myntis...");
    await (await myntis.setGlobalSupplyRegistry(registryAddress)).wait();
    console.log("  Done!");

    console.log("  Seeding supply...");
    await (await registry.seedChainSupply(chainId, supply)).wait();
    console.log("  Done!");

    // ============================================================
    // RESULTS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE");
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

    console.log(`\nContracts:`);
    console.log(`  Myntis:              ${result.myntis}`);
    console.log(`  EmissionsContract:   ${result.emissionsContract}`);
    console.log(`  DualPoolStaking:     ${result.dualPoolStaking}`);
    console.log(`  ZKMerkleDistributor: ${result.zkMerkleDistributor}`);
    console.log(`  LiquidStakingVault:  ${result.liquidStakingVault}`);
    console.log(`  GlobalSupplyRegistry: ${result.globalSupplyRegistry}`);

    // Save
    const deploymentDir = path.join(__dirname, "../deployments");
    if (!fs.existsSync(deploymentDir)) {
        fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const latestFile = path.join(deploymentDir, `${network.name}-migration-latest.json`);
    fs.writeFileSync(latestFile, JSON.stringify(result, null, 2));
    console.log(`\nSaved to: ${latestFile}`);

    // ENV updates
    console.log(`\n${"=".repeat(80)}`);
    console.log("UPDATE .env.prod:");
    console.log("=".repeat(80));
    console.log(`MYNTIS_TOKEN_ADDRESS=${result.myntis}`);
    console.log(`STAKING_CONTRACT_ADDRESS=${result.dualPoolStaking}`);
    console.log(`EMISSIONS_CONTRACT_ADDRESS=${result.emissionsContract}`);
    console.log(`MERKLE_DISTRIBUTOR_ADDRESS=${result.zkMerkleDistributor}`);
}

// Generate minimal proxy bytecode that delegates to implementation
async function generateProxyBytecode(implementation: string, initData: string): Promise<string> {
    // ERC1967 Proxy creation code
    // This is the standard OZ ERC1967Proxy bytecode pattern
    const implAddress = implementation.slice(2).toLowerCase().padStart(40, '0');
    const initDataHex = initData.slice(2);
    
    // Minimal delegating proxy with constructor that calls initialize
    // Pattern: Deploy proxy, set implementation slot, call initialize
    const constructorCode = 
        "608060405234801561001057600080fd5b5060405161" + 
        // Add length placeholders - this is a simplified version
        "00" + "38038061" + "00" + 
        "833981810160405281019061002c9190610090565b" +
        "61003582610047565b61003f828261007d565b5050506100bd565b" +
        "7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc55565b" +
        "60008083516020850186885af150503d6000833e8280156100785781f35b8183fd5b" +
        "600060208284031215610091578081fd5b81516001600160a01b03811681146100a7578182fd5b9392505050565b" +
        "60e0806100bd6000396000f3fe";

    const runtimeCode = 
        "608060405236601057600e6013565b005b600e5b603560317f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565b6055565b565b3660008037600080366000845af43d6000803e8080156050573d6000f35b3d6000fd5b56fea2646970667358";

    // For now, use a simpler approach - directly encode as creation transaction
    // This won't work perfectly, so let's try the OZ proxy factory approach instead
    
    // Actually let's just use Hardhat's approach with force
    throw new Error("Use hardhat upgrades with HARDHAT_UPGRADE_UNSAFE=true");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
