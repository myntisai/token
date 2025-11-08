import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MyntisOFT } from "../typechain-types";
import { LayerZeroEndpointMock } from "../typechain-types";

describe("MyntisOFT - setPeer Validation Fix", function () {
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

  describe("setPeer Validation", function () {
    it("should fail when setting zero peer", async function () {
      const { myntisOFT } = await loadFixture(deployContractsFixture);
      
      // After fix, should fail with "MyntisOFT: cannot set zero peer"
      await expect(
        myntisOFT.setPeer(2, ethers.ZeroHash) // bytes32(0)
      ).to.be.revertedWith("MyntisOFT: cannot set zero peer");
    });

    it("should pass when setting valid peer", async function () {
      const { myntisOFT, user1 } = await loadFixture(deployContractsFixture);
      
      const peerAddress = ethers.zeroPadValue(user1.address, 32);
      
      // This should succeed
      await expect(
        myntisOFT.setPeer(2, peerAddress)
      ).to.not.be.reverted;

      const peer = await myntisOFT.peers(2);
      expect(peer).to.equal(peerAddress);
    });
  });
});

