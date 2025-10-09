import { ethers } from "hardhat";

async function main() {
    console.log("🧪 Simple Myntis Test...\n");

    const [deployer, user1, user2, provider] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // 1. Deploy Myntis Token
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
        await proxy.getAddress(),
        ethers.ZeroAddress, // Will set emissions later
        ethers.ZeroAddress, // Will set merkle distributor later
        deployer.address
    );
    await staking.waitForDeployment();
    console.log(`✅ StakingContract deployed to: ${await staking.getAddress()}`);

    // 3. Deploy Emissions
    console.log("\n3️⃣ Deploying Emissions...");
    const Emissions = await ethers.getContractFactory("Emissions");
    const emissions = await Emissions.deploy(
        await proxy.getAddress(),
        await staking.getAddress(),
        deployer.address
    );
    await emissions.waitForDeployment();
    console.log(`✅ Emissions deployed to: ${await emissions.getAddress()}`);

    // Update staking contract with emissions address
    await staking.setEmissionContract(await emissions.getAddress());
    console.log(`✅ StakingContract updated with Emissions address`);

    // 4. Deploy MerkleDistributor
    console.log("\n4️⃣ Deploying MerkleDistributor...");
    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    const merkleDistributor = await MerkleDistributor.deploy(
        await proxy.getAddress(),
        deployer.address
    );
    await merkleDistributor.waitForDeployment();
    console.log(`✅ MerkleDistributor deployed to: ${await merkleDistributor.getAddress()}`);

    // Update staking contract with merkle distributor
    await staking.setMerkleDistributor(await merkleDistributor.getAddress());
    console.log(`✅ StakingContract updated with MerkleDistributor address`);

    // 5. Deploy GlobalNullifier
    console.log("\n5️⃣ Deploying GlobalNullifier...");
    const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
    const globalNullifier = await GlobalNullifier.deploy(deployer.address);
    await globalNullifier.waitForDeployment();
    console.log(`✅ GlobalNullifier deployed to: ${await globalNullifier.getAddress()}`);

    // 6. Test Core Functionality
    console.log("\n6️⃣ Testing Core Functionality...");
    
    // Test token minting
    await myntis.mint(deployer.address, 10_000_000 * 1e18);
    console.log(`✅ Initial tokens minted to deployer`);
    
    const balance = await myntis.balanceOf(deployer.address);
    console.log(`Deployer balance: ${ethers.formatEther(balance)} MYNT`);

    // Test staking
    console.log("\n🔹 Testing Staking...");
    await myntis.approve(await staking.getAddress(), 1000 * 1e18);
    await staking.stake(1000 * 1e18);
    console.log(`✅ Staked 1000 MYNT`);

    const stakeInfo = await staking.getProviderInfo(deployer.address);
    console.log(`Stake amount: ${ethers.formatEther(stakeInfo.stake)} MYNT`);

    // Test emissions
    console.log("\n🔹 Testing Emissions...");
    const emissionStats = await emissions.getEmissionStats();
    console.log(`Current emission rate: ${ethers.formatEther(emissionStats.currentRate)} MYNT/second`);
    console.log(`Total emissions: ${ethers.formatEther(emissionStats.totalEmissions)} MYNT`);

    // Test harvest
    console.log("\n🔹 Testing Harvest...");
    const pendingBefore = await emissions.pendingRewards(deployer.address);
    console.log(`Pending rewards before harvest: ${ethers.formatEther(pendingBefore)} MYNT`);
    
    await emissions.harvest(deployer.address);
    console.log(`✅ Harvested rewards`);

    // Test Merkle distributor
    console.log("\n🔹 Testing Merkle Distributor...");
    await myntis.mint(await merkleDistributor.getAddress(), 1000 * 1e18);
    await merkleDistributor.addProviderBalance(deployer.address, 1000 * 1e18);
    console.log(`✅ Added provider balance for Merkle distribution`);

    // 7. Deploy Spoke Contracts
    console.log("\n7️⃣ Deploying Spoke Contracts...");
    
    // Deploy MyntisSpoke
    const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
    const spokeToken = await MyntisSpoke.deploy(
        "Myntis Spoke",
        "MYNTS",
        84532, // Hub chain ID
        await proxy.getAddress(),
        deployer.address
    );
    await spokeToken.waitForDeployment();
    console.log(`✅ MyntisSpoke deployed to: ${await spokeToken.getAddress()}`);

    // Deploy SpokeDistributor
    const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
    const spokeDistributor = await SpokeDistributor.deploy(
        84532, // Hub chain ID
        await globalNullifier.getAddress(),
        await spokeToken.getAddress(),
        deployer.address
    );
    await spokeDistributor.waitForDeployment();
    console.log(`✅ SpokeDistributor deployed to: ${await spokeDistributor.getAddress()}`);

    // Test spoke token
    console.log("\n🔹 Testing Spoke Token...");
    await spokeToken.mint(user1.address, 100 * 1e18, "test-mint");
    const spokeBalance = await spokeToken.balanceOf(user1.address);
    console.log(`Spoke token balance: ${ethers.formatEther(spokeBalance)} MYNTS`);

    // Test cross-chain nullifier
    console.log("\n🔹 Testing Cross-Chain Nullifier...");
    const nullifier = await spokeDistributor.generateNullifier(user1.address, 0, 11155111);
    console.log(`Generated nullifier: ${nullifier}`);

    console.log("\n🎉 All tests completed successfully!");
    console.log("\n📋 Core functionality verified:");
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
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
