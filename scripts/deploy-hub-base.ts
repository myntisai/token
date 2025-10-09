import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
    console.log("🏛️ Deploying Myntis Hub Contracts on Base Sepolia...\n");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const currentChainId = (await ethers.provider.getNetwork()).chainId;
    console.log(`Current Chain ID: ${currentChainId}`);

    // LayerZero endpoint for Base Sepolia
    const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

    // 1. Deploy Myntis Token (UUPS Upgradeable)
    console.log("\n1️⃣ Deploying Myntis Token...");
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntisImpl = await Myntis.deploy();
    await myntisImpl.deployed();
    console.log(`✅ Myntis Implementation deployed to: ${myntisImpl.address}`);

    // Deploy ProxyAdmin
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    console.log(`✅ ProxyAdmin deployed to: ${proxyAdmin.address}`);

    // Deploy TransparentUpgradeableProxy
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
    const proxy = await TransparentUpgradeableProxy.deploy(
        myntisImpl.address,
        proxyAdmin.address,
        "0x"
    );
    await proxy.deployed();
    console.log(`✅ Myntis Proxy deployed to: ${proxy.address}`);

    // Initialize Myntis token
    const myntis = Myntis.attach(proxy.address);
    await myntis.initialize(
        deployer.address,
        1_000_000_000 * 1e18, // 1B cap
        1_000_000_000 * 1e18  // 1B max supply
    );
    console.log(`✅ Myntis Token initialized`);

    // 2. Deploy StakingContract
    console.log("\n2️⃣ Deploying StakingContract...");
    const StakingContract = await ethers.getContractFactory("StakingContract");
    const staking = await StakingContract.deploy(
        proxy.address,
        ethers.constants.AddressZero, // Will set emissions later
        ethers.constants.AddressZero, // Will set merkle distributor later
        deployer.address
    );
    await staking.deployed();
    console.log(`✅ StakingContract deployed to: ${staking.address}`);

    // 3. Deploy Emissions
    console.log("\n3️⃣ Deploying Emissions...");
    const Emissions = await ethers.getContractFactory("Emissions");
    const emissions = await Emissions.deploy(
        proxy.address,
        staking.address,
        deployer.address
    );
    await emissions.deployed();
    console.log(`✅ Emissions deployed to: ${emissions.address}`);

    // Update staking contract with emissions address
    await staking.setEmissionContract(emissions.address);
    console.log(`✅ StakingContract updated with Emissions address`);

    // 4. Deploy MerkleDistributor
    console.log("\n4️⃣ Deploying MerkleDistributor...");
    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    const merkleDistributor = await MerkleDistributor.deploy(
        proxy.address,
        deployer.address
    );
    await merkleDistributor.deployed();
    console.log(`✅ MerkleDistributor deployed to: ${merkleDistributor.address}`);

    // Update staking contract with merkle distributor
    await staking.setMerkleDistributor(merkleDistributor.address);
    console.log(`✅ StakingContract updated with MerkleDistributor address`);

    // 5. Deploy GlobalNullifier
    console.log("\n5️⃣ Deploying GlobalNullifier...");
    const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
    const globalNullifier = await GlobalNullifier.deploy(deployer.address);
    await globalNullifier.deployed();
    console.log(`✅ GlobalNullifier deployed to: ${globalNullifier.address}`);

    // 6. Deploy HubSpokeBridge
    console.log("\n6️⃣ Deploying HubSpokeBridge...");
    const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
    const hubBridge = await HubSpokeBridge.deploy(
        LZ_ENDPOINT,
        deployer.address,
        proxy.address,
        merkleDistributor.address,
        globalNullifier.address,
        currentChainId,
        true // isHub
    );
    await hubBridge.deployed();
    console.log(`✅ HubSpokeBridge deployed to: ${hubBridge.address}`);

    // 7. Configure roles and permissions
    console.log("\n7️⃣ Configuring roles and permissions...");
    
    // Grant bridge role to hub bridge
    await myntis.grantRole(await myntis.MINTER_ROLE(), hubBridge.address);
    await myntis.grantRole(await myntis.BURNER_ROLE(), hubBridge.address);
    console.log(`✅ Bridge roles granted to HubSpokeBridge`);

    // Grant provider role to merkle distributor
    await merkleDistributor.grantRole(await merkleDistributor.PROVIDER_ROLE(), deployer.address);
    console.log(`✅ Provider role granted to deployer`);

    // 8. Initial token distribution
    console.log("\n8️⃣ Setting up initial token distribution...");
    
    // Mint initial tokens for testing
    await myntis.mint(deployer.address, 10_000_000 * 1e18); // 10M tokens
    console.log(`✅ Initial tokens minted to deployer`);

    // 9. Save deployment info
    const deploymentInfo = {
        chainId: currentChainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            Myntis: proxy.address,
            MyntisImpl: myntisImpl.address,
            ProxyAdmin: proxyAdmin.address,
            StakingContract: staking.address,
            Emissions: emissions.address,
            MerkleDistributor: merkleDistributor.address,
            GlobalNullifier: globalNullifier.address,
            HubSpokeBridge: hubBridge.address
        },
        configuration: {
            lzEndpoint: LZ_ENDPOINT,
            isHub: true
        }
    };

    console.log("\n📄 Hub Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    console.log("\n🎉 Hub deployment completed successfully!");
    console.log("\n📋 Next Steps:");
    console.log("1. Deploy spoke contracts on Ethereum Sepolia");
    console.log("2. Configure LayerZero peers between hub and spoke");
    console.log("3. Test cross-chain functionality");
    console.log("4. Test staking and harvest functionality");
    console.log("5. Test Merkle tree distribution");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Hub deployment failed:", error);
        process.exit(1);
    });
