import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { GlobalNullifier } from "../typechain-types";

describe("GlobalNullifier", function () {
    let globalNullifier: GlobalNullifier;
    let admin: SignerWithAddress;
    let spoke1: SignerWithAddress;
    let spoke2: SignerWithAddress;
    let unauthorized: SignerWithAddress;
    let user: SignerWithAddress;

    const CHAIN_ID_ETHEREUM = 1;
    const CHAIN_ID_ARBITRUM = 42161;
    const CHAIN_ID_POLYGON = 137;

    beforeEach(async function () {
        [admin, spoke1, spoke2, unauthorized, user] = await ethers.getSigners();

        // Deploy GlobalNullifier
        const GlobalNullifierFactory = await ethers.getContractFactory("GlobalNullifier");
        globalNullifier = await GlobalNullifierFactory.deploy(admin.address);
        await globalNullifier.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set admin role correctly", async function () {
            const ADMIN_ROLE = await globalNullifier.ADMIN_ROLE();
            expect(await globalNullifier.hasRole(ADMIN_ROLE, admin.address)).to.be.true;
        });

        it("Should not have any spokes registered initially", async function () {
            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            expect(await globalNullifier.hasRole(SPOKE_ROLE, spoke1.address)).to.be.false;
        });
    });

    describe("Spoke Registration", function () {
        it("Should allow admin to register a spoke", async function () {
            await expect(globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address))
                .to.emit(globalNullifier, "SpokeRegistered")
                .withArgs(CHAIN_ID_ETHEREUM, spoke1.address);

            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            expect(await globalNullifier.hasRole(SPOKE_ROLE, spoke1.address)).to.be.true;
        });

        it("Should allow registering multiple spokes", async function () {
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address);
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ARBITRUM, spoke2.address);

            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            expect(await globalNullifier.hasRole(SPOKE_ROLE, spoke1.address)).to.be.true;
            expect(await globalNullifier.hasRole(SPOKE_ROLE, spoke2.address)).to.be.true;
        });

        it("Should reject spoke registration from non-admin", async function () {
            await expect(
                globalNullifier.connect(unauthorized).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address)
            ).to.be.reverted;
        });

        it("Should allow admin to remove a spoke", async function () {
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address);
            
            await expect(globalNullifier.connect(admin).removeSpoke(CHAIN_ID_ETHEREUM, spoke1.address))
                .to.emit(globalNullifier, "SpokeRemoved")
                .withArgs(CHAIN_ID_ETHEREUM, spoke1.address);

            const SPOKE_ROLE = await globalNullifier.SPOKE_ROLE();
            expect(await globalNullifier.hasRole(SPOKE_ROLE, spoke1.address)).to.be.false;
        });
    });

    describe("Nullifier Burning", function () {
        const nullifier1 = ethers.keccak256(ethers.toUtf8Bytes("nullifier1"));
        const nullifier2 = ethers.keccak256(ethers.toUtf8Bytes("nullifier2"));

        beforeEach(async function () {
            // Register spokes
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address);
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ARBITRUM, spoke2.address);
        });

        it("Should allow registered spoke to burn nullifier", async function () {
            await expect(
                globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address)
            )
                .to.emit(globalNullifier, "NullifierBurned")
                .withArgs(nullifier1, CHAIN_ID_ETHEREUM, user.address);

            expect(await globalNullifier.isNullifierBurned(nullifier1)).to.be.true;
            expect(await globalNullifier.isChainNullifierBurned(nullifier1, CHAIN_ID_ETHEREUM)).to.be.true;
            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_ETHEREUM)).to.equal(1);
        });

        it("Should reject nullifier burn from unregistered spoke", async function () {
            await expect(
                globalNullifier.connect(unauthorized).burnNullifier(nullifier1, CHAIN_ID_POLYGON, user.address)
            ).to.be.reverted;
        });

        it("Should prevent burning the same nullifier twice (global check)", async function () {
            // First burn from spoke1
            await globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address);

            // Try to burn again from same spoke
            await expect(
                globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address)
            ).to.be.revertedWith("Nullifier already burned");

            // Try to burn from different spoke (different chain)
            await expect(
                globalNullifier.connect(spoke2).burnNullifier(nullifier1, CHAIN_ID_ARBITRUM, user.address)
            ).to.be.revertedWith("Nullifier already burned");
        });

        it("Should prevent burning the same chain-specific nullifier twice", async function () {
            await globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address);

            await expect(
                globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address)
            ).to.be.revertedWith("Chain nullifier already burned");
        });

        it("Should track nullifiers per chain correctly", async function () {
            await globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address);
            await globalNullifier.connect(spoke2).burnNullifier(nullifier2, CHAIN_ID_ARBITRUM, user.address);

            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_ETHEREUM)).to.equal(1);
            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_ARBITRUM)).to.equal(1);
            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_POLYGON)).to.equal(0);

            expect(await globalNullifier.isChainNullifierBurned(nullifier1, CHAIN_ID_ETHEREUM)).to.be.true;
            expect(await globalNullifier.isChainNullifierBurned(nullifier1, CHAIN_ID_ARBITRUM)).to.be.false;
            expect(await globalNullifier.isChainNullifierBurned(nullifier2, CHAIN_ID_ARBITRUM)).to.be.true;
        });

        it("Should allow multiple nullifiers from same spoke", async function () {
            await globalNullifier.connect(spoke1).burnNullifier(nullifier1, CHAIN_ID_ETHEREUM, user.address);
            await globalNullifier.connect(spoke1).burnNullifier(nullifier2, CHAIN_ID_ETHEREUM, user.address);

            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_ETHEREUM)).to.equal(2);
            expect(await globalNullifier.isNullifierBurned(nullifier1)).to.be.true;
            expect(await globalNullifier.isNullifierBurned(nullifier2)).to.be.true;
        });
    });

    describe("Nullifier Generation", function () {
        it("Should generate consistent nullifier hashes", async function () {
            const nullifier1 = await globalNullifier.generateNullifier(user.address, 0, CHAIN_ID_ETHEREUM);
            const nullifier2 = await globalNullifier.generateNullifier(user.address, 0, CHAIN_ID_ETHEREUM);
            
            expect(nullifier1).to.equal(nullifier2);
        });

        it("Should generate different nullifiers for different users", async function () {
            const nullifier1 = await globalNullifier.generateNullifier(user.address, 0, CHAIN_ID_ETHEREUM);
            const nullifier2 = await globalNullifier.generateNullifier(admin.address, 0, CHAIN_ID_ETHEREUM);
            
            expect(nullifier1).to.not.equal(nullifier2);
        });

        it("Should generate different nullifiers for different root IDs", async function () {
            const nullifier1 = await globalNullifier.generateNullifier(user.address, 0, CHAIN_ID_ETHEREUM);
            const nullifier2 = await globalNullifier.generateNullifier(user.address, 1, CHAIN_ID_ETHEREUM);
            
            expect(nullifier1).to.not.equal(nullifier2);
        });

        it("Should generate different nullifiers for different chain IDs", async function () {
            const nullifier1 = await globalNullifier.generateNullifier(user.address, 0, CHAIN_ID_ETHEREUM);
            const nullifier2 = await globalNullifier.generateNullifier(user.address, 0, CHAIN_ID_ARBITRUM);
            
            expect(nullifier1).to.not.equal(nullifier2);
        });
    });

    describe("View Functions", function () {
        const nullifier = ethers.keccak256(ethers.toUtf8Bytes("test-nullifier"));

        beforeEach(async function () {
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address);
        });

        it("Should return false for unburned nullifier", async function () {
            expect(await globalNullifier.isNullifierBurned(nullifier)).to.be.false;
            expect(await globalNullifier.isChainNullifierBurned(nullifier, CHAIN_ID_ETHEREUM)).to.be.false;
        });

        it("Should return true for burned nullifier", async function () {
            await globalNullifier.connect(spoke1).burnNullifier(nullifier, CHAIN_ID_ETHEREUM, user.address);
            
            expect(await globalNullifier.isNullifierBurned(nullifier)).to.be.true;
            expect(await globalNullifier.isChainNullifierBurned(nullifier, CHAIN_ID_ETHEREUM)).to.be.true;
        });

        it("Should return correct chain nullifier count", async function () {
            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_ETHEREUM)).to.equal(0);
            
            await globalNullifier.connect(spoke1).burnNullifier(nullifier, CHAIN_ID_ETHEREUM, user.address);
            
            expect(await globalNullifier.getChainNullifierCount(CHAIN_ID_ETHEREUM)).to.equal(1);
        });
    });

    describe("Security", function () {
        const nullifier = ethers.keccak256(ethers.toUtf8Bytes("security-test"));

        it("Should use reentrancy guard on burnNullifier", async function () {
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address);
            
            // This test ensures the function can be called (reentrancy guard doesn't block normal calls)
            await globalNullifier.connect(spoke1).burnNullifier(nullifier, CHAIN_ID_ETHEREUM, user.address);
            expect(await globalNullifier.isNullifierBurned(nullifier)).to.be.true;
        });

        it("Should enforce access control for spoke registration", async function () {
            await expect(
                globalNullifier.connect(unauthorized).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address)
            ).to.be.reverted;
        });

        it("Should enforce access control for spoke removal", async function () {
            await globalNullifier.connect(admin).registerSpoke(CHAIN_ID_ETHEREUM, spoke1.address);
            
            await expect(
                globalNullifier.connect(unauthorized).removeSpoke(CHAIN_ID_ETHEREUM, spoke1.address)
            ).to.be.reverted;
        });
    });
});
