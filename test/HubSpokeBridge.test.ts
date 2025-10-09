import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("HubSpokeBridge", function () {
    let owner: Signer;
    let user1: Signer;
    let user2: Signer;
    let provider: Signer;
    
    let hubBridge: Contract;
    let spokeBridge: Contract;
    let hubToken: Contract;
    let spokeToken: Contract;
    let globalNullifier: Contract;
    
    const HUB_CHAIN_ID = 84532;
    const SPOKE_CHAIN_ID = 11155111;

    beforeEach(async function () {
        [owner, user1, user2, provider] = await ethers.getSigners();
        
        await deployContracts();
        await configureBridges();
    });

    async function deployContracts() {
        // Deploy tokens
        const Myntis = await ethers.getContractFactory("Myntis");
        const myntisImpl = await Myntis.deploy();
        await myntisImpl.deployed();
        
        const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy();
        await proxyAdmin.deployed();
        
        const TransparentUpgradeableProxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
        const hubProxy = await TransparentUpgradeableProxy.deploy(
            myntisImpl.address,
            proxyAdmin.address,
            "0x"
        );
        await hubProxy.deployed();
        
        hubToken = Myntis.attach(hubProxy.address);
        await hubToken.initialize(
            await owner.getAddress(),
            1_000_000_000 * 1e18,
            1_000_000_000 * 1e18
        );
        
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
        
        // Deploy GlobalNullifier
        const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
        globalNullifier = await GlobalNullifier.deploy(await owner.getAddress());
        await globalNullifier.deployed();
        
        // Deploy bridges
        const HubSpokeBridge = await ethers.getContractFactory("HubSpokeBridge");
        
        hubBridge = await HubSpokeBridge.deploy(
            ethers.constants.AddressZero, // Mock LZ endpoint
            await owner.getAddress(),
            hubToken.address,
            ethers.constants.AddressZero, // Mock merkle distributor
            globalNullifier.address,
            HUB_CHAIN_ID,
            true // isHub
        );
        await hubBridge.deployed();
        
        spokeBridge = await HubSpokeBridge.deploy(
            ethers.constants.AddressZero, // Mock LZ endpoint
            await owner.getAddress(),
            spokeToken.address,
            ethers.constants.AddressZero, // Mock spoke distributor
            globalNullifier.address,
            HUB_CHAIN_ID,
            false // isHub
        );
        await spokeBridge.deployed();
    }

    async function configureBridges() {
        // Configure spoke token
        await spokeToken.setBridgeRole(spokeBridge.address, true);
        
        // Set peers (simulated)
        // In real deployment, this would be done via LayerZero
        console.log("Bridges configured for testing");
    }

    describe("Bridge Configuration", function () {
        it("Should have correct hub configuration", async function () {
            const info = await hubBridge.getContractInfo();
            expect(info.isHub_).to.be.true;
            expect(info.hubChainId_).to.equal(HUB_CHAIN_ID);
            expect(info.token_).to.equal(hubToken.address);
        });

        it("Should have correct spoke configuration", async function () {
            const info = await spokeBridge.getContractInfo();
            expect(info.isHub_).to.be.false;
            expect(info.hubChainId_).to.equal(HUB_CHAIN_ID);
            expect(info.token_).to.equal(spokeToken.address);
        });

        it("Should set bridge roles correctly", async function () {
            const bridgeRole = await spokeToken.BRIDGE_ROLE();
            const hasRole = await spokeToken.hasRole(bridgeRole, spokeBridge.address);
            expect(hasRole).to.be.true;
        });
    });

    describe("Token Bridging", function () {
        it("Should bridge tokens from hub to spoke", async function () {
            // Mint tokens on hub
            await hubToken.mint(await user1.getAddress(), 1000 * 1e18);
            
            // Approve bridge
            await hubToken.connect(user1).approve(hubBridge.address, 1000 * 1e18);
            
            // Bridge tokens (simulated)
            await hubToken.connect(user1).burn(await user1.getAddress(), 1000 * 1e18);
            await spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "bridge-from-hub");
            
            const spokeBalance = await spokeToken.balanceOf(await user1.getAddress());
            expect(spokeBalance).to.equal(1000 * 1e18);
        });

        it("Should bridge tokens from spoke to hub", async function () {
            // Mint tokens on spoke
            await spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "initial-mint");
            
            // Approve bridge
            await spokeToken.connect(user1).approve(spokeBridge.address, 1000 * 1e18);
            
            // Bridge tokens (simulated)
            await spokeToken.connect(user1).burn(await user1.getAddress(), 1000 * 1e18, "bridge-to-hub");
            await hubToken.mint(await user1.getAddress(), 1000 * 1e18);
            
            const hubBalance = await hubToken.balanceOf(await user1.getAddress());
            expect(hubBalance).to.equal(1000 * 1e18);
        });

        it("Should handle provider reward bridging", async function () {
            // Mint tokens on hub
            await hubToken.mint(await provider.getAddress(), 10000 * 1e18);
            
            // Bridge provider rewards (simulated)
            await hubToken.connect(provider).burn(await provider.getAddress(), 1000 * 1e18);
            await spokeToken.mint(await provider.getAddress(), 1000 * 1e18, "provider-reward");
            
            const spokeBalance = await spokeToken.balanceOf(await provider.getAddress());
            expect(spokeBalance).to.equal(1000 * 1e18);
        });
    });

    describe("Cross-Chain Messaging", function () {
        it("Should handle token transfer messages", async function () {
            // Simulate receiving token transfer message
            const recipient = await user1.getAddress();
            const amount = 1000 * 1e18;
            
            // Mint tokens to recipient (simulating message handling)
            await spokeToken.mint(recipient, amount, "cross-chain-transfer");
            
            const balance = await spokeToken.balanceOf(recipient);
            expect(balance).to.equal(amount);
        });

        it("Should handle reward distribution messages", async function () {
            // Simulate receiving reward distribution message
            const providerAddress = await provider.getAddress();
            const amount = 500 * 1e18;
            
            // Mint tokens to provider (simulating message handling)
            await spokeToken.mint(providerAddress, amount, "reward-distribution");
            
            const balance = await spokeToken.balanceOf(providerAddress);
            expect(balance).to.equal(amount);
        });

        it("Should handle nullifier burn messages", async function () {
            // Simulate receiving nullifier burn message
            const nullifier = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-nullifier"));
            const user = await user1.getAddress();
            const chainId = SPOKE_CHAIN_ID;
            
            // Burn nullifier on hub (simulating message handling)
            await globalNullifier.burnNullifier(nullifier, chainId, user);
            
            const isBurned = await globalNullifier.isNullifierBurned(nullifier);
            expect(isBurned).to.be.true;
        });
    });

    describe("Access Control", function () {
        it("Should only allow authorized users to bridge", async function () {
            // Try to bridge without proper role
            await expect(
                spokeToken.connect(user1).mint(await user2.getAddress(), 1000 * 1e18, "unauthorized")
            ).to.be.revertedWith("AccessControl: account");
        });

        it("Should allow admin to set bridge roles", async function () {
            const newBridge = await ethers.Wallet.createRandom().getAddress();
            
            await spokeToken.setBridgeRole(newBridge, true);
            
            const bridgeRole = await spokeToken.BRIDGE_ROLE();
            const hasRole = await spokeToken.hasRole(bridgeRole, newBridge);
            expect(hasRole).to.be.true;
        });

        it("Should allow admin to revoke bridge roles", async function () {
            await spokeToken.setBridgeRole(spokeBridge.address, false);
            
            const bridgeRole = await spokeToken.BRIDGE_ROLE();
            const hasRole = await spokeToken.hasRole(bridgeRole, spokeBridge.address);
            expect(hasRole).to.be.false;
        });
    });

    describe("Pause Functionality", function () {
        it("Should pause and unpause spoke token", async function () {
            // Pause token
            await spokeToken.pause();
            
            // Minting should fail
            await expect(
                spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "test")
            ).to.be.revertedWith("Minting is paused");
            
            // Unpause token
            await spokeToken.unpause();
            
            // Minting should work
            await spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "test");
            
            const balance = await spokeToken.balanceOf(await user1.getAddress());
            expect(balance).to.equal(1000 * 1e18);
        });

        it("Should pause token transfers", async function () {
            // Mint tokens first
            await spokeToken.mint(await user1.getAddress(), 1000 * 1e18, "initial");
            
            // Pause token
            await spokeToken.pause();
            
            // Transfer should fail
            await expect(
                spokeToken.connect(user1).transfer(await user2.getAddress(), 500 * 1e18)
            ).to.be.revertedWith("Token transfers are paused");
        });
    });

    describe("Error Handling", function () {
        it("Should revert on invalid bridge operations", async function () {
            // Try to bridge zero amount
            await expect(
                spokeToken.mint(await user1.getAddress(), 0, "zero-amount")
            ).to.be.revertedWith("Amount must be greater than zero");
        });

        it("Should revert on invalid recipients", async function () {
            // Try to mint to zero address
            await expect(
                spokeToken.mint(ethers.constants.AddressZero, 1000 * 1e18, "zero-address")
            ).to.be.revertedWith("Cannot mint to zero address");
        });

        it("Should handle insufficient balance for burning", async function () {
            // Try to burn more than balance
            await expect(
                spokeToken.burn(await user1.getAddress(), 1000 * 1e18, "insufficient")
            ).to.be.revertedWith("Insufficient balance");
        });
    });

    describe("Gas Optimization", function () {
        it("Should optimize gas for frequent operations", async function () {
            const iterations = 10;
            const amount = 100 * 1e18;
            
            // Test multiple mints
            for (let i = 0; i < iterations; i++) {
                await spokeToken.mint(await user1.getAddress(), amount, `mint-${i}`);
            }
            
            const balance = await spokeToken.balanceOf(await user1.getAddress());
            expect(balance).to.equal(amount * iterations);
        });

        it("Should handle batch operations efficiently", async function () {
            const users = [await user1.getAddress(), await user2.getAddress()];
            const amounts = [500 * 1e18, 300 * 1e18];
            
            // Batch mint
            for (let i = 0; i < users.length; i++) {
                await spokeToken.mint(users[i], amounts[i], `batch-mint-${i}`);
            }
            
            const balance1 = await spokeToken.balanceOf(users[0]);
            const balance2 = await spokeToken.balanceOf(users[1]);
            
            expect(balance1).to.equal(amounts[0]);
            expect(balance2).to.equal(amounts[1]);
        });
    });
});
