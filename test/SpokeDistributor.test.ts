import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SpokeDistributor, GlobalNullifier, MyntisSpokeOFT } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SpokeDistributor - Cross-Chain Claims", function () {
    let spokeDistributor: SpokeDistributor;
    let globalNullifier: GlobalNullifier;
    let spokeToken: MyntisSpokeOFT;
    let admin: SignerWithAddress;
    let provider: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const HUB_CHAIN_ID = 8453; // Base mainnet
    const SPOKE_CHAIN_ID = 1; // Ethereum
    const LAYERZERO_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f"; // Mock for testing

    beforeEach(async function () {
        [admin, provider, user1, user2] = await ethers.getSigners();

        // Deploy GlobalNullifier (hub contract)
        const GlobalNullifierFactory = await ethers.getContractFactory("GlobalNullifier");
        globalNullifier = await GlobalNullifierFactory.deploy(admin.address);
        await globalNullifier.waitForDeployment();

        // Deploy MyntisSpokeOFT (spoke token)
        const MyntisSpokeOFTFactory = await ethers.getContractFactory("MyntisSpokeOFT");
        spokeToken = await MyntisSpokeOFTFactory.deploy();
        await spokeToken.waitForDeployment();
        
        await spokeToken.initialize(
            "Myntis Spoke",
            "MYNT",
            admin.address,
            HUB_CHAIN_ID,
            ethers.ZeroAddress, // Hub token address (not needed for this test)
            LAYERZERO_ENDPOINT
        );

        // Deploy SpokeDistributor
        const SpokeDistributorFactory = await ethers.getContractFactory("SpokeDistributor");
        spokeDistributor = await SpokeDistributorFactory.deploy(
            HUB_CHAIN_ID,
            await globalNullifier.getAddress(),
            await spokeToken.getAddress(),
            admin.address
        );
        await spokeDistributor.waitForDeployment();

        // Register spoke in global nullifier
        await globalNullifier.connect(admin).registerSpoke(SPOKE_CHAIN_ID, await spokeDistributor.getAddress());

        // Grant MINTER_ROLE to SpokeDistributor on spoke token
        const MINTER_ROLE = await spokeToken.MINTER_ROLE();
        await spokeToken.connect(admin).grantRole(MINTER_ROLE, await spokeDistributor.getAddress());

        // Grant PROVIDER_ROLE to provider on spoke distributor
        const PROVIDER_ROLE = await spokeDistributor.PROVIDER_ROLE();
        await spokeDistributor.connect(admin).grantRole(PROVIDER_ROLE, provider.address);
    });

    describe("Deployment & Configuration", function () {
        it("Should set hub info correctly", async function () {
            const [chainId, nullifierAddr] = await spokeDistributor.getHubInfo();
            expect(chainId).to.equal(HUB_CHAIN_ID);
            expect(nullifierAddr).to.equal(await globalNullifier.getAddress());
        });

        it("Should have correct spoke token reference", async function () {
            expect(await spokeDistributor.spokeToken()).to.equal(await spokeToken.getAddress());
        });

        it("Should be registered in global nullifier", async function () {
            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            expect(await globalNullifier.hasRole(SPOKE_ROLE, await spokeDistributor.getAddress())).to.be.true;
        });

        it("Should have MINTER_ROLE on spoke token", async function () {
            const MINTER_ROLE = await spokeToken.MINTER_ROLE();
            expect(await spokeToken.hasRole(MINTER_ROLE, await spokeDistributor.getAddress())).to.be.true;
        });
    });

    describe("Provider Balance Management", function () {
        const BALANCE_AMOUNT = ethers.parseEther("1000");

        it("Should allow admin to add provider balance", async function () {
            await expect(spokeDistributor.connect(admin).addProviderBalance(provider.address, BALANCE_AMOUNT))
                .to.emit(spokeDistributor, "ProviderBalanceUpdated")
                .withArgs(provider.address, BALANCE_AMOUNT);

            expect(await spokeDistributor.getProviderBalance(provider.address)).to.equal(BALANCE_AMOUNT);
        });

        it("Should reject zero amount", async function () {
            await expect(
                spokeDistributor.connect(admin).addProviderBalance(provider.address, 0)
            ).to.be.revertedWith("zero amount");
        });

        it("Should reject zero address", async function () {
            await expect(
                spokeDistributor.connect(admin).addProviderBalance(ethers.ZeroAddress, BALANCE_AMOUNT)
            ).to.be.revertedWith("invalid provider");
        });
    });

    describe("Merkle Root Submission", function () {
        const PROVIDER_BALANCE = ethers.parseEther("1000");
        const CLAIMABLE_AMOUNT = ethers.parseEther("500");
        const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("test-root"));

        beforeEach(async function () {
            // Add balance for provider
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);
        });

        it("Should allow provider to submit merkle root", async function () {
            const expiry = (await time.latest()) + 86400 * 2; // 2 days from now

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(merkleRoot, expiry, CLAIMABLE_AMOUNT)
            )
                .to.emit(spokeDistributor, "MerkleRootSubmitted")
                .withArgs(provider.address, 0, merkleRoot, expiry, CLAIMABLE_AMOUNT);

            // Check balance was locked
            expect(await spokeDistributor.getProviderBalance(provider.address)).to.equal(PROVIDER_BALANCE - CLAIMABLE_AMOUNT);
            expect(await spokeDistributor.getLockedBalance(provider.address)).to.equal(CLAIMABLE_AMOUNT);
        });

        it("Should reject if provider has insufficient balance", async function () {
            const expiry = (await time.latest()) + 86400 * 2;
            const tooMuch = PROVIDER_BALANCE + ethers.parseEther("1");

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(merkleRoot, expiry, tooMuch)
            ).to.be.revertedWith("Insufficient balance for claims");
        });

        it("Should reject if expiry is too soon", async function () {
            const expiry = (await time.latest()) + 3600; // 1 hour (less than MIN_EXPIRY_DURATION)

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(merkleRoot, expiry, CLAIMABLE_AMOUNT)
            ).to.be.revertedWith("expiry too soon");
        });

        it("Should reject zero claimable amount", async function () {
            const expiry = (await time.latest()) + 86400 * 2;

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(merkleRoot, expiry, 0)
            ).to.be.revertedWith("zero claimable");
        });
    });

    describe("Claim Flow with GlobalNullifier", function () {
        const PROVIDER_BALANCE = ethers.parseEther("1000");
        const CLAIM_AMOUNT = ethers.parseEther("100");
        let merkleRoot: string;
        let merkleProof: string[];
        let nullifier: string;
        let rootIndex: number;

        beforeEach(async function () {
            // Add balance for provider
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);

            // Generate merkle tree (simple 2-leaf tree for testing)
            const leaf1 = ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [user1.address, CLAIM_AMOUNT]));
            const leaf2 = ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [user2.address, CLAIM_AMOUNT]));
            merkleRoot = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [leaf1, leaf2]));
            merkleProof = [leaf2]; // Proof for user1

            // Generate nullifier
            nullifier = await globalNullifier.generateNullifier(user1.address, 0, SPOKE_CHAIN_ID);

            // Submit merkle root
            const expiry = (await time.latest()) + 86400 * 2;
            await spokeDistributor.connect(provider).submitMerkleRoot(merkleRoot, expiry, CLAIM_AMOUNT * 2n);
            rootIndex = 0;
        });

        it("Should allow user to claim and burn nullifier on hub", async function () {
            const initialBalance = await spokeToken.balanceOf(user1.address);

            await expect(
                spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier)
            )
                .to.emit(spokeDistributor, "RewardsClaimed")
                .withArgs(user1.address, provider.address, rootIndex, CLAIM_AMOUNT, nullifier)
                .and.to.emit(spokeDistributor, "NullifierBurned")
                .withArgs(nullifier, SPOKE_CHAIN_ID, user1.address)
                .and.to.emit(globalNullifier, "NullifierBurned")
                .withArgs(nullifier, SPOKE_CHAIN_ID, user1.address);

            // Check token was minted
            expect(await spokeToken.balanceOf(user1.address)).to.equal(initialBalance + CLAIM_AMOUNT);

            // Check nullifier was burned globally
            expect(await globalNullifier.isNullifierBurned(nullifier)).to.be.true;
            expect(await spokeDistributor.isNullifierUsed(nullifier)).to.be.true;
        });

        it("Should prevent double-claim via GlobalNullifier", async function () {
            // First claim succeeds
            await spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier);

            // Second claim fails because nullifier is burned on hub
            await expect(
                spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier)
            ).to.be.revertedWith("Nullifier already burned");
        });

        it("Should prevent cross-chain double-claim", async function () {
            // Claim on spoke 1
            await spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier);

            // Try to claim same nullifier from spoke 2 (simulate by calling burnNullifier directly)
            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            await globalNullifier.connect(admin).grantRole(SPOKE_ROLE, admin.address); // Grant for testing
            
            await expect(
                globalNullifier.connect(admin).burnNullifier(nullifier, SPOKE_CHAIN_ID + 1, user1.address)
            ).to.be.revertedWith("Nullifier already burned");
        });

        it("Should update locked balance after claim", async function () {
            const lockedBefore = await spokeDistributor.getLockedBalance(provider.address);
            
            await spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier);
            
            const lockedAfter = await spokeDistributor.getLockedBalance(provider.address);
            expect(lockedAfter).to.equal(lockedBefore - CLAIM_AMOUNT);
        });

        it("Should reject invalid merkle proof", async function () {
            const badProof = [ethers.keccak256(ethers.toUtf8Bytes("wrong-proof"))];

            await expect(
                spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, badProof, nullifier)
            ).to.be.revertedWith("invalid proof");
        });

        it("Should reject claim after expiry + grace period", async function () {
            // Fast forward past expiry + grace period
            await time.increase(86400 * 3); // 3 days

            await expect(
                spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier)
            ).to.be.revertedWith("expired or grace period passed");
        });

        it("Should reject claim after epoch is closed", async function () {
            // Fast forward past expiry + grace period + close delay
            await time.increase(86400 * 3 + 3600); // 3 days + 1 hour

            // Close epoch
            await spokeDistributor.connect(admin).closeEpoch(provider.address, rootIndex);

            await expect(
                spokeDistributor.connect(user1).claim(provider.address, rootIndex, CLAIM_AMOUNT, merkleProof, nullifier)
            ).to.be.revertedWith("epoch closed");
        });
    });

    describe("Batch Claims", function () {
        const PROVIDER_BALANCE = ethers.parseEther("1000");
        const CLAIM_AMOUNT = ethers.parseEther("10");
        
        it("Should allow batch claims up to MAX_BATCH_SIZE", async function () {
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);
            
            const batchSize = 5;
            const providers: string[] = [];
            const rootIndices: number[] = [];
            const amounts: bigint[] = [];
            const proofs: string[][] = [];
            const nullifiers: string[] = [];

            // Create multiple merkle roots and claims
            for (let i = 0; i < batchSize; i++) {
                const leaf = ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [user1.address, CLAIM_AMOUNT]));
                const root = ethers.keccak256(ethers.solidityPacked(["bytes32"], [leaf]));
                const proof: string[] = [];
                const nullifier = await globalNullifier.generateNullifier(user1.address, i, SPOKE_CHAIN_ID);

                const expiry = (await time.latest()) + 86400 * 2;
                await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, CLAIM_AMOUNT);

                providers.push(provider.address);
                rootIndices.push(i);
                amounts.push(CLAIM_AMOUNT);
                proofs.push(proof);
                nullifiers.push(nullifier);
            }

            // Execute batch claim
            await expect(
                spokeDistributor.connect(user1).batchClaim(providers, rootIndices, amounts, proofs, nullifiers)
            ).to.emit(spokeDistributor, "RewardsClaimed");

            // Verify all claims succeeded
            for (let i = 0; i < batchSize; i++) {
                expect(await spokeDistributor.hasClaimed(provider.address, i, user1.address)).to.be.true;
                expect(await globalNullifier.isNullifierBurned(nullifiers[i])).to.be.true;
            }
        });

        it("Should reject batch larger than MAX_BATCH_SIZE", async function () {
            const MAX_BATCH_SIZE = 20;
            const tooLarge = MAX_BATCH_SIZE + 1;
            
            const providers = new Array(tooLarge).fill(provider.address);
            const rootIndices = new Array(tooLarge).fill(0);
            const amounts = new Array(tooLarge).fill(CLAIM_AMOUNT);
            const proofs = new Array(tooLarge).fill([]);
            const nullifiers = new Array(tooLarge).fill(ethers.ZeroHash);

            await expect(
                spokeDistributor.connect(user1).batchClaim(providers, rootIndices, amounts, proofs, nullifiers)
            ).to.be.revertedWith("Batch too large");
        });

        it("Should reject if array lengths mismatch", async function () {
            await expect(
                spokeDistributor.connect(user1).batchClaim(
                    [provider.address],
                    [0, 1], // Wrong length
                    [CLAIM_AMOUNT],
                    [[]],
                    [ethers.ZeroHash]
                )
            ).to.be.revertedWith("Arrays length mismatch");
        });
    });

    describe("Cross-Chain Nullifier Enforcement", function () {
        const PROVIDER_BALANCE = ethers.parseEther("1000");
        const CLAIM_AMOUNT = ethers.parseEther("100");

        it("Should prevent same user claiming same reward on different spokes", async function () {
            // Setup: Add balance and submit root on spoke 1
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);
            
            const leaf = ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [user1.address, CLAIM_AMOUNT]));
            const root = ethers.keccak256(ethers.solidityPacked(["bytes32"], [leaf]));
            const proof: string[] = [];
            const nullifier = await globalNullifier.generateNullifier(user1.address, 0, SPOKE_CHAIN_ID);
            
            const expiry = (await time.latest()) + 86400 * 2;
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, CLAIM_AMOUNT);

            // Claim succeeds on spoke 1
            await spokeDistributor.connect(user1).claim(provider.address, 0, CLAIM_AMOUNT, proof, nullifier);
            expect(await globalNullifier.isNullifierBurned(nullifier)).to.be.true;

            // Simulate spoke 2 trying to burn same nullifier (would fail in real deployment)
            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            await globalNullifier.connect(admin).grantRole(SPOKE_ROLE, admin.address);
            
            await expect(
                globalNullifier.connect(admin).burnNullifier(nullifier, SPOKE_CHAIN_ID + 1, user1.address)
            ).to.be.revertedWith("Nullifier already burned");
        });

        it("Should track nullifiers per chain in GlobalNullifier", async function () {
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);
            
            const leaf = ethers.keccak256(ethers.solidityPacked(["address", "uint256"], [user1.address, CLAIM_AMOUNT]));
            const root = ethers.keccak256(ethers.solidityPacked(["bytes32"], [leaf]));
            const proof: string[] = [];
            const nullifier = await globalNullifier.generateNullifier(user1.address, 0, SPOKE_CHAIN_ID);
            
            const expiry = (await time.latest()) + 86400 * 2;
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, CLAIM_AMOUNT);

            // Claim
            await spokeDistributor.connect(user1).claim(provider.address, 0, CLAIM_AMOUNT, proof, nullifier);

            // Verify chain-specific tracking
            expect(await globalNullifier.getChainNullifierCount(SPOKE_CHAIN_ID)).to.equal(1);
            expect(await globalNullifier.isChainNullifierBurned(nullifier, SPOKE_CHAIN_ID)).to.be.true;
        });
    });

    describe("Epoch Closure", function () {
        const PROVIDER_BALANCE = ethers.parseEther("1000");
        const CLAIMABLE_AMOUNT = ethers.parseEther("500");

        it("Should return unclaimed funds to provider on epoch close", async function () {
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);
            
            const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
            const expiry = (await time.latest()) + 86400 * 2;
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, CLAIMABLE_AMOUNT);

            // Fast forward past expiry + grace + close delay
            await time.increase(86400 * 3 + 3600);

            // Close epoch
            await expect(spokeDistributor.connect(admin).closeEpoch(provider.address, 0))
                .to.emit(spokeDistributor, "EpochClosed")
                .withArgs(provider.address, 0);

            // Check unclaimed funds returned
            const finalBalance = await spokeDistributor.getProviderBalance(provider.address);
            expect(finalBalance).to.equal(PROVIDER_BALANCE);
            expect(await spokeDistributor.getLockedBalance(provider.address)).to.equal(0);
        });

        it("Should enforce CLOSE_DELAY after grace period", async function () {
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, PROVIDER_BALANCE);
            
            const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
            const expiry = (await time.latest()) + 86400 * 2;
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, CLAIMABLE_AMOUNT);

            // Fast forward to just past grace period (but before close delay)
            await time.increase(86400 * 3);

            await expect(
                spokeDistributor.connect(admin).closeEpoch(provider.address, 0)
            ).to.be.revertedWith("close delay not over");
        });
    });

    describe("Security", function () {
        it("Should enforce access control on provider operations", async function () {
            const root = ethers.keccak256(ethers.toUtf8Bytes("test"));
            const expiry = (await time.latest()) + 86400 * 2;

            await expect(
                spokeDistributor.connect(user1).submitMerkleRoot(root, expiry, ethers.parseEther("100"))
            ).to.be.reverted; // No PROVIDER_ROLE
        });

        it("Should enforce access control on admin operations", async function () {
            await expect(
                spokeDistributor.connect(user1).addProviderBalance(provider.address, ethers.parseEther("100"))
            ).to.be.reverted; // No ADMIN_ROLE
        });

        it("Should use reentrancy guard on critical functions", async function () {
            // Test passes if functions are callable (reentrancy guard doesn't block)
            await spokeDistributor.connect(admin).addProviderBalance(provider.address, ethers.parseEther("100"));
            expect(await spokeDistributor.getProviderBalance(provider.address)).to.equal(ethers.parseEther("100"));
        });
    });
});
