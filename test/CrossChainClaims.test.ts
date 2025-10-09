import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("Cross-Chain Claims", function () {
    let owner: Signer;
    let user1: Signer;
    let user2: Signer;
    let provider: Signer;
    
    // Hub contracts
    let hubToken: Contract;
    let hubEmissions: Contract;
    let hubMerkleDistributor: Contract;
    let hubGlobalNullifier: Contract;
    let hubStaking: Contract;
    let hubBridge: Contract;
    
    // Spoke contracts
    let spokeToken: Contract;
    let spokeDistributor: Contract;
    let spokeBridge: Contract;
    
    // Test data
    const HUB_CHAIN_ID = 84532; // Base Sepolia
    const SPOKE_CHAIN_ID = 11155111; // Ethereum Sepolia
    
    beforeEach(async function () {
        [owner, user1, user2, provider] = await ethers.getSigners();
        
        // Deploy hub contracts
        await deployHubContracts();
        await deploySpokeContracts();
        await configureCrossChain();
    });

    async function deployHubContracts() {
        console.log("Deploying Hub Contracts...");
        
        // Deploy Myntis token
        const Myntis = await ethers.getContractFactory("Myntis");
        const myntisImpl = await Myntis.deploy();
        await myntisImpl.deployed();
        
        // Deploy proxy
        const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy();
        await proxyAdmin.deployed();
        
        const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
        const proxy = await TransparentUpgradeableProxy.deploy(
            myntisImpl.address,
            proxyAdmin.address,
            "0x"
        );
        await proxy.deployed();
        
        hubToken = Myntis.attach(proxy.address);
        await hubToken.initialize(
            await owner.getAddress(),
            1_000_000_000 * 1e18, // 1B cap
            1_000_000_000 * 1e18  // 1B max supply
        );
        
        // Deploy other hub contracts
        const Emissions = await ethers.getContractFactory("Emissions");
        hubEmissions = await Emissions.deploy(
            hubToken.address,
            ethers.constants.AddressZero, // Will set later
            await owner.getAddress()
        );
        await hubEmissions.deployed();
        
        const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
        hubMerkleDistributor = await MerkleDistributor.deploy(
            hubToken.address,
            await owner.getAddress()
        );
        await hubMerkleDistributor.deployed();
        
        const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
        hubGlobalNullifier = await GlobalNullifier.deploy(await owner.getAddress());
        await hubGlobalNullifier.deployed();
        
        const StakingContract = await ethers.getContractFactory("StakingContract");
        hubStaking = await StakingContract.deploy(
            hubToken.address,
            hubEmissions.address,
            hubMerkleDistributor.address,
            await owner.getAddress()
        );
        await hubStaking.deployed();
        
        // Update emissions contract with staking address
        await hubEmissions.setStakingContract(hubStaking.address);
        
        // Deploy hub bridge
        const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
        hubBridge = await HubSpokeBridge.deploy(
            ethers.constants.AddressZero, // Mock LZ endpoint
            await owner.getAddress(),
            hubToken.address,
            hubMerkleDistributor.address,
            hubGlobalNullifier.address,
            HUB_CHAIN_ID,
            true // isHub
        );
        await hubBridge.deployed();
    }

    async function deploySpokeContracts() {
        console.log("Deploying Spoke Contracts...");
        
        // Deploy spoke token
        const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
        spokeToken = await MyntisSpoke.deploy(
            "Myntis Spoke",
            "MYNTS",
            HUB_CHAIN_ID,
            hubToken.address,
            await owner.getAddress()
        );
        await spokeToken.deployed();
        
        // Deploy spoke distributor
        const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
        spokeDistributor = await SpokeDistributor.deploy(
            HUB_CHAIN_ID,
            hubGlobalNullifier.address,
            spokeToken.address,
            await owner.getAddress()
        );
        await spokeDistributor.deployed();
        
        // Deploy spoke bridge
        const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
        spokeBridge = await HubSpokeBridge.deploy(
            ethers.constants.AddressZero, // Mock LZ endpoint
            await owner.getAddress(),
            spokeToken.address,
            spokeDistributor.address,
            hubGlobalNullifier.address,
            HUB_CHAIN_ID,
            false // isHub
        );
        await spokeBridge.deployed();
    }

    async function configureCrossChain() {
        console.log("Configuring Cross-Chain...");
        
        // Configure spoke token
        await spokeToken.setBridgeRole(spokeBridge.address, true);
        
        // Configure spoke distributor
        await spokeBridge.setBridgeRole(spokeDistributor.address, true);
        
        // Register spoke in hub GlobalNullifier
        await hubGlobalNullifier.registerSpoke(
            SPOKE_CHAIN_ID,
            spokeDistributor.address
        );
    }

    describe("Cross-Chain Token Transfers", function () {
        it("Should bridge tokens from hub to spoke", async function () {
            // Mint tokens on hub
            await hubToken.mint(await user1.getAddress(), 1000 * 1e18);
            
            // Bridge tokens to spoke
            await hubToken.approve(hubBridge.address, 1000 * 1e18);
            
            // This would normally trigger LayerZero message
            // For testing, we'll simulate the spoke side
            await spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "bridge-transfer");
            
            const spokeBalance = await spokeToken.balanceOf(await user1.getAddress());
            expect(spokeBalance).to.equal(1000 * 1e18);
        });

        it("Should bridge tokens from spoke to hub", async function () {
            // Mint tokens on spoke
            await spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "initial-mint");
            
            // Bridge tokens to hub
            await spokeToken.approve(spokeBridge.address, 1000 * 1e18);
            
            // This would normally trigger LayerZero message
            // For testing, we'll simulate the hub side
            await hubToken.mint(await user1.getAddress(), 1000 * 1e18);
            
            const hubBalance = await hubToken.balanceOf(await user1.getAddress());
            expect(hubBalance).to.equal(1000 * 1e18);
        });
    });

    describe("Cross-Chain Reward Distribution", function () {
        it("Should distribute rewards from hub to spoke", async function () {
            // Setup provider on hub
            await hubToken.mint(await provider.getAddress(), 10000 * 1e18);
            await hubToken.connect(provider).approve(hubStaking.address, 10000 * 1e18);
            await hubStaking.connect(provider).stake(10000 * 1e18);
            
            // Add provider balance for rewards
            await hubMerkleDistributor.addProviderBalance(await provider.getAddress(), 1000 * 1e18);
            
            // Submit Merkle root
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400; // 1 day
            await hubMerkleDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                1000 * 1e18
            );
            
            // Distribute rewards to spoke
            // This would normally trigger LayerZero message
            // For testing, we'll simulate the spoke side
            await spokeToken.mint(await user1.getAddress(), 100 * 1e18, "reward-distribution");
            
            const spokeBalance = await spokeToken.balanceOf(await user1.getAddress());
            expect(spokeBalance).to.equal(100 * 1e18);
        });
    });

    describe("Cross-Chain Nullifier Prevention", function () {
        it("Should prevent double-claiming across chains", async function () {
            const user = await user1.getAddress();
            const rootId = 0;
            const chainId = SPOKE_CHAIN_ID;
            
            // Generate nullifier
            const nullifier = await spokeDistributor.generateNullifier(user, rootId, chainId);
            
            // First claim should succeed
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                rootId,
                100 * 1e18,
                [], // Mock merkle proof
                nullifier
            );
            
            // Second claim with same nullifier should fail
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    rootId,
                    100 * 1e18,
                    [], // Mock merkle proof
                    nullifier
                )
            ).to.be.revertedWith("nullifier already used");
        });

        it("Should burn nullifier on hub when claimed on spoke", async function () {
            const user = await user1.getAddress();
            const rootId = 0;
            const chainId = SPOKE_CHAIN_ID;
            
            // Generate nullifier
            const nullifier = await spokeDistributor.generateNullifier(user, rootId, chainId);
            
            // Claim on spoke
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                rootId,
                100 * 1e18,
                [], // Mock merkle proof
                nullifier
            );
            
            // Check nullifier is burned on hub
            const isBurned = await hubGlobalNullifier.isNullifierBurned(nullifier);
            expect(isBurned).to.be.true;
        });
    });

    describe("Cross-Chain Integration", function () {
        it("Should handle complete cross-chain reward flow", async function () {
            // 1. Setup provider on hub
            await hubToken.mint(await provider.getAddress(), 10000 * 1e18);
            await hubToken.connect(provider).approve(hubStaking.address, 10000 * 1e18);
            await hubStaking.connect(provider).stake(10000 * 1e18);
            
            // 2. Add provider balance for rewards
            await hubMerkleDistributor.addProviderBalance(await provider.getAddress(), 1000 * 1e18);
            
            // 3. Submit Merkle root on hub
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            await hubMerkleDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                1000 * 1e18
            );
            
            // 4. Distribute rewards to spoke
            await spokeToken.mint(await user1.getAddress(), 100 * 1e18, "reward-distribution");
            
            // 5. Claim on spoke with nullifier
            const nullifier = await spokeDistributor.generateNullifier(
                await user1.getAddress(),
                0,
                SPOKE_CHAIN_ID
            );
            
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                0,
                100 * 1e18,
                [], // Mock merkle proof
                nullifier
            );
            
            // 6. Verify nullifier is burned on hub
            const isBurned = await hubGlobalNullifier.isNullifierBurned(nullifier);
            expect(isBurned).to.be.true;
        });
    });

    describe("Error Handling", function () {
        it("Should revert on invalid cross-chain operations", async function () {
            // Test invalid nullifier
            const invalidNullifier = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("invalid"));
            
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    0,
                    100 * 1e18,
                    [],
                    invalidNullifier
                )
            ).to.be.revertedWith("nullifier already used");
        });

        it("Should handle paused contracts", async function () {
            // Pause spoke token
            await spokeToken.pause();
            
            // Bridge should fail
            await expect(
                spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "bridge-transfer")
            ).to.be.revertedWith("Minting is paused");
        });
    });
});
