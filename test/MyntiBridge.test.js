const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Myntis Bridges Integration", function () {
  let deployer, user;
  let l1Token, l2Token;
  let bridgeL1, bridgeL2, mockRouter;
  const depositAmount = ethers.parseEther("100");

  beforeEach(async function () {
    [deployer, user] = await ethers.getSigners();

    // Deploy the L1 token – a standard ERC20 used in the L1 bridge.
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    l1Token = await MockERC20.deploy("Mock Token L1", "MTL1", ethers.parseEther("10000"));
    await l1Token.waitForDeployment();

    // Transfer some tokens to the user account.
    await l1Token.transfer(user.address, depositAmount);

    // Deploy the L2 mintable token – used in the L2 bridge.
    const MockMintableToken = await ethers.getContractFactory("MockMintableToken");
    l2Token = await MockMintableToken.deploy("Myntis Token L2", "MTL2");
    await l2Token.waitForDeployment();

    // Deploy the mock CCIP router.
    // (This is your existing mock that implements IRouterClient.)
    const MockCCIPRouter = await ethers.getContractFactory("MockCCIPRouter");
    mockRouter = await MockCCIPRouter.deploy();
    await mockRouter.waitForDeployment();

    // Deploy the L2 bridge, providing the L2 token address and router address.
    const MyntisBridgeL2 = await ethers.getContractFactory("MyntisBridgeL2");
    bridgeL2 = await MyntisBridgeL2.deploy(l2Token.address, mockRouter.address);
    await bridgeL2.waitForDeployment();

    // Deploy the L1 bridge.
    // For the test, we use an arbitrary chain selector value (e.g. 100)
    // and set the L2 bridge address as the receiver.
    const MyntisBridgeL1 = await ethers.getContractFactory("MyntisBridgeL1");
    bridgeL1 = await MyntisBridgeL1.deploy(l1Token.address, mockRouter.address, 100, bridgeL2.address);
    await bridgeL1.waitForDeployment();
  });

  it("should process a deposit on L1 and mint tokens on L2", async function () {
    // User approves the L1 bridge to spend tokens.
    await l1Token.connect(user).approve(await bridgeL1.getAddress(), depositAmount);

    // User deposits tokens into the L1 bridge.
    const depositTx = await bridgeL1.connect(user).deposit(depositAmount);
    const depositReceipt = await depositTx.wait();

    // Verify that depositCounter was incremented.
    expect(await bridgeL1.depositCounter()).to.equal(1);

    // The L1 bridge should emit a Deposit event including provider, amount, depositId, and messageId.
    const depositEvent = depositReceipt.events.find((e) => e.event === "Deposit");
    expect(depositEvent, "Deposit event not found").to.exist;
    expect(depositEvent.args.provider).to.equal(user.address);
    expect(depositEvent.args.amount).to.equal(depositAmount);
    expect(depositEvent.args.depositId).to.equal(1);

    // The mock router emits the CCIPSendCalled event.
    // Locate that event in the same transaction receipt.
    const ccipEvent = depositReceipt.events.find((e) => e.event === "CCIPSendCalled");
    expect(ccipEvent, "CCIPSendCalled event not found").to.exist;
    expect(ccipEvent.args.destinationChainSelector).to.equal(100);

    // Extract the message struct from the event.
    // In our message struct, the 'data' field is the encoded deposit payload.
    const messageStruct = ccipEvent.args.message;
    const encodedMessageData = messageStruct.data;

    // Decode the data to confirm it matches (provider, amount, depositId).
    const [provider, amount, depositId] = ethers.utils.defaultAbiCoder.decode(
      ["address", "uint256", "uint256"],
      encodedMessageData
    );
    expect(provider).to.equal(user.address);
    expect(amount).to.equal(depositAmount);
    expect(depositId).to.equal(1);

    // Now simulate the cross-chain callback:
    // The L2 bridge's ccipReceive is invoked with the encoded message.
    const receiveTx = await bridgeL2.ccipReceive(encodedMessageData);
    const receiveReceipt = await receiveTx.wait();

    // Verify that the deposit is now marked as processed on L2.
    expect(await bridgeL2.processedDeposits(1)).to.be.true;

    // Check for the Minted event in the L2 deposit processing.
    const mintedEvent = receiveReceipt.events.find((e) => e.event === "Minted");
    expect(mintedEvent, "Minted event not found").to.exist;
    expect(mintedEvent.args.provider).to.equal(user.address);
    expect(mintedEvent.args.amount).to.equal(depositAmount);
    expect(mintedEvent.args.depositId).to.equal(1);

    // Ensure that the user's L2 token balance has increased accordingly.
    const userBalanceL2 = await l2Token.balanceOf(user.address);
    expect(userBalanceL2).to.equal(depositAmount);
  });
});