import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

describe("SpokeDistributor", function () {
    let owner: Signer;
    let user1: Signer;
    let user2: Signer;
    let provider: Signer;
    
    let spokeDistributor: Contract;
    let spokeToken: Contract;
    let globalNullifier: Contract;
    
    const HUB_CHAIN_ID = 84532;
    const SPOKE_CHAIN_ID = 11155111;

    beforeEach(async function () {
        [owner, user1, user2, provider] = await ethers.getSigners();
        
        await deployContracts();
        await configureDistributor();
    });

    async function deployContracts() {
        // Deploy spoke token
        const MyntisSpoke = await ethers.getContractFactory("MyntisSpoke");
        spokeToken = await MyntisSpoke.deploy(
            "Myntis Spoke",
            "MYNTS",
            HUB_CHAIN_ID,
            ethers.constants.AddressZero, // Mock hub token
            await owner.getAddress()
        );
        await spokeToken.deployed();
        
        // Deploy GlobalNullifier
        const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
        globalNullifier = await GlobalNullifier.deploy(await owner.getAddress());
        await globalNullifier.deployed();
        
        // Deploy SpokeDistributor
        const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
        spokeDistributor = await SpokeDistributor.deploy(
            HUB_CHAIN_ID,
            globalNullifier.address,
            spokeToken.address,
            await owner.getAddress()
        );
        await spokeDistributor.deployed();
    }

    async function configureDistributor() {
        // Grant provider role
        const providerRole = await spokeDistributor.PROVIDER_ROLE();
        await spokeDistributor.grantRole(providerRole, await provider.getAddress());
        
        // Configure spoke token for distributor
        await spokeToken.setBridgeRole(spokeDistributor.address, true);
    }

    describe("Merkle Root Management", function () {
        it("Should submit Merkle root successfully", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400; // 1 day
            const totalClaimable = 1000 * 1e18;
            
            await spokeDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                totalClaimable
            );
            
            const epochInfo = await spokeDistributor.getEpochInfo(
                await provider.getAddress(),
                0
            );
            
            expect(epochInfo.root).to.equal(merkleRoot);
            expect(epochInfo.expiry).to.equal(expiry);
            expect(epochInfo.totalClaimable).to.equal(totalClaimable);
            expect(epochInfo.closed).to.be.false;
        });

        it("Should reject Merkle root with invalid expiry", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour (too soon)
            const totalClaimable = 1000 * 1e18;
            
            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(
                    merkleRoot,
                    expiry,
                    totalClaimable
                )
            ).to.be.revertedWith("expiry too soon");
        });

        it("Should reject zero claimable amount", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            const totalClaimable = 0;
            
            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(
                    merkleRoot,
                    expiry,
                    totalClaimable
                )
            ).to.be.revertedWith("zero claimable");
        });
    });

    describe("Reward Claims", function () {
        let merkleRoot: string;
        let expiry: number;
        let totalClaimable: number;
        let merkleProof: string[];

        beforeEach(async function () {
            // Setup Merkle root
            merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            expiry = Math.floor(Date.now() / 1000) + 86400;
            totalClaimable = 1000 * 1e18;
            
            await spokeDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                totalClaimable
            );
            
            // Mock Merkle proof (in real implementation, this would be generated)
            merkleProof = [];
        });

        it("Should claim rewards successfully", async function () {
            const user = await user1.getAddress();
            const amount = 100 * 1e18;
            const nullifier = await spokeDistributor.generateNullifier(user, 0, SPOKE_CHAIN_ID);
            
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                0,
                amount,
                merkleProof,
                nullifier
            );
            
            const balance = await spokeToken.balanceOf(user);
            expect(balance).to.equal(amount);
            
            const hasClaimed = await spokeDistributor.hasClaimed(
                await provider.getAddress(),
                0,
                user
            );
            expect(hasClaimed).to.be.true;
        });

        it("Should prevent double-claiming with same nullifier", async function () {
            const user = await user1.getAddress();
            const amount = 100 * 1e18;
            const nullifier = await spokeDistributor.generateNullifier(user, 0, SPOKE_CHAIN_ID);
            
            // First claim
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                0,
                amount,
                merkleProof,
                nullifier
            );
            
            // Second claim with same nullifier should fail
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    0,
                    amount,
                    merkleProof,
                    nullifier
                )
            ).to.be.revertedWith("nullifier already used");
        });

        it("Should prevent double-claiming from same epoch", async function () {
            const user = await user1.getAddress();
            const amount = 100 * 1e18;
            const nullifier1 = await spokeDistributor.generateNullifier(user, 0, SPOKE_CHAIN_ID);
            const nullifier2 = await spokeDistributor.generateNullifier(user, 0, SPOKE_CHAIN_ID + 1);
            
            // First claim
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                0,
                amount,
                merkleProof,
                nullifier1
            );
            
            // Second claim from same epoch should fail
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    0,
                    amount,
                    merkleProof,
                    nullifier2
                )
            ).to.be.revertedWith("already claimed");
        });

        it("Should handle batch claims", async function () {
            const users = [await user1.getAddress(), await user2.getAddress()];
            const amounts = [100 * 1e18, 200 * 1e18];
            const nullifiers = [
                await spokeDistributor.generateNullifier(users[0], 0, SPOKE_CHAIN_ID),
                await spokeDistributor.generateNullifier(users[1], 0, SPOKE_CHAIN_ID)
            ];
            const proofs = [merkleProof, merkleProof];
            
            await spokeDistributor.batchClaim(
                [await provider.getAddress(), await provider.getAddress()],
                [0, 0],
                amounts,
                proofs,
                nullifiers
            );
            
            const balance1 = await spokeToken.balanceOf(users[0]);
            const balance2 = await spokeToken.balanceOf(users[1]);
            
            expect(balance1).to.equal(amounts[0]);
            expect(balance2).to.equal(amounts[1]);
        });
    });

    describe("Epoch Management", function () {
        it("Should close epoch after grace period", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
            const totalClaimable = 1000 * 1e18;
            
            await spokeDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                totalClaimable
            );
            
            // Fast forward time past grace period
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine", []);
            
            // Close epoch
            await spokeDistributor.closeEpoch(await provider.getAddress(), 0);
            
            const epochInfo = await spokeDistributor.getEpochInfo(
                await provider.getAddress(),
                0
            );
            expect(epochInfo.closed).to.be.true;
        });

        it("Should prevent closing epoch before grace period", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            const totalClaimable = 1000 * 1e18;
            
            await spokeDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                totalClaimable
            );
            
            // Try to close before grace period
            await expect(
                spokeDistributor.closeEpoch(await provider.getAddress(), 0)
            ).to.be.revertedWith("grace period not over");
        });
    });

    describe("Nullifier Management", function () {
        it("Should generate consistent nullifiers", async function () {
            const user = await user1.getAddress();
            const rootId = 0;
            const chainId = SPOKE_CHAIN_ID;
            
            const nullifier1 = await spokeDistributor.generateNullifier(user, rootId, chainId);
            const nullifier2 = await spokeDistributor.generateNullifier(user, rootId, chainId);
            
            expect(nullifier1).to.equal(nullifier2);
        });

        it("Should generate different nullifiers for different users", async function () {
            const user1 = await user1.getAddress();
            const user2 = await user2.getAddress();
            const rootId = 0;
            const chainId = SPOKE_CHAIN_ID;
            
            const nullifier1 = await spokeDistributor.generateNullifier(user1, rootId, chainId);
            const nullifier2 = await spokeDistributor.generateNullifier(user2, rootId, chainId);
            
            expect(nullifier1).to.not.equal(nullifier2);
        });

        it("Should track nullifier usage", async function () {
            const user = await user1.getAddress();
            const nullifier = await spokeDistributor.generateNullifier(user, 0, SPOKE_CHAIN_ID);
            
            // Check nullifier not used initially
            const isUsed = await spokeDistributor.isNullifierUsed(nullifier);
            expect(isUsed).to.be.false;
            
            // Claim with nullifier
            await spokeDistributor.connect(user1).claim(
                await provider.getAddress(),
                0,
                100 * 1e18,
                [],
                nullifier
            );
            
            // Check nullifier is now used
            const isUsedAfter = await spokeDistributor.isNullifierUsed(nullifier);
            expect(isUsedAfter).to.be.true;
        });
    });

    describe("Access Control", function () {
        it("Should only allow providers to submit Merkle roots", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            const totalClaimable = 1000 * 1e18;
            
            await expect(
                spokeDistributor.connect(user1).submitMerkleRoot(
                    merkleRoot,
                    expiry,
                    totalClaimable
                )
            ).to.be.revertedWith("AccessControl: account");
        });

        it("Should only allow admin to close epochs", async function () {
            await expect(
                spokeDistributor.connect(user1).closeEpoch(await provider.getAddress(), 0)
            ).to.be.revertedWith("AccessControl: account");
        });
    });

    describe("Error Handling", function () {
        it("Should revert on invalid provider", async function () {
            await expect(
                spokeDistributor.connect(user1).claim(
                    ethers.constants.AddressZero,
                    0,
                    100 * 1e18,
                    [],
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"))
                )
            ).to.be.revertedWith("invalid provider");
        });

        it("Should revert on invalid root index", async function () {
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    999,
                    100 * 1e18,
                    [],
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"))
                )
            ).to.be.revertedWith("bad index");
        });

        it("Should revert on zero amount", async function () {
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    0,
                    0,
                    [],
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"))
                )
            ).to.be.revertedWith("zero amount");
        });

        it("Should revert on expired epoch", async function () {
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
            const totalClaimable = 1000 * 1e18;
            
            await spokeDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                totalClaimable
            );
            
            // Fast forward past expiry + grace period
            await ethers.provider.send("evm_increaseTime", [86400 * 2]);
            await ethers.provider.send("evm_mine", []);
            
            await expect(
                spokeDistributor.connect(user1).claim(
                    await provider.getAddress(),
                    0,
                    100 * 1e18,
                    [],
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"))
                )
            ).to.be.revertedWith("expired or grace period passed");
        });
    });

    describe("Integration Tests", function () {
        it("Should handle complete reward distribution flow", async function () {
            // 1. Submit Merkle root
            const merkleRoot = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-root"));
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            const totalClaimable = 1000 * 1e18;
            
            await spokeDistributor.connect(provider).submitMerkleRoot(
                merkleRoot,
                expiry,
                totalClaimable
            );
            
            // 2. Multiple users claim rewards
            const users = [await user1.getAddress(), await user2.getAddress()];
            const amounts = [300 * 1e18, 200 * 1e18];
            
            for (let i = 0; i < users.length; i++) {
                const nullifier = await spokeDistributor.generateNullifier(users[i], 0, SPOKE_CHAIN_ID);
                
                await spokeDistributor.connect(await ethers.getSigner(users[i])).claim(
                    await provider.getAddress(),
                    0,
                    amounts[i],
                    [],
                    nullifier
                );
            }
            
            // 3. Verify balances
            const balance1 = await spokeToken.balanceOf(users[0]);
            const balance2 = await spokeToken.balanceOf(users[1]);
            
            expect(balance1).to.equal(amounts[0]);
            expect(balance2).to.equal(amounts[1]);
            
            // 4. Verify epoch state
            const epochInfo = await spokeDistributor.getEpochInfo(
                await provider.getAddress(),
                0
            );
            expect(epochInfo.claimedAmount).to.equal(amounts[0] + amounts[1]);
        });
    });
});
