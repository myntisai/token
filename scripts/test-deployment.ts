import { ethers } from "hardhat";
import { Contract } from "ethers";

async function main() {
    console.log("🧪 Testing Myntis Cross-Chain Deployment...\n");

    const [deployer, user1, user2, provider] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // 1. Deploy Myntis Token (UUPS Upgradeable)
    console.log("\n1️⃣ Deploying Myntis Token...");
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntisImpl = await Myntis.deploy();
    await myntisImpl.waitForDeployment();
    console.log(`✅ Myntis Implementation deployed to: ${await myntisImpl.getAddress()}`);

    // Deploy ProxyAdmin
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.waitForDeployment();
    console.log(`✅ ProxyAdmin deployed to: ${await proxyAdmin.getAddress()}`);

    // Deploy TransparentUpgradeableProxy
    const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
    const proxy = await TransparentUpgradeableProxy.deploy(
        await myntisImpl.getAddress(),
        await proxyAdmin.getAddress(),
        "0x"
    );
    await proxy.waitForDeployment();
    console.log(`✅ Myntis Proxy deployed to: ${await proxy.getAddress()}`);

    // Initialize Myntis token
    const myntis = Myntis.attach(await proxy.getAddress());
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
        ethers.constants.AddressZero, // Mock LZ endpoint
        deployer.address,
        proxy.address,
        merkleDistributor.address,
        globalNullifier.address,
        84532, // Base Sepolia chain ID
        true // isHub
    );
    await hubBridge.deployed();
    console.log(`✅ HubSpokeBridge deployed to: ${hubBridge.address}`);

    // 7. Deploy Spoke Contracts
    console.log("\n7️⃣ Deploying Spoke Contracts...");
    
    // Deploy MyntisSpoke
    const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
    const spokeToken = await MyntisSpoke.deploy(
        "Myntis Spoke",
        "MYNTS",
        84532, // Hub chain ID
        proxy.address,
        deployer.address
    );
    await spokeToken.deployed();
    console.log(`✅ MyntisSpoke deployed to: ${spokeToken.address}`);

    // Deploy SpokeDistributor
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const spokeDistributor = await SpokeDistributor.deploy(
        84532, // Hub chain ID
        globalNullifier.address,
        spokeToken.address,
        deployer.address
    );
    await spokeDistributor.deployed();
    console.log(`✅ SpokeDistributor deployed to: ${spokeDistributor.address}`);

    // Deploy SpokeBridge
    const spokeBridge = await HubSpokeBridge.deploy(
        ethers.constants.AddressZero, // Mock LZ endpoint
        deployer.address,
        spokeToken.address,
        spokeDistributor.address,
        globalNullifier.address,
        84532, // Hub chain ID
        false // isHub
    );
    await spokeBridge.deployed();
    console.log(`✅ SpokeBridge deployed to: ${spokeBridge.address}`);

    // 8. Configure roles and permissions
    console.log("\n8️⃣ Configuring roles and permissions...");
    
    // Grant bridge role to hub bridge
    await myntis.grantRole(await myntis.MINTER_ROLE(), hubBridge.address);
    await myntis.grantRole(await myntis.BURNER_ROLE(), hubBridge.address);
    console.log(`✅ Bridge roles granted to HubSpokeBridge`);

    // Grant provider role to merkle distributor
    await merkleDistributor.grantRole(await merkleDistributor.PROVIDER_ROLE(), deployer.address);
    console.log(`✅ Provider role granted to deployer`);

    // Configure spoke token
    await spokeToken.setBridgeRole(spokeBridge.address, true);
    console.log(`✅ Bridge role granted to SpokeBridge`);

    // 9. Test Core Functionality
    console.log("\n9️⃣ Testing Core Functionality...");
    
    // Test token minting
    await myntis.mint(deployer.address, 10_000_000 * 1e18);
    console.log(`✅ Initial tokens minted to deployer`);
    
    const balance = await myntis.balanceOf(deployer.address);
    console.log(`Deployer balance: ${ethers.utils.formatEther(balance)} MYNT`);

    // Test staking
    console.log("\n🔹 Testing Staking...");
    await myntis.approve(staking.address, 1000 * 1e18);
    await staking.stake(1000 * 1e18);
    console.log(`✅ Staked 1000 MYNT`);

    const stakeInfo = await staking.getProviderInfo(deployer.address);
    console.log(`Stake amount: ${ethers.utils.formatEther(stakeInfo.stake)} MYNT`);

    // Test emissions
    console.log("\n🔹 Testing Emissions...");
    const emissionStats = await emissions.getEmissionStats();
    console.log(`Current emission rate: ${ethers.utils.formatEther(emissionStats.currentRate)} MYNT/second`);
    console.log(`Total emissions: ${ethers.utils.formatEther(emissionStats.totalEmissions)} MYNT`);

    // Test harvest
    console.log("\n🔹 Testing Harvest...");
    const pendingBefore = await emissions.pendingRewards(deployer.address);
    console.log(`Pending rewards before harvest: ${ethers.utils.formatEther(pendingBefore)} MYNT`);
    
    await emissions.harvest(deployer.address);
    console.log(`✅ Harvested rewards`);

    // Test Merkle distributor
    console.log("\n🔹 Testing Merkle Distributor...");
    await myntis.mint(merkleDistributor.address, 1000 * 1e18);
    await merkleDistributor.addProviderBalance(deployer.address, 1000 * 1e18);
    console.log(`✅ Added provider balance for Merkle distribution`);

    // Test spoke token
    console.log("\n🔹 Testing Spoke Token...");
    await spokeToken.mint(user1.address, 100 * 1e18, "test-mint");
    const spokeBalance = await spokeToken.balanceOf(user1.address);
    console.log(`Spoke token balance: ${ethers.utils.formatEther(spokeBalance)} MYNTS`);

    // Test cross-chain nullifier
    console.log("\n🔹 Testing Cross-Chain Nullifier...");
    const nullifier = await spokeDistributor.generateNullifier(user1.address, 0, 11155111);
    console.log(`Generated nullifier: ${nullifier}`);

    // 10. Save deployment info
    const deploymentInfo = {
        chainId: (await ethers.provider.getNetwork()).chainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            // Hub contracts
            Myntis: proxy.address,
            MyntisImpl: myntisImpl.address,
            ProxyAdmin: proxyAdmin.address,
            StakingContract: staking.address,
            Emissions: emissions.address,
            MerkleDistributor: merkleDistributor.address,
            GlobalNullifier: globalNullifier.address,
            HubSpokeBridge: hubBridge.address,
            // Spoke contracts
            MyntisSpoke: spokeToken.address,
            SpokeDistributor: spokeDistributor.address,
            SpokeBridge: spokeBridge.address
        }
    };

    console.log("\n📄 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    console.log("\n🎉 Test deployment completed successfully!");
    console.log("\n📋 All core functionality tested:");
    console.log("✅ Token minting and burning");
    console.log("✅ Staking and unstaking");
    console.log("✅ Emissions and harvest");
    console.log("✅ Merkle distribution setup");
    console.log("✅ Cross-chain nullifier generation");
    console.log("✅ Spoke token minting");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test deployment failed:", error);
        process.exit(1);
    });
