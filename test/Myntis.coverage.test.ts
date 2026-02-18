import { expect } from "chai";
import { ethers } from "hardhat";

describe("Myntis Coverage", function () {
  async function deployFixture() {
    const [owner, other, feeRecipient] = await ethers.getSigners();

    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const Harness = await ethers.getContractFactory("MyntisHarness");
    const token = await Harness.deploy(await endpoint.getAddress(), owner.address);
    await token.waitForDeployment();

    const Registry = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry = await Registry.deploy(await endpoint.getAddress(), owner.address);
    await registry.waitForDeployment();

    return { owner, other, feeRecipient, endpoint, token, registry };
  }

  it("role management and pause paths", async function () {
    const { token, owner, other } = await deployFixture();

    const MINTER_ROLE = await token.MINTER_ROLE();

    await expect(token.connect(other).grantRole(MINTER_ROLE, other.address)).to.be.reverted;
    await expect(token.grantRole(MINTER_ROLE, ethers.ZeroAddress)).to.be.revertedWithCustomError(
      token,
      "ZeroAddress"
    );
    await token.grantRole(MINTER_ROLE, other.address);
    expect(await token.hasRole(MINTER_ROLE, other.address)).to.equal(true);
    await token.revokeRole(MINTER_ROLE, other.address);
    expect(await token.hasRole(MINTER_ROLE, other.address)).to.equal(false);

    await token.pause();
    await expect(token.connect(other).unpause()).to.be.reverted;
    await token.unpause();
  });

  it("admin setters validations", async function () {
    const { token, owner, other } = await deployFixture();

    await expect(token.connect(other).setBurnFee(1)).to.be.reverted;
    await expect(token.setBurnFee(1001)).to.be.reverted;
    await token.setBurnFee(100);

    await expect(token.connect(other).setFeeRecipient(other.address)).to.be.reverted;
    await expect(token.setFeeRecipient(ethers.ZeroAddress)).to.be.reverted;
    await token.setFeeRecipient(other.address);

    await expect(token.connect(other).setGlobalSupplyRegistry(other.address)).to.be.reverted;
    await expect(token.setGlobalSupplyRegistry(ethers.ZeroAddress)).to.be.reverted;
    await expect(token.setGlobalSupplyRegistry(other.address)).to.be.revertedWith("Registry must be a contract");

    await token.setContractURI("ipfs://example");
  });

  it("constructor guards", async function () {
    const [owner] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const Harness = await ethers.getContractFactory("MyntisHarness");
    await expect(Harness.deploy(ethers.ZeroAddress, owner.address)).to.be.reverted;
    await expect(Harness.deploy(await endpoint.getAddress(), ethers.ZeroAddress)).to.be.reverted;
  });

  it("minting and migration flows", async function () {
    const { token, owner, other } = await deployFixture();

    await expect(token.connect(other).mint(other.address, 1)).to.be.reverted;
    await expect(token.mint(ethers.ZeroAddress, 1)).to.be.reverted;
    await expect(token.mint(owner.address, 0)).to.be.reverted;

    await token.mint(owner.address, ethers.parseEther("1"));
    const emissionsAllocation = await token.EMISSIONS_ALLOCATION();
    await expect(token.mint(owner.address, emissionsAllocation + 1n)).to.be.revertedWithCustomError(
      token,
      "ExceedsEmissionsAllocation"
    );

    await expect(token.connect(other).mintEmissions(owner.address, 1)).to.be.reverted;
    await expect(token.mintEmissions(ethers.ZeroAddress, 1)).to.be.reverted;
    await expect(token.mintEmissions(owner.address, 0)).to.be.reverted;
    await token.mintEmissions(owner.address, ethers.parseEther("1"));
    await expect(token.mintEmissions(owner.address, emissionsAllocation + 1n)).to.be.revertedWithCustomError(
      token,
      "ExceedsEmissionsAllocation"
    );

    await expect(token.connect(other).mintImmediate(owner.address, 1)).to.be.reverted;
    await expect(token.mintImmediate(ethers.ZeroAddress, 1)).to.be.reverted;
    await expect(token.mintImmediate(owner.address, 0)).to.be.reverted;
    await token.mintImmediate(owner.address, ethers.parseEther("1"));
    const immediateAllocation = await token.IMMEDIATE_ALLOCATION();
    await expect(token.mintImmediate(owner.address, immediateAllocation + 1n)).to.be.revertedWithCustomError(
      token,
      "ExceedsImmediateAllocation"
    );

    await expect(token.migrateMint([owner.address], [])).to.be.reverted;
    await expect(token.migrateMint([ethers.ZeroAddress], [1])).to.be.revertedWithCustomError(token, "ZeroAddress");
    await token.migrateMint([owner.address, owner.address], [0, 1]);
    await token.migrateMint([owner.address], [1]);
    await token.completeMigration();
    await expect(token.migrateMint([owner.address], [1])).to.be.reverted;
    await expect(token.completeMigration()).to.be.reverted;
  });

  it("burn paths", async function () {
    const { token, owner, other } = await deployFixture();
    await token.mint(owner.address, ethers.parseEther("10"));
    await expect(token.burn(0)).to.be.reverted;
    await token.burn(ethers.parseEther("1"));

    await token.mint(owner.address, ethers.parseEther("1"));
    await token.approve(other.address, ethers.parseEther("1"));
    await expect(token.connect(other).burnFrom(owner.address, 0)).to.be.reverted;
    await token.connect(other).burnFrom(owner.address, ethers.parseEther("1"));
  });

  it("global registry integration and cap checks", async function () {
    const { token, registry, owner } = await deployFixture();

    await token.setGlobalSupplyRegistry(await registry.getAddress());
    await registry.registerToken(await token.getAddress());

    await registry.updateCap(0);
    await expect(token.mint(owner.address, 1)).to.be.reverted;
    await expect(token.mintEmissions(owner.address, 1)).to.be.reverted;
    await expect(token.mintImmediate(owner.address, 1)).to.be.reverted;
  });

  it("global registry record paths", async function () {
    const { token, registry, owner, other, endpoint } = await deployFixture();

    await token.setGlobalSupplyRegistry(await registry.getAddress());
    await registry.registerToken(await token.getAddress());

    await token.mint(owner.address, ethers.parseEther("1"));
    await token.mintEmissions(owner.address, ethers.parseEther("1"));
    await token.mintImmediate(owner.address, ethers.parseEther("1"));

    await token.migrateMint([owner.address], [1]);
    await token.burn(1);

    await token.approve(other.address, 1);
    await token.connect(other).burnFrom(owner.address, 1);

    await token.remainingEmissions();
    await token.remainingImmediate();
    await token.isHub();
    await token.getContractInfo();
  });

  it("_debit/_credit paths", async function () {
    const { token, registry, owner, other, endpoint } = await deployFixture();

    // debit without fee/registry
    await token.mint(owner.address, ethers.parseEther("1"));
    await token.exposedDebit(owner.address, ethers.parseEther("1"), ethers.parseEther("1"), 1);

    await token.setBurnFee(100); // 1%
    await token.setFeeRecipient(other.address);
    await token.setGlobalSupplyRegistry(await registry.getAddress());
    await registry.registerToken(await token.getAddress());

    await token.mint(owner.address, ethers.parseEther("100"));
    const amount = ethers.parseEther("10");

    // slippage exceeded after fee
    await expect(token.exposedDebit(owner.address, amount, amount, 1)).to.be.reverted;

    const minAmount = ethers.parseEther("9");
    await token.exposedDebit(owner.address, amount, minAmount, 1);
    expect(await token.balanceOf(other.address)).to.be.gt(0n);

    // _debitView
    const viewRes = await token.exposedDebitView(amount, minAmount, 1);
    expect(viewRes[0]).to.equal(amount);

    // _credit with zero address -> dead
    await token.exposedCredit(ethers.ZeroAddress, 1, 1);

    // _credit success with registry
    await token.exposedCredit(owner.address, 1, 1);

    // _credit cap check on fresh registry with zero supply
    const Registry = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry2 = await Registry.deploy(await endpoint.getAddress(), owner.address);
    await registry2.waitForDeployment();
    await token.setGlobalSupplyRegistry(await registry2.getAddress());
    await registry2.registerToken(await token.getAddress());
    await registry2.updateCap(0);
    await expect(token.exposedCredit(owner.address, 1, 1)).to.be.reverted;

    // _credit max supply check
    const max = await token.MAX_SUPPLY();
    await expect(token.exposedCredit(owner.address, max + 1n, 1)).to.be.revertedWithCustomError(
      token,
      "ExceedsMaxSupply"
    );
  });
});
