import { expect } from "chai";
import { ethers } from "hardhat";

describe("SpokeQuotaReceiver Coverage", function () {
  const HUB_EID = 1;
  const SPOKE_EID = 2;

  async function deployFixture() {
    const [admin, other] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const TokenMock = await ethers.getContractFactory("SpokeQuotaTokenMock");
    const spokeToken = await TokenMock.deploy();
    await spokeToken.waitForDeployment();

    const Receiver = await ethers.getContractFactory("SpokeQuotaReceiver");
    const receiver = await Receiver.deploy(
      await endpoint.getAddress(),
      HUB_EID,
      SPOKE_EID,
      ethers.zeroPadValue(admin.address, 32),
      await spokeToken.getAddress(),
      admin.address
    );
    await receiver.waitForDeployment();

    return { admin, other, endpoint, spokeToken, receiver };
  }

  it("constructor guards", async function () {
    const [admin] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();
    const TokenMock = await ethers.getContractFactory("SpokeQuotaTokenMock");
    const spokeToken = await TokenMock.deploy();
    await spokeToken.waitForDeployment();

    const Receiver = await ethers.getContractFactory("SpokeQuotaReceiver");
    await expect(
      Receiver.deploy(ethers.ZeroAddress, HUB_EID, SPOKE_EID, ethers.ZeroHash, await spokeToken.getAddress(), admin.address)
    ).to.be.reverted;
    await expect(
      Receiver.deploy(await endpoint.getAddress(), 0, SPOKE_EID, ethers.ZeroHash, await spokeToken.getAddress(), admin.address)
    ).to.be.revertedWith("SpokeQuotaReceiver: hub chain zero");
    await expect(
      Receiver.deploy(await endpoint.getAddress(), HUB_EID, 0, ethers.ZeroHash, await spokeToken.getAddress(), admin.address)
    ).to.be.revertedWith("SpokeQuotaReceiver: local chain zero");
    await expect(
      Receiver.deploy(await endpoint.getAddress(), HUB_EID, SPOKE_EID, ethers.ZeroHash, await spokeToken.getAddress(), admin.address)
    ).to.be.revertedWith("SpokeQuotaReceiver: registry peer zero");
    await expect(
      Receiver.deploy(await endpoint.getAddress(), HUB_EID, SPOKE_EID, ethers.zeroPadValue(admin.address, 32), ethers.ZeroAddress, admin.address)
    ).to.be.revertedWith("SpokeQuotaReceiver: spoke token zero");
    await expect(
      Receiver.deploy(await endpoint.getAddress(), HUB_EID, SPOKE_EID, ethers.zeroPadValue(admin.address, 32), admin.address, admin.address)
    ).to.be.revertedWith("SpokeQuotaReceiver: spoke token not contract");
    await expect(
      Receiver.deploy(await endpoint.getAddress(), HUB_EID, SPOKE_EID, ethers.zeroPadValue(admin.address, 32), await spokeToken.getAddress(), ethers.ZeroAddress)
    ).to.be.reverted;
  });

  it("admin setters guards", async function () {
    const { admin, other, receiver } = await deployFixture();
    await expect(receiver.connect(other).setRegistryPeer(ethers.ZeroHash)).to.be.reverted;
    await expect(receiver.setRegistryPeer(ethers.ZeroHash)).to.be.revertedWith(
      "SpokeQuotaReceiver: registry peer zero"
    );
    await receiver.setRegistryPeer(ethers.zeroPadValue(admin.address, 32));

    await expect(receiver.setSpokeToken(ethers.ZeroAddress)).to.be.revertedWith(
      "SpokeQuotaReceiver: spoke token zero"
    );
    await expect(receiver.setSpokeToken(admin.address)).to.be.revertedWith(
      "SpokeQuotaReceiver: spoke token not contract"
    );

    const TokenMock = await ethers.getContractFactory("SpokeQuotaTokenMock");
    const newToken = await TokenMock.deploy();
    await newToken.waitForDeployment();
    await receiver.setSpokeToken(await newToken.getAddress());
  });

  it("lzReceive guards and success paths", async function () {
    const { admin, other, endpoint, receiver, spokeToken } = await deployFixture();
    const peer = ethers.zeroPadValue(admin.address, 32);
    const origin = { srcEid: HUB_EID, sender: peer, nonce: 1 };

    const update = { chainId: SPOKE_EID, grantedQuota: 10n, nonce: 1n };
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 grantedQuota,uint256 nonce)"],
      [3, update]
    );

    // invalid endpoint
    await expect(
      receiver.lzReceive(origin, ethers.ZeroHash, payload, ethers.ZeroAddress, "0x")
    ).to.be.revertedWith("SpokeQuotaReceiver: invalid endpoint");

    // invalid source
    const badOrigin = { ...origin, srcEid: 2 };
    await expect(endpoint.deliver(await receiver.getAddress(), badOrigin, payload))
      .to.be.revertedWithCustomError(receiver, "NoPeer")
      .withArgs(2);

    // invalid peer
    const badOrigin2 = { ...origin, sender: ethers.zeroPadValue(other.address, 32) };
    await expect(endpoint.deliver(await receiver.getAddress(), badOrigin2, payload))
      .to.be.revertedWithCustomError(receiver, "OnlyPeer")
      .withArgs(1, badOrigin2.sender);

    // invalid msg type
    const badMsg = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "bytes32"], [9, ethers.ZeroHash]);
    await expect(endpoint.deliver(await receiver.getAddress(), origin, badMsg)).to.be.revertedWith(
      "SpokeQuotaReceiver: invalid msg type"
    );

    // chain mismatch
    const badUpdate = { ...update, chainId: 999 };
    const badPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 grantedQuota,uint256 nonce)"],
      [3, badUpdate]
    );
    await expect(endpoint.deliver(await receiver.getAddress(), origin, badPayload)).to.be.revertedWith(
      "SpokeQuotaReceiver: chain mismatch"
    );

    // success + confirm revert handled
    await spokeToken.setRevertConfirm(true);
    await endpoint.deliver(await receiver.getAddress(), origin, payload);

    // stale nonce
    await expect(endpoint.deliver(await receiver.getAddress(), origin, payload)).to.be.revertedWith(
      "SpokeQuotaReceiver: stale quota"
    );

    // confirm success
    await spokeToken.setRevertConfirm(false);
    const update2 = { chainId: update.chainId, grantedQuota: 1n, nonce: 2n };
    const payload2 = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 grantedQuota,uint256 nonce)"],
      [3, update2]
    );
    await endpoint.deliver(await receiver.getAddress(), origin, payload2);
  });
});
