import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SpokeDistributor, MyntisOFTSpoke } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SpokeDistributor - Cross-Chain Claims", function () {
    let spokeDistributor: SpokeDistributor;
    let spokeToken: MyntisOFTSpoke;
    let admin: SignerWithAddress;
    let provider: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const HUB_EID = 40245;
    const LOCAL_EID = 1;
    let chainId: bigint;

    beforeEach(async function () {
        [admin, provider, user1, user2] = await ethers.getSigners();

        const network = await ethers.provider.getNetwork();
        chainId = BigInt(network.chainId);

        const LayerZeroEndpointMockFactory = await ethers.getContractFactory("LayerZeroEndpointMock");
        const mockEndpoint = await LayerZeroEndpointMockFactory.deploy(Number(chainId));
        await mockEndpoint.waitForDeployment();

        const MyntisOFTSpokeFactory = await ethers.getContractFactory("MyntisOFTSpoke");
        spokeToken = await MyntisOFTSpokeFactory.deploy(
            await mockEndpoint.getAddress(),
            admin.address,
            HUB_EID,
            LOCAL_EID
        );
        await spokeToken.waitForDeployment();

        const QuotaReceiverMock = await ethers.getContractFactory("QuotaReceiverMock");
        const quotaReceiver = await QuotaReceiverMock.deploy();
        await quotaReceiver.waitForDeployment();
        await spokeToken.connect(admin).setQuotaReceiver(await quotaReceiver.getAddress());
        await quotaReceiver.increaseQuota(await spokeToken.getAddress(), ethers.parseEther("1000000"));

        const SpokeDistributorFactory = await ethers.getContractFactory("SpokeDistributor");
        spokeDistributor = await SpokeDistributorFactory.deploy(
            await spokeToken.getAddress(),
            admin.address
        );
        await spokeDistributor.waitForDeployment();

        const MINTER_ROLE = await spokeToken.MINTER_ROLE();
        await spokeToken.connect(admin).grantRole(MINTER_ROLE, await spokeDistributor.getAddress());

        const PROVIDER_ROLE = await spokeDistributor.PROVIDER_ROLE();
        await spokeDistributor.connect(admin).grantRole(PROVIDER_ROLE, provider.address);
    });

    function computeLeaf(claimant: string, amount: bigint): string {
        return ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256"],
                [claimant, amount, chainId]
            )
        );
    }

    function computeNullifier(claimant: string, amount: bigint, providerAddr: string, rootIndex: number): string {
        return ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "address", "uint256"],
                [claimant, amount, chainId, providerAddr, BigInt(rootIndex)]
            )
        );
    }

    describe("Deployment & Configuration", function () {
        it("Should set spoke token reference", async function () {
            expect(await spokeDistributor.spokeToken()).to.equal(await spokeToken.getAddress());
        });

        it("Should have MINTER_ROLE on spoke token", async function () {
            const MINTER_ROLE = await spokeToken.MINTER_ROLE();
            expect(await spokeToken.hasRole(MINTER_ROLE, await spokeDistributor.getAddress())).to.be.true;
        });
    });

    describe("Provider Balance Management", function () {
        it("Should allow admin to add provider balance", async function () {
            const amount = ethers.parseEther("1000");
            await expect(spokeDistributor.connect(admin).addProviderBalance(provider.address, amount))
                .to.emit(spokeDistributor, "ProviderBalanceUpdated")
                .withArgs(provider.address, amount);
        });

        it("Should reject zero amount", async function () {
            await expect(
                spokeDistributor.connect(admin).addProviderBalance(provider.address, 0)
            ).to.be.revertedWith("zero amount");
        });

        it("Should reject zero address", async function () {
            await expect(
                spokeDistributor.connect(admin).addProviderBalance(ethers.ZeroAddress, ethers.parseEther("1"))
            ).to.be.revertedWith("invalid provider");
        });
    });

    describe("Merkle Root Submission", function () {
        it("Should allow provider to submit merkle root", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
            const root = computeLeaf(user1.address, amount);

            await spokeDistributor.connect(admin).addProviderBalance(provider.address, amount);

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount)
            ).to.emit(spokeDistributor, "MerkleRootSubmitted");
        });

        it("Should reject if provider has insufficient balance", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
            const root = computeLeaf(user1.address, amount);

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount)
            ).to.be.revertedWith("Insufficient balance for claims");
        });

        it("Should reject if expiry is too soon", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 3600;
            const root = computeLeaf(user1.address, amount);

            await spokeDistributor.connect(admin).addProviderBalance(provider.address, amount);

            await expect(
                spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount)
            ).to.be.revertedWith("expiry too soon");
        });
    });

    describe("Claim Flow", function () {
        it("Should allow user to claim with valid proof and nullifier", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
            const root = computeLeaf(user1.address, amount);

            await spokeDistributor.connect(admin).addProviderBalance(provider.address, amount);
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount);

            const nullifier = computeNullifier(user1.address, amount, provider.address, 0);
            await expect(
                spokeDistributor.connect(user1).claim(provider.address, 0, amount, [], nullifier)
            ).to.emit(spokeDistributor, "RewardsClaimed");
        });

        it("Should prevent double claims", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
            const root = computeLeaf(user1.address, amount);

            await spokeDistributor.connect(admin).addProviderBalance(provider.address, amount);
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount);

            const nullifier = computeNullifier(user1.address, amount, provider.address, 0);
            await spokeDistributor.connect(user1).claim(provider.address, 0, amount, [], nullifier);

            await expect(
                spokeDistributor.connect(user1).claim(provider.address, 0, amount, [], nullifier)
            ).to.be.revertedWith("already claimed");
        });

        it("Should reject invalid nullifier", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
            const root = computeLeaf(user1.address, amount);

            await spokeDistributor.connect(admin).addProviderBalance(provider.address, amount);
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount);

            const badNullifier = computeNullifier(user2.address, amount, provider.address, 0);
            await expect(
                spokeDistributor.connect(user1).claim(provider.address, 0, amount, [], badNullifier)
            ).to.be.revertedWith("invalid nullifier");
        });
    });

    describe("Batch Claims", function () {
        it("Should reject if array lengths mismatch", async function () {
            await expect(
                spokeDistributor.connect(user1).batchClaim(
                    [provider.address],
                    [0],
                    [ethers.parseEther("1"), ethers.parseEther("2")],
                    [[]],
                    [ethers.keccak256(ethers.toUtf8Bytes("nullifier"))]
                )
            ).to.be.revertedWith("Arrays length mismatch");
        });
    });

    describe("Epoch Closure", function () {
        it("Should return unclaimed funds on epoch close", async function () {
            const amount = ethers.parseEther("100");
            const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
            const root = computeLeaf(user1.address, amount);

            await spokeDistributor.connect(admin).addProviderBalance(provider.address, amount * 2n);
            await spokeDistributor.connect(provider).submitMerkleRoot(root, expiry, amount * 2n);

            const nullifier = computeNullifier(user1.address, amount, provider.address, 0);
            await spokeDistributor.connect(user1).claim(provider.address, 0, amount, [], nullifier);

            await time.increase(4 * 24 * 60 * 60);
            await time.increase(2 * 60 * 60);

            const balanceBefore = await spokeDistributor.getProviderBalance(provider.address);
            await spokeDistributor.connect(admin).closeEpoch(provider.address, 0);
            const balanceAfter = await spokeDistributor.getProviderBalance(provider.address);
            expect(balanceAfter).to.equal(balanceBefore + amount);
        });
    });
});
