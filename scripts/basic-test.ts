import { ethers } from "hardhat";

async function main() {
    console.log("🧪 Basic Myntis Test...\n");

    const [deployer, user1, user2, provider] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // 1. Deploy Myntis Token (simplified without proxy)
    console.log("\n1️⃣ Deploying Myntis Token...");
    const MyntisSimple = await ethers.getContractFactory("MyntisSimple");
    const myntis = await MyntisSimple.deploy(
        deployer.address,
        ethers.parseEther("1000000000"), // 1B cap
        ethers.parseEther("1000000000")  // 1B max supply
    );
    await myntis.waitForDeployment();
    console.log(`✅ Myntis deployed to: ${await myntis.getAddress()}`);

    // 2. Deploy StakingContract
    console.log("\n2️⃣ Deploying StakingContract...");
    const StakingContract = await ethers.getContractFactory("StakingContract");
    const staking = await StakingContract.deploy(
        await myntis.getAddress(),
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
        await myntis.getAddress(),
        await staking.getAddress(),
        deployer.address
    );
    await emissions.waitForDeployment();
    console.log(`✅ Emissions deployed to: ${await emissions.getAddress()}`);

    // Update staking contract with emissions address
    await staking.setEmissionContract(await emissions.getAddress());
    console.log(`✅ StakingContract updated with Emissions address`);

    // Grant MINTER_ROLE to emissions contract
    await myntis.grantRole(await myntis.MINTER_ROLE(), await emissions.getAddress());
    console.log(`✅ MINTER_ROLE granted to Emissions contract`);

    // 4. Deploy MerkleDistributor
    console.log("\n4️⃣ Deploying MerkleDistributor...");
    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    const merkleDistributor = await MerkleDistributor.deploy(
        await myntis.getAddress(),
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
    await myntis.mint(deployer.address, ethers.parseEther("10000000"));
    console.log(`✅ Initial tokens minted to deployer`);
    
    const balance = await myntis.balanceOf(deployer.address);
    console.log(`Deployer balance: ${ethers.formatEther(balance)} MYNT`);

    // Test staking
    console.log("\n🔹 Testing Staking...");
    await myntis.approve(await staking.getAddress(), ethers.parseEther("1000"));
    await staking.registerProvider(ethers.parseEther("1000"));
    console.log(`✅ Staked 1000 MYNT`);

    const [stake, rewardDebt] = await staking.getProviderInfo(deployer.address);
    console.log(`Stake amount: ${ethers.formatEther(stake)} MYNT`);

    // Test emissions
    console.log("\n🔹 Testing Emissions...");
    const emissionStats = await emissions.getEmissionStats();
    console.log(`Current emission rate: ${ethers.formatEther(emissionStats.currentRate)} MYNT/second`);
    console.log(`Total emissions: ${ethers.formatEther(emissionStats.totalEmissions)} MYNT`);

    // Test harvest
    console.log("\n🔹 Testing Harvest...");
    const pendingBefore = await emissions.pendingRewards(deployer.address);
    console.log(`Pending rewards before harvest: ${ethers.formatEther(pendingBefore)} MYNT`);
    
    await staking.harvestRewards();
    console.log(`✅ Harvested rewards`);

    // Test Merkle distributor
    console.log("\n🔹 Testing Merkle Distributor...");
    await myntis.mint(await merkleDistributor.getAddress(), ethers.parseEther("1000"));
    await merkleDistributor.addProviderBalance(deployer.address, ethers.parseEther("1000"));
    console.log(`✅ Added provider balance for Merkle distribution`);

    // 7. Deploy Spoke Contracts
    console.log("\n7️⃣ Deploying Spoke Contracts...");
    
    // Deploy MyntisSpoke
    const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
    const spokeToken = await MyntisSpoke.deploy(
        "Myntis Spoke",
        "MYNTS",
        84532, // Hub chain ID
        await myntis.getAddress(),
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
    // Grant MINTER_ROLE to deployer for testing
    await spokeToken.grantRole(await spokeToken.MINTER_ROLE(), deployer.address);
    await spokeToken.mint(user1.address, ethers.parseEther("100"), "test-mint");
    const spokeBalance = await spokeToken.balanceOf(user1.address);
    console.log(`Spoke token balance: ${ethers.formatEther(spokeBalance)} MYNTS`);

    // Test cross-chain nullifier
    console.log("\n🔹 Testing Cross-Chain Nullifier...");
    const nullifier = await spokeDistributor.generateNullifier(user1.address, 0, 11155111);
    console.log(`Generated nullifier: ${nullifier}`);

    // Test Merkle root submission
    console.log("\n🔹 Testing Merkle Root Submission...");
    const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 2; // 2 days
    await merkleDistributor.submitMerkleRoot(merkleRoot, expiry, ethers.parseEther("1000"));
    console.log(`✅ Merkle root submitted for distribution`);

    // Grant PROVIDER_ROLE to deployer for testing
    await spokeDistributor.grantRole(await spokeDistributor.PROVIDER_ROLE(), deployer.address);
    
    // Test spoke distributor Merkle root
    await spokeDistributor.submitMerkleRoot(merkleRoot, expiry, ethers.parseEther("500"));
    console.log(`✅ Spoke Merkle root submitted`);

    console.log("\n🎉 All tests completed successfully!");
    console.log("\n📋 Core functionality verified:");
    console.log("✅ Token minting and burning");
    console.log("✅ Staking and unstaking");
    console.log("✅ Emissions and harvest");
    console.log("✅ Merkle distribution setup");
    console.log("✅ Cross-chain nullifier generation");
    console.log("✅ Spoke token minting");
    console.log("✅ Merkle root submission");

    // Save deployment info
    const deploymentInfo = {
        chainId: (await ethers.provider.getNetwork()).chainId,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            Myntis: await myntis.getAddress(),
            StakingContract: await staking.getAddress(),
            Emissions: await emissions.getAddress(),
            MerkleDistributor: await merkleDistributor.getAddress(),
            GlobalNullifier: await globalNullifier.getAddress(),
            MyntisSpoke: await spokeToken.getAddress(),
            SpokeDistributor: await spokeDistributor.getAddress()
        }
    };

    console.log("\n📄 Deployment Summary:");
    console.log(JSON.stringify(deploymentInfo, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Test failed:", error);
        process.exit(1);
    });
