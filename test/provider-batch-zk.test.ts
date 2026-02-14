/**
 * Provider Batch ZK Proof Integration Tests
 * 
 * Tests the full flow:
 * 1. Generate provider batch ZK proof
 * 2. Submit Merkle root with proof to ZKMerkleDistributor
 * 3. Verify proof on-chain
 * 4. User claims with Merkle proof
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Provider Batch ZK Proof Integration", function () {
    let token: any;
    let verifier: any;
    let distributor: any;
    let admin: SignerWithAddress;
    let provider: SignerWithAddress;
    let user: SignerWithAddress;

    beforeEach(async function () {
        [admin, provider, user] = await ethers.getSigners();

        // Deploy token
        const LayerZeroEndpointMockFactory = await ethers.getContractFactory("LayerZeroEndpointMock");
        const mockEndpoint = await LayerZeroEndpointMockFactory.deploy(1);
        await mockEndpoint.waitForDeployment();

        const Token = await ethers.getContractFactory("Myntis");
        token = await Token.deploy(await mockEndpoint.getAddress(), admin.address);
        await token.waitForDeployment();

        // Deploy mock Groth16 verifier
        const Verifier = await ethers.getContractFactory("MockGroth16Verifier");
        verifier = await Verifier.deploy();
        await verifier.waitForDeployment();

        // Deploy ZKMerkleDistributor
        const Distributor = await ethers.getContractFactory("ZKMerkleDistributor");
        distributor = await Distributor.deploy(
            await token.getAddress(),
            await verifier.getAddress(),
            admin.address
        );
        await distributor.waitForDeployment();

        // Grant PROVIDER_ROLE
        const providerRole = await distributor.PROVIDER_ROLE();
        await distributor.grantRole(providerRole, provider.address);

        // Fund provider balance
        const fundingAmount = ethers.parseEther("10000");
        await token.mint(admin.address, fundingAmount);
        await token.approve(await distributor.getAddress(), fundingAmount);
        await distributor.addProviderBalance(provider.address, fundingAmount);
    });

    it("Should accept valid ZK proof for batch submission", async function () {
        const root = ethers.keccak256(ethers.toUtf8Bytes("test"));
        const expiry = (await time.latest()) + 7 * 24 * 60 * 60;
        const totalAmount = ethers.parseEther("1000");

        const proofA: [bigint, bigint] = [0n, 0n];
        const proofB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
        const proofC: [bigint, bigint] = [0n, 0n];
        const publicInputs: [bigint, bigint, bigint] = [
            BigInt(root),
            totalAmount,
            0n
        ];

        await expect(
            distributor.connect(provider).submitMerkleRoot(
                root,
                expiry,
                totalAmount,
                proofA,
                proofB,
                proofC,
                publicInputs
            )
        ).to.emit(distributor, "MerkleRootSubmitted");
    });

    it("Should reject invalid ZK proof", async function () {
        // Test that invalid proofs are rejected
        const root = ethers.keccak256(ethers.toUtf8Bytes("test"));
        const expiry = (await time.latest()) + 7 * 24 * 60 * 60;
        const totalAmount = ethers.parseEther("1000");

        await verifier.setShouldVerify(false);

        // Invalid proof (mock verifier rejects)
        const invalidProofA = [0, 0];
        const invalidProofB = [[0, 0], [0, 0]];
        const invalidProofC = [0, 0];
        const publicInputs = [
            ethers.getBigInt(root),
            totalAmount,
            0
        ];

        await expect(
            distributor.connect(provider).submitMerkleRoot(
                root,
                expiry,
                totalAmount,
                invalidProofA,
                invalidProofB,
                invalidProofC,
                publicInputs
            )
        ).to.be.revertedWith("Invalid batch ZK proof");
    });

    it("Should allow user claims with Merkle proof only", async function () {
        // Test that users can claim with just Merkle proof (no ZK needed)
        // This would require a submitted epoch first
        const amount = ethers.parseEther("100");
        const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
        const leaf = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256"],
                [user.address, amount, chainId]
            )
        );

        const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
        const totalAmount = amount;

        const proofA: [bigint, bigint] = [0n, 0n];
        const proofB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
        const proofC: [bigint, bigint] = [0n, 0n];
        const publicInputs: [bigint, bigint, bigint] = [0n, totalAmount, 0n];

        await distributor.connect(provider).submitMerkleRoot(
            leaf,
            expiry,
            totalAmount,
            proofA,
            proofB,
            proofC,
            publicInputs
        );

        const balanceBefore = await token.balanceOf(user.address);
        await distributor.connect(user).claim(provider.address, 0, amount, []);
        const balanceAfter = await token.balanceOf(user.address);

        expect(balanceAfter - balanceBefore).to.equal(amount);
    });
});
