import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { MyntisOFT, MyntisSpokeOFT } from "../typechain-types";
import { LayerZeroEndpointMock } from "../typechain-types";

describe("MyntisOFT - Null Checks Fix", function () {
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

    // Set a peer for testing bridge function
    const peerAddress = ethers.zeroPadValue(user1.address, 32);
    await myntisOFT.setPeer(2, peerAddress);

    return { myntisOFT, mockEndpoint, deployer, user1 };
  }

  describe("Bridge Function Null Checks", function () {
    it("should fail when bridge to zero address", async function () {
      const { myntisOFT, deployer } = await loadFixture(deployContractsFixture);
      
      // Mint tokens to deployer
      const mintAmount = ethers.parseEther("1000");
      await myntisOFT.mint(deployer.address, mintAmount);

      // After fix, should fail with "MyntisOFT: zero recipient"
      await expect(
        myntisOFT.bridge(
          2, // dstEid
          ethers.ZeroAddress, // to - zero address
          ethers.parseEther("100"),
          "0x", // metadata
          "0x", // options
          deployer.address, // refundAddress
          false // payInLzToken
        )
      ).to.be.revertedWith("MyntisOFT: zero recipient");
    });

    it("should fail when bridge with zero refund address", async function () {
      const { myntisOFT, deployer, user1 } = await loadFixture(deployContractsFixture);
      
      const mintAmount = ethers.parseEther("1000");
      await myntisOFT.mint(deployer.address, mintAmount);

      // After fix, should fail with "MyntisOFT: zero refund"
      await expect(
        myntisOFT.bridge(
          2, // dstEid
          user1.address, // to
          ethers.parseEther("100"),
          "0x", // metadata
          "0x", // options
          ethers.ZeroAddress, // refundAddress - zero address
          false // payInLzToken
        )
      ).to.be.revertedWith("MyntisOFT: zero refund");
    });
  });
});

describe("MyntisSpokeOFT - Null Checks Fix", function () {
  async function deploySpokeOFTFixture() {
    const [deployer, user1] = await ethers.getSigners();

    const MyntisSpokeOFTFactory = await ethers.getContractFactory("MyntisSpokeOFT");
    const spokeOFT = await MyntisSpokeOFTFactory.deploy();
    await spokeOFT.waitForDeployment();

    await spokeOFT.initialize(
      "Myntis Spoke",
      "MYNTS",
      deployer.address,
      1, // hubChainId
      deployer.address // hubToken
    );

    return { spokeOFT, deployer, user1 };
  }

  describe("BridgeIn Function Null Checks", function () {
    it("should fail when bridgeIn to zero address", async function () {
      const { spokeOFT, deployer } = await loadFixture(deploySpokeOFTFixture);
      
      // After fix, should fail with "MyntisSpokeOFT: zero recipient"
      await expect(
        spokeOFT.bridgeIn(
          ethers.ZeroAddress, // _to - zero address
          ethers.parseEther("100") // _amount
        )
      ).to.be.revertedWith("MyntisSpokeOFT: zero recipient");
    });
  });

  describe("ReceiveFrom Function Null Checks", function () {
    it("should fail when receiveFrom to zero address", async function () {
      const { spokeOFT, deployer } = await loadFixture(deploySpokeOFTFixture);
      
      // After fix, should fail with "MyntisSpokeOFT: zero recipient"
      await expect(
        spokeOFT.receiveFrom(
          1, // _srcChainId
          ethers.ZeroAddress, // _to - zero address
          ethers.parseEther("100") // _amount
        )
      ).to.be.revertedWith("MyntisSpokeOFT: zero recipient");
    });
  });
});

