import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Continue Migration Script (Manual UUPS Deployment)
 * 
 * Deploys UUPS proxy manually to avoid OpenZeppelin plugin RPC issues.
 */

const ALREADY_DEPLOYED = {
    myntis: "0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55",
    verifier: "0xC24e30632a02950d476d27D2De6Ceb7F2C5E9978",
    emissions: "0x39a211De877c74a9e181e2253EDe847bB4eC70cf"
};

const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

// Minimal ERC1967Proxy ABI for deployment
const ERC1967_PROXY_ABI = [
    "constructor(address implementation, bytes data)"
];

// ERC1967Proxy bytecode (OpenZeppelin v5)
const ERC1967_PROXY_BYTECODE = "0x60806040526040516104fa3803806104fa833981016040819052610022916102de565b61002c8282610033565b5050610406565b61003c82610092565b6040516001600160a01b038316907fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b90600090a280511561008657610081828261010e565b505050565b61008e610185565b5050565b806001600160a01b03163b6000036100cd57604051634c9c8ce360e01b81526001600160a01b03821660048201526024015b60405180910390fd5b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc80546001600160a01b0319166001600160a01b0392909216919091179055565b6060600080846001600160a01b03168460405161012b91906103b7565b600060405180830381855af49150503d8060008114610166576040519150601f19603f3d011682016040523d82523d6000602084013e61016b565b606091505b509092509050610181858383866101a6565b9150505b92915050565b341561019a5760405163b398979f60e01b815260040160405180910390fd5b565b60608315610213578251600003610210576001600160a01b0385163b6102105760405162461bcd60e51b815260206004820152601d60248201527f416464726573733a2063616c6c20746f206e6f6e2d636f6e74726163740000006044820152606401610025565b508161021d565b61021d8383610225565b949350505050565b8151156102355781518083602001fd5b8060405162461bcd60e51b815260040161002591906103d3565b634e487b7160e01b600052604160045260246000fd5b60005b83811015610280578181015183820152602001610268565b50506000910152565b600082601f83011261029a57600080fd5b81516001600160401b038111156102b3576102b361024f565b604051601f8201601f19908116603f011681016001600160401b03811182821017156102e1576102e161024f565b6040528181528382016020018510156102f957600080fd5b61030a826020830160208701610265565b949350505050565b80516001600160a01b038116811461032957600080fd5b919050565b634e487b7160e01b600052602160045260246000fd5b6000806040838503121561035757600080fd5b61036083610312565b60208401519092506001600160401b0381111561037c57600080fd5b61038885828601610289565b9150509250929050565b600081518084526103aa816020860160208601610265565b601f01601f19169290920160200192915050565b600082516103d0818460208701610265565b9190910192915050565b6020815260006103ed6020830184610392565b9392505050565b60e68061040260003960006000f3fe";

async function main() {
    console.log("=".repeat(80));
    console.log("CONTINUE MIGRATION (MANUAL PROXY DEPLOYMENT)");
    console.log("=".repeat(80));

    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log(`\nDeployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${chainId})`);

    // Get contract instances
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = Myntis.attach(ALREADY_DEPLOYED.myntis);
    
    const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
    const emissions = EmissionsContract.attach(ALREADY_DEPLOYED.emissions);

    // Verify state
    const supply = await myntis.totalSupply();
    console.log(`\nMyntis Supply: ${ethers.formatEther(supply)} MYNT`);
    console.log(`Migration Complete: ${await myntis.migrationComplete()}`);

    // ============================================================
    // STEP 5: Deploy DualPoolStaking Implementation + Proxy
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("STEP 5: Deploying DualPoolStaking");
    console.log("=".repeat(80));

    // Deploy implementation
    console.log("  Deploying implementation...");
    const StakingFactory = await ethers.getContractFactory("DualPoolStaking");
    const stakingImpl = await StakingFactory.deploy();
    await stakingImpl.waitForDeployment();
    const stakingImplAddress = await stakingImpl.getAddress();
    console.log(`  Implementation: ${stakingImplAddress}`);

    // Prepare initialize calldata
    const initData = StakingFactory.interface.encodeFunctionData("initialize", [
        ALREADY_DEPLOYED.myntis,
        ALREADY_DEPLOYED.emissions,
        deployer.address
    ]);

    // Deploy ERC1967 Proxy
    console.log("  Deploying proxy...");
    const ProxyFactory = new ethers.ContractFactory(
        ["constructor(address implementation, bytes memory data)"],
        ERC1967_PROXY_BYTECODE,
        deployer
    );
    const proxy = await ProxyFactory.deploy(stakingImplAddress, initData);
    await proxy.waitForDeployment();
    const stakingAddress = await proxy.getAddress();
    console.log(`  Proxy: ${stakingAddress}`);

    // Attach to proxy with implementation ABI
    const staking = StakingFactory.attach(stakingAddress);

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

    // Grant MINTER_ROLE to EmissionsContract
    console.log("  Granting MINTER_ROLE to EmissionsContract...");
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const grantTx = await myntis.grantRole(MINTER_ROLE, ALREADY_DEPLOYED.emissions);
    await grantTx.wait();
    console.log("  Done!");

    // Configure DualPoolStaking
    console.log("  Setting LiquidStakingVault...");
    const setVaultTx = await staking.setLiquidStakingVault(vaultAddress);
    await setVaultTx.wait();
    console.log("  Done!");

    console.log("  Setting treasury...");
    const setTreasuryTx = await staking.setTreasury(deployer.address);
    await setTreasuryTx.wait();
    console.log("  Done!");

    // Configure ZKMerkleDistributor
    console.log("  Granting PROVIDER_ROLE...");
    const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
    const grantProviderTx = await distributor.grantRole(PROVIDER_ROLE, deployer.address);
    await grantProviderTx.wait();
    console.log("  Done!");

    // Grant DISTRIBUTOR_ROLE on verifier
    console.log("  Granting DISTRIBUTOR_ROLE on verifier...");
    const Verifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = Verifier.attach(ALREADY_DEPLOYED.verifier);
    const grantDistTx = await verifier.grantDistributorRole(distributorAddress);
    await grantDistTx.wait();
    console.log("  Done!");

    // Configure GlobalSupplyRegistry
    console.log("  Registering token...");
    const regTokenTx = await registry.registerToken(ALREADY_DEPLOYED.myntis);
    await regTokenTx.wait();
    console.log("  Done!");

    console.log("  Setting registry on Myntis...");
    const setRegTx = await myntis.setGlobalSupplyRegistry(registryAddress);
    await setRegTx.wait();
    console.log("  Done!");

    console.log("  Seeding supply...");
    const seedTx = await registry.seedChainSupply(chainId, supply);
    await seedTx.wait();
    console.log("  Done!");

    // ============================================================
    // SAVE RESULTS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("DEPLOYMENT COMPLETE");
    console.log("=".repeat(80));
    
    const result = {
        myntis: ALREADY_DEPLOYED.myntis,
        rewardClaimVerifier: ALREADY_DEPLOYED.verifier,
        emissionsContract: ALREADY_DEPLOYED.emissions,
        dualPoolStaking: stakingAddress,
        dualPoolStakingImpl: stakingImplAddress,
        zkMerkleDistributor: distributorAddress,
        liquidStakingVault: vaultAddress,
        globalSupplyRegistry: registryAddress,
        network: network.name,
        chainId,
        deployer: deployer.address,
        timestamp: new Date().toISOString()
    };

    console.log(`\nContracts:`);
    Object.entries(result).forEach(([key, value]) => {
        if (typeof value === 'string' && value.startsWith('0x')) {
            console.log(`  ${key}: ${value}`);
        }
    });

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
    console.log("UPDATE .env.prod WITH:");
    console.log("=".repeat(80));
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
