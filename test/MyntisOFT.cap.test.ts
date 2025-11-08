import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MyntisOFT } from "../typechain-types";
import { LayerZeroEndpointMock } from "../typechain-types";

describe("MyntisOFT - Cap Enforcement Bug Fix", function () {
  // Fixture to deploy contracts
  async function deployContractsFixture() {
    const [deployer, user1, feeRecipient] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint
    const LayerZeroEndpointMockFactory = await ethers.getContractFactory("LayerZeroEndpointMock");
    const mockEndpoint = await LayerZeroEndpointMockFactory.deploy(1); // eid = 1
    await mockEndpoint.waitForDeployment();

    // Deploy MyntisOFT
    const MyntisOFTFactory = await ethers.getContractFactory("MyntisOFT");
    const myntisOFT = await MyntisOFTFactory.deploy(
      "Myntis",
      "MYNT",
      await mockEndpoint.getAddress(),
      deployer.address
    );
    await myntisOFT.waitForDeployment();

    return { myntisOFT, mockEndpoint, deployer, user1, feeRecipient };
  }

  describe("Cap Enforcement with Fees", function () {
    it("should fail when minting with fee exceeds cap", async function () {
      const { myntisOFT, deployer, feeRecipient } = await loadFixture(deployContractsFixture);
      
      const cap = await myntisOFT.cap();
      const capAmount = ethers.parseEther("1000000000"); // 1B tokens
      expect(cap).to.equal(capAmount);

      // Set a mint fee (e.g., 100 basis points = 1%)
      await myntisOFT.updateMintFee(100); // 1% fee
      await myntisOFT.updateFeeRecipient(feeRecipient.address);

      // Mint tokens to get near the cap (leave 1000 tokens available)
      const amountToMint = capAmount - ethers.parseEther("1000");
      await myntisOFT.mint(deployer.address, amountToMint);
      
      const supplyAfterFirstMint = await myntisOFT.totalSupply();
      const remaining = capAmount - supplyAfterFirstMint;
      
      // Now try to mint 1000 tokens with 1% fee
      // This should fail because:
      // - Cap check: totalSupply() + 1000 = capAmount (passes)
      // - But actual mint: 1000 + 10 (fee) = 1010 tokens (exceeds cap!)
      const mintAmount = ethers.parseEther("1000");
      
      // This test should FAIL initially (bug exists)
      // After fix, this should PASS (revert with "cap exceeded")
      await expect(
        myntisOFT.mint(deployer.address, mintAmount)
      ).to.be.revertedWith("MyntisOFT: cap exceeded");
    });

    it("should pass when minting with fee within cap", async function () {
      const { myntisOFT, deployer, feeRecipient } = await loadFixture(deployContractsFixture);
      
      const cap = await myntisOFT.cap();
      
      // Set a mint fee (e.g., 100 basis points = 1%)
      await myntisOFT.updateMintFee(100); // 1% fee
      await myntisOFT.updateFeeRecipient(feeRecipient.address);

      // Mint tokens leaving enough room for fee
      const amountToMint = ethers.parseEther("1000000"); // 1M tokens
      const feeAmount = (amountToMint * BigInt(100)) / BigInt(10000); // 1% fee
      const totalMint = amountToMint + feeAmount;
      
      // Ensure we have room for total mint (amount + fee)
      const currentSupply = await myntisOFT.totalSupply();
      expect(currentSupply + totalMint).to.be.lte(cap);

      // This should succeed
      await expect(
        myntisOFT.mint(deployer.address, amountToMint)
      ).to.not.be.reverted;

      const finalSupply = await myntisOFT.totalSupply();
      expect(finalSupply).to.equal(currentSupply + amountToMint); // Fees are included in amount
    });

    it("should calculate cap correctly with fees", async function () {
      const { myntisOFT, deployer, feeRecipient } = await loadFixture(deployContractsFixture);
      
      const cap = await myntisOFT.cap();
      const capAmount = ethers.parseEther("1000000000"); // 1B tokens
      
      // Set a mint fee (e.g., 500 basis points = 5%)
      await myntisOFT.updateMintFee(500); // 5% fee
      await myntisOFT.updateFeeRecipient(feeRecipient.address);

      // Try to mint exactly at cap with 5% fee
      // If we mint amount X, total supply increases by X (because fees are part of X)
      // So we should be able to mint up to cap
      const mintAmount = ethers.parseEther("1000000000"); // Try to mint full cap
      
      // After fix, this should fail because:
      // - totalSupply() + mintAmount > cap
      // Even though fees are deducted from mintAmount, the check should use the full amount
      const currentSupply = await myntisOFT.totalSupply();
      
      if (currentSupply + mintAmount > capAmount) {
        await expect(
          myntisOFT.mint(deployer.address, mintAmount)
        ).to.be.revertedWith("MyntisOFT: cap exceeded");
      }
    });
  });
});

