import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

describe("MyntisOFTSpoke Coverage", function () {
  async function deployFixture() {
    const [admin, other] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const Spoke = await ethers.getContractFactory("MyntisOFTSpoke");
    const spoke = await Spoke.deploy(await endpoint.getAddress(), admin.address, 1, 1);
    await spoke.waitForDeployment();

    const QuotaReceiver = await ethers.getContractFactory("QuotaReceiverMock");
    const quotaReceiver = await QuotaReceiver.deploy();
    await quotaReceiver.waitForDeployment();

    await spoke.setQuotaReceiver(await quotaReceiver.getAddress());
    await spoke.grantRole(await spoke.MINTER_ROLE(), admin.address);

    return { admin, other, endpoint, spoke, quotaReceiver };
  }

  async function impersonate(address: string) {
    await ethers.provider.send("hardhat_setBalance", [address, "0x1000000000000000000"]);
    return ethers.getImpersonatedSigner(address);
  }

  it("increaseMintQuota respects max cap", async function () {
    const { spoke, quotaReceiver } = await deployFixture();

    await spoke.setMaxQuotaIncrease(1000);
    const quotaReceiverAddr = await quotaReceiver.getAddress();
    const quotaSigner = await impersonate(quotaReceiverAddr);

    await expect(
      spoke.connect(quotaSigner).increaseMintQuota(1001)
    ).to.be.revertedWithCustomError(spoke, "QuotaIncreaseTooLarge");

    await spoke.connect(quotaSigner).increaseMintQuota(1000);
    expect(await spoke.mintQuota()).to.equal(1000n);
  });

  it("clearPendingQuotaRequest resets pending state", async function () {
    const { spoke, admin } = await deployFixture();

    await spoke.setRegistryPeer(ethers.zeroPadValue(admin.address, 32));
    await spoke.requestMintQuota(1, "0x", admin.address);
    expect(await spoke.pendingQuotaRequestNonce()).to.not.equal(0n);

    await spoke.clearPendingQuotaRequest();
    expect(await spoke.pendingQuotaRequestNonce()).to.equal(0n);
    expect(await spoke.pendingQuotaConsumed()).to.equal(0n);
  });

  it("enforces MAX_SUPPLY cap on mint", async function () {
    const { spoke, admin, quotaReceiver } = await deployFixture();

    const maxSupply = await spoke.MAX_SUPPLY();
    await spoke.setMaxQuotaIncrease(maxSupply + 1n);
    const quotaSigner = await impersonate(await quotaReceiver.getAddress());
    await spoke.connect(quotaSigner).increaseMintQuota(maxSupply + 1n);

    await expect(spoke.mint(admin.address, maxSupply + 1n)).to.be.revertedWithCustomError(
      spoke,
      "ExceedsMaxSupply"
    );
  });

  it("mints and emits SupplyUpdateSkipped when auto-reporting is disabled", async function () {
    const { spoke, admin, quotaReceiver } = await deployFixture();

    await spoke.setRegistryPeer(ethers.zeroPadValue(admin.address, 32));
    await spoke.setMaxQuotaIncrease(10);
    const quotaSigner = await impersonate(await quotaReceiver.getAddress());
    await spoke.connect(quotaSigner).increaseMintQuota(1);

    await expect(spoke.mint(admin.address, 1))
      .to.emit(spoke, "SupplyUpdateSkipped")
      .withArgs(1, 1, 0, anyValue);
  });

  it("mints and emits SupplyUpdateSkipped when auto-reporting has no refund address", async function () {
    const { spoke, admin, quotaReceiver } = await deployFixture();

    await spoke.setRegistryPeer(ethers.zeroPadValue(admin.address, 32));
    await spoke.setAutoReportSupply(true);
    await spoke.setMaxQuotaIncrease(10);
    const quotaSigner = await impersonate(await quotaReceiver.getAddress());
    await spoke.connect(quotaSigner).increaseMintQuota(1);

    await expect(spoke.mint(admin.address, 1))
      .to.emit(spoke, "SupplyUpdateSkipped")
      .withArgs(1, 1, 0, anyValue);
  });

  it("mints and emits SupplyUpdateSkipped when reporting fee is insufficient", async function () {
    const { spoke, admin, quotaReceiver, endpoint } = await deployFixture();

    await spoke.setRegistryPeer(ethers.zeroPadValue(admin.address, 32));
    await spoke.setAutoReportSupply(true);
    await spoke.setSupplyUpdateOptions("0x", admin.address);
    await endpoint.setNativeFee(1);

    await spoke.setMaxQuotaIncrease(10);
    const quotaSigner = await impersonate(await quotaReceiver.getAddress());
    await spoke.connect(quotaSigner).increaseMintQuota(1);

    await expect(spoke.mint(admin.address, 1))
      .to.emit(spoke, "SupplyUpdateSkipped")
      .withArgs(1, 1, 1, 0);
  });
});
