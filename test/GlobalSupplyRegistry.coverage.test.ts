import { expect } from "chai";
import { ethers } from "hardhat";

describe("GlobalSupplyRegistry Coverage", function () {
  async function deployFixture() {
    const [admin, other] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();
    const Registry = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry = await Registry.deploy(await endpoint.getAddress(), admin.address);
    await registry.waitForDeployment();
    return { admin, other, endpoint, registry, token };
  }

  it("admin guards", async function () {
    const { registry, admin } = await deployFixture();
    await expect(registry.registerSpoke(2, ethers.ZeroHash)).to.be.revertedWith("GlobalSupplyRegistry: zero peer");
    await expect(registry.registerQuotaReceiver(2, ethers.ZeroHash)).to.be.revertedWith(
      "GlobalSupplyRegistry: zero receiver"
    );
    await expect(registry.registerToken(ethers.ZeroAddress)).to.be.revertedWith("GlobalSupplyRegistry: zero token");
    await expect(registry.registerToken(admin.address)).to.be.revertedWith(
      "GlobalSupplyRegistry: token not contract"
    );

    await registry.updateCap(0);
    await registry.updateCap(await registry.globalCap());
  });

  it("recordMint/recordBurn guards", async function () {
    const { registry, token } = await deployFixture();
    const tokenAddress = await token.getAddress();
    await registry.registerToken(tokenAddress);
    await ethers.provider.send("hardhat_setBalance", [tokenAddress, "0x1000000000000000000"]);
    const tokenSigner = await ethers.getImpersonatedSigner(tokenAddress);
    const registryAsToken = registry.connect(tokenSigner);

    await expect(registryAsToken.recordMint(0)).to.be.revertedWith("GlobalSupplyRegistry: zero amount");
    await expect(registryAsToken.recordBurn(0)).to.be.revertedWith("GlobalSupplyRegistry: zero amount");
    await expect(registryAsToken.recordBurn(1)).to.be.revertedWith("GlobalSupplyRegistry: burn exceeds supply");
  });

  it("record mint/burn updates and quota branches", async function () {
    const { registry, token } = await deployFixture();
    const tokenAddress = await token.getAddress();
    await registry.registerToken(tokenAddress);
    await ethers.provider.send("hardhat_setBalance", [tokenAddress, "0x1000000000000000000"]);
    const tokenSigner = await ethers.getImpersonatedSigner(tokenAddress);
    const registryAsToken = registry.connect(tokenSigner);

    await registryAsToken.recordMint(10);
    await registryAsToken.recordBurn(5);

    await registry.setChainQuota(2, 5);
    await registry.setChainQuota(2, 3);

    await registry.getChainNonce(2);
  });

  it("lzReceive supply update branches", async function () {
    const { registry, endpoint, admin } = await deployFixture();
    const peer = ethers.zeroPadValue(admin.address, 32);
    await registry.registerSpoke(2, peer);

    const supplyUpdate = {
      chainId: 2,
      supplyDelta: 1n,
      newTotalSupply: 1n,
      nonce: 1n
    };
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 supplyDelta,uint256 newTotalSupply,uint256 nonce)"],
      [1, supplyUpdate]
    );

    const origin = { srcEid: 2, sender: peer, nonce: 1 };
    await endpoint.deliver(await registry.getAddress(), origin, payload);

    // stale update
    await endpoint.deliver(await registry.getAddress(), origin, payload);

    // chainId mismatch
    const bad = { ...supplyUpdate, chainId: 3 };
    const badPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 supplyDelta,uint256 newTotalSupply,uint256 nonce)"],
      [1, bad]
    );
    await expect(endpoint.deliver(await registry.getAddress(), origin, badPayload)).to.be.revertedWith(
      "GlobalSupplyRegistry: chainId mismatch"
    );

    // unknown msg type
    const unknown = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "bytes32"], [9, ethers.ZeroHash]);
    await expect(endpoint.deliver(await registry.getAddress(), origin, unknown)).to.be.revertedWith(
      "GlobalSupplyRegistry: unknown message type"
    );

    // cap exceeded
    await registry.updateCap(1);
    const big = { ...supplyUpdate, nonce: 2n, newTotalSupply: 5n, supplyDelta: 4n };
    const bigPayload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 supplyDelta,uint256 newTotalSupply,uint256 nonce)"],
      [1, big]
    );
    await expect(endpoint.deliver(await registry.getAddress(), origin, bigPayload)).to.be.revertedWithCustomError(
      registry,
      "CapExceeded"
    );
  });

  it("quota request branches and quota update options", async function () {
    const { registry, endpoint, admin } = await deployFixture();
    const peer = ethers.zeroPadValue(admin.address, 32);
    await registry.registerSpoke(2, peer);
    await registry.registerQuotaReceiver(2, ethers.zeroPadValue(admin.address, 32));

    // set options/refund
    await expect(registry.setQuotaUpdateOptions("0x", ethers.ZeroAddress)).to.be.revertedWith(
      "GlobalSupplyRegistry: refund zero"
    );
    await registry.setQuotaUpdateOptions("0x", admin.address);

    const req = {
      chainId: 2,
      requestedQuota: 10n,
      newTotalSupply: 5n,
      nonce: 1n,
      consumedQuota: 0n
    };
    const payload = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 requestedQuota,uint256 newTotalSupply,uint256 nonce,uint256 consumedQuota)"],
      [2, req]
    );
    const origin = { srcEid: 2, sender: peer, nonce: 1 };
    await endpoint.deliver(await registry.getAddress(), origin, payload);

    // stale
    await endpoint.deliver(await registry.getAddress(), origin, payload);

    // consume quota and skip send if insufficient balance
    await endpoint.setNativeFee(1);
    const req2 = { ...req, nonce: 2n, consumedQuota: 5n, requestedQuota: 5n, newTotalSupply: 10n };
    const payload2 = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8", "tuple(uint32 chainId,uint256 requestedQuota,uint256 newTotalSupply,uint256 nonce,uint256 consumedQuota)"],
      [2, req2]
    );
    await endpoint.deliver(await registry.getAddress(), origin, payload2);
  });

  it("reseed/reset/force paths", async function () {
    const { registry, admin } = await deployFixture();
    await registry.setChainQuota(2, 5);
    await registry.seedChainSupply(2, 5);
    await registry.reseedChainSupply(2, 6, 2);
    await registry.reseedChainSupplyAndQuota(2, 6, 1, 3);
    await registry.reseedChainSupplyAndQuota(2, 6, 3, 4);
    await registry.resetChainNonce(2);
    await registry.forceSupplySync(2, 6, 10);
  });
});
