const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MyntisBridgeL1", function () {
  let ERC20Mock, token, bridge, admin, provider, other;
  const initialSupply = ethers.parseEther("10000");
  const depositAmount = ethers.parseEther("100");

  beforeEach(async function () {
    [admin, provider, other] = await ethers.getSigners();

    // Deploy a mock ERC20 token (using OpenZeppelin's ERC20Mock or a similar contract)
    ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    token = await ERC20Mock.deploy("Myntis Token", "MYNTIS", admin.address, initialSupply);
    await token.waitForDeployment();

    // Deploy the bridge contract with the token address and admin as the operator.
    const Bridge = await ethers.getContractFactory("MyntisBridgeL1");
    bridge = await Bridge.deploy(token.target, admin.address);
    await bridge.waitForDeployment();

    // Transfer tokens to provider to use for deposit tests.
    await token.transfer(provider.address, ethers.parseEther("1000"));

    // Connect provider to the token and bridge so that deposits are sent by provider.
    token = token.connect(provider);
    bridge = bridge.connect(provider);
  });

  it("should allow a successful token deposit", async function () {
    await token.approve(bridge.target, depositAmount);
    await expect(bridge.deposit(depositAmount))
      .to.emit(bridge, "Deposit")
      .withArgs(provider.address, depositAmount, 1);

    expect(await bridge.depositCounter()).to.equal(1);
    const bridgeBalance = await token.balanceOf(bridge.target);
    expect(bridgeBalance).to.equal(depositAmount);
  });

  it("should revert when depositing a zero amount", async function () {
    await token.approve(bridge.target, 0);
    await expect(bridge.deposit(0)).to.be.revertedWith("Amount must be > 0");
  });

  it("should allow unlocking only by an operator and update deposit state", async function () {
    // Deposit tokens into the bridge.
    await token.approve(bridge.target, depositAmount);
    await bridge.deposit(depositAmount);

    // Attempt to unlock with a non-operator account; should revert.
    await expect(
      bridge.connect(provider).unlock(provider.address, depositAmount, 1)
    ).to.be.reverted;

    // Unlock using the operator (admin).
    bridge = bridge.connect(admin);
    const providerBalanceBefore = await token.balanceOf(provider.address);
    await bridge.unlock(provider.address, depositAmount, 1);
    const providerBalanceAfter = await token.balanceOf(provider.address);

    // Use native subtraction for bigints.
    expect(providerBalanceAfter - providerBalanceBefore).to.equal(depositAmount);
    expect(await bridge.processedDeposits(1)).to.equal(true);

    // A second unlock for the same deposit should revert.
    await expect(
      bridge.unlock(provider.address, depositAmount, 1)
    ).to.be.revertedWith("Deposit already processed");
  });

  it("should support bridging with multiple tokens", async function () {
    // Deploy a second token.
    const secondToken = await ERC20Mock.deploy("Other Token", "OTKN", admin.address, initialSupply);
    await secondToken.waitForDeployment();

    // Transfer tokens to provider.
    await secondToken.transfer(provider.address, ethers.parseEther("500"));
    const secondTokenProvider = secondToken.connect(provider);

    // Deploy a separate bridge instance for this second token.
    const Bridge = await ethers.getContractFactory("MyntisBridgeL1");
    const secondBridge = await Bridge.deploy(secondToken.target, admin.address);
    await secondBridge.waitForDeployment();
    const secondBridgeProvider = secondBridge.connect(provider);

    // Approve and deposit tokens into the second bridge.
    await secondTokenProvider.approve(secondBridge.target, depositAmount);
    await expect(secondBridgeProvider.deposit(depositAmount))
      .to.emit(secondBridge, "Deposit")
      .withArgs(provider.address, depositAmount, 1);

    const secondBridgeBalance = await secondToken.balanceOf(secondBridge.target);
    expect(secondBridgeBalance).to.equal(depositAmount);
  });
});