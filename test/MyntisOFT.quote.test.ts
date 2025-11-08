import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MyntisOFT } from "../typechain-types";
import { LayerZeroEndpointMock } from "../typechain-types";

describe("MyntisOFT - quoteBridge Input Validation Fix", function () {
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

    // Set a peer for testing
    const peerAddress = ethers.zeroPadValue(user1.address, 32);
    await myntisOFT.setPeer(2, peerAddress);

    return { myntisOFT, deployer, user1 };
  }

  describe("quoteBridge Input Validation", function () {
    it("should fail when quoting zero amount", async function () {
      const { myntisOFT, user1 } = await loadFixture(deployContractsFixture);
      
      // After fix, should fail with "MyntisOFT: zero amount"
      await expect(
        myntisOFT.quoteBridge(
          2, // dstEid
          user1.address, // to
          0, // amount - zero
          "0x", // metadata
          "0x", // options
          false // payInLzToken
        )
      ).to.be.revertedWith("MyntisOFT: zero amount");
    });

    it("should fail when quoting to zero address", async function () {
      const { myntisOFT } = await loadFixture(deployContractsFixture);
      
      // After fix, should fail with "MyntisOFT: zero recipient"
      await expect(
        myntisOFT.quoteBridge(
          2, // dstEid
          ethers.ZeroAddress, // to - zero address
          ethers.parseEther("100"), // amount
          "0x", // metadata
          "0x", // options
          false // payInLzToken
        )
      ).to.be.revertedWith("MyntisOFT: zero recipient");
    });

    it("should pass with valid inputs", async function () {
      const { myntisOFT, user1 } = await loadFixture(deployContractsFixture);
      
      // This should succeed
      const fee = await myntisOFT.quoteBridge(
        2, // dstEid
        user1.address, // to
        ethers.parseEther("100"), // amount
        "0x", // metadata
        "0x", // options
        false // payInLzToken
      );
      
      expect(fee).to.not.be.undefined;
      expect(fee.nativeFee).to.not.be.undefined;
    });
  });
});

