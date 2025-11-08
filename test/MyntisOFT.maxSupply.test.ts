import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MyntisOFT } from "../typechain-types";
import { LayerZeroEndpointMock } from "../typechain-types";

describe("MyntisOFT - _maxSupply Fix", function () {
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

  describe("_maxSupply Handling", function () {
    it("should remove maxSupply variable if not needed", async function () {
      const { myntisOFT } = await loadFixture(deployContractsFixture);
      
      // Option A: Remove _maxSupply
      // After fix, maxSupply() function should either:
      // 1. Be removed, OR
      // 2. Return _cap value
      
      const cap = await myntisOFT.cap();
      const maxSupply = await myntisOFT.maxSupply();
      
      // If Option A (remove), maxSupply should return cap
      // If Option B (enforce), maxSupply should be enforced
      expect(maxSupply).to.equal(cap);
    });

    it("should validate cap update correctly", async function () {
      const { myntisOFT, deployer } = await loadFixture(deployContractsFixture);
      
      const currentCap = await myntisOFT.cap();
      const currentSupply = await myntisOFT.totalSupply();
      
      // Try to set cap below current supply - should fail
      if (currentSupply > 0) {
        await expect(
          myntisOFT.updateCap(currentSupply - ethers.parseEther("1"))
        ).to.be.revertedWith("MyntisOFT: cap < current supply");
      }
      
      // Set cap to current supply - should succeed
      await expect(
        myntisOFT.updateCap(currentSupply)
      ).to.not.be.reverted;
    });
  });
});

