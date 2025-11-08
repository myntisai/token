import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MyntisOFT } from "../typechain-types";
import { LayerZeroEndpointMock } from "../typechain-types";

describe("MyntisOFT - Burn Balance Check Fix", function () {
  async function deployContractsFixture() {
    const [deployer, user1] = await ethers.getSigners();

    const LayerZeroEndpointMockFactory = await ethers.getContractFactory("LayerZeroEndpointMock");
    const mockEndpoint = await LayerZeroEndpointMockFactory.deploy(1);
    await mockEndpoint.waitForDeployment();

    const MyntisOFTFactory = await ethers.getContractFactory("MyntisOFT");
    const myntisOFT = await MyntisOFTFactory.deploy(
      "Myntis",
      "MYNT",
      await mockEndpoint.getAddress(),
      deployer.address
    );
    await myntisOFT.waitForDeployment();

    return { myntisOFT, deployer, user1 };
  }

  describe("Burn Balance Validation", function () {
    it("should fail when burning more than balance", async function () {
      const { myntisOFT, deployer, user1 } = await loadFixture(deployContractsFixture);
      
      // Mint some tokens to user1
      const mintAmount = ethers.parseEther("1000");
      await myntisOFT.mint(user1.address, mintAmount);
      
      const balance = await myntisOFT.balanceOf(user1.address);
      expect(balance).to.equal(mintAmount);

      // Try to burn more than balance
      const burnAmount = ethers.parseEther("2000");
      
      // This should fail with clear error message
      // Initially will fail with unclear error (ERC20 transfer error)
      // After fix, should fail with "MyntisOFT: insufficient balance"
      await expect(
        myntisOFT.connect(user1).burn(user1.address, burnAmount)
      ).to.be.revertedWith("MyntisOFT: insufficient balance");
    });

    it("should pass when burning within balance", async function () {
      const { myntisOFT, deployer, user1 } = await loadFixture(deployContractsFixture);
      
      const mintAmount = ethers.parseEther("1000");
      await myntisOFT.mint(user1.address, mintAmount);
      
      const burnAmount = ethers.parseEther("500");
      
      // This should succeed
      await expect(
        myntisOFT.connect(user1).burn(user1.address, burnAmount)
      ).to.not.be.reverted;

      const balanceAfter = await myntisOFT.balanceOf(user1.address);
      expect(balanceAfter).to.equal(mintAmount - burnAmount);
    });

    it("should have clear error on insufficient balance", async function () {
      const { myntisOFT, deployer, user1 } = await loadFixture(deployContractsFixture);
      
      // Don't mint any tokens - user1 has zero balance
      const burnAmount = ethers.parseEther("100");
      
      // This should fail with clear error message
      await expect(
        myntisOFT.connect(user1).burn(user1.address, burnAmount)
      ).to.be.revertedWith("MyntisOFT: insufficient balance");
    });

    it("should fail when burning zero amount", async function () {
      const { myntisOFT, deployer, user1 } = await loadFixture(deployContractsFixture);
      
      const mintAmount = ethers.parseEther("1000");
      await myntisOFT.mint(user1.address, mintAmount);
      
      // After fix, should fail with "MyntisOFT: zero amount"
      await expect(
        myntisOFT.connect(user1).burn(user1.address, 0)
      ).to.be.revertedWith("MyntisOFT: zero amount");
    });
  });
});

