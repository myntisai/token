import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, Signer } from "ethers";

describe("MyntisBridge LayerZero Test", function () {
  // Define two endpoint IDs for two chains
  const eidA = 1;
  const eidB = 2;

  let EndpointV2MockFactory: ContractFactory;
  let lzEndpointA: Contract;
  let lzEndpointB: Contract;
  let myntisToken: Contract;
  let merkleDistributor: Contract;
  let myntisBridgeA: Contract;
  let myntisBridgeB: Contract;
  let owner: Signer;
  let user: Signer;

  before(async function () {
    [owner, user] = await ethers.getSigners();
    EndpointV2MockFactory = await ethers.getContractFactory("EndpointV2Mock");
  });

  beforeEach(async function () {
    // Deploy EndpointV2Mock for chain A and chain B
    lzEndpointA = (await EndpointV2MockFactory.deploy(eidA)) as unknown as Contract;
    await lzEndpointA.deployed();

    lzEndpointB = (await EndpointV2MockFactory.deploy(eidB)) as unknown as Contract;
    await lzEndpointB.deployed();

    // Deploy MyntisToken
    const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken");
    myntisToken = (await MyntisTokenFactory.deploy(await owner.getAddress())) as unknown as Contract;
    await myntisToken.deployed();

    // Mint tokens to the user for bridging tests
    await myntisToken.mint(await user.getAddress(), ethers.parseEther("1000"));

    // Deploy the real MerkleDistributor
    const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor");
    merkleDistributor = (await MerkleDistributorFactory.deploy(myntisToken.address, await owner.getAddress())) as unknown as Contract;
    await merkleDistributor.deployed();

    // Deploy MyntisBridge on chain A using lzEndpointA
    const MyntisBridgeFactory = await ethers.getContractFactory("MyntisBridge");
    myntisBridgeA = (await MyntisBridgeFactory.deploy(
      lzEndpointA.address,
      await owner.getAddress(),
      myntisToken.address,
      merkleDistributor.address
    )) as unknown as Contract;
    await myntisBridgeA.deployed();

    // Deploy MyntisBridge on chain B using lzEndpointB
    myntisBridgeB = (await MyntisBridgeFactory.deploy(
      lzEndpointB.address,
      await owner.getAddress(),
      myntisToken.address,
      merkleDistributor.address
    )) as unknown as Contract;
    await myntisBridgeB.deployed();

    // Configure remote bridge addresses:
    const remoteBridgeB = ethers.utils.hexZeroPad(myntisBridgeB.address, 32);
    await myntisBridgeA.updateRemoteBridge(eidB, remoteBridgeB);

    const remoteBridgeA = ethers.utils.hexZeroPad(myntisBridgeA.address, 32);
    await myntisBridgeB.updateRemoteBridge(eidA, remoteBridgeA);

    // Set endpoint peer mapping if your mock supports it.
    // Assuming EndpointV2Mock has a function setDestLzEndpoint(address destBridge, address destEndpoint)
    await lzEndpointA["setDestLzEndpoint(address,address)"](myntisBridgeB.address, lzEndpointB.address);
    await lzEndpointB["setDestLzEndpoint(address,address)"](myntisBridgeA.address, lzEndpointA.address);
  });

  it("should bridge tokens from chain A to chain B and emit MYNTBridged event", async function () {
    const amountToBridge = ethers.parseEther("10");

    // User approves myntisBridgeA to spend tokens
    await myntisToken.connect(user).approve(myntisBridgeA.address, amountToBridge);

    // Define a simulated fee (LayerZero fee)
    const fee = ethers.parseEther("0.05");

    // Execute the bridging transaction on chain A from the user account
    await expect(
      myntisBridgeA
        .connect(user)
        .bridgeMYNT(eidB, amountToBridge, await user.getAddress(), false, { value: fee, gasLimit: 500000 })
    )
      .to.emit(myntisBridgeA, "MYNTBridged")
      .withArgs(await user.getAddress(), amountToBridge, eidB, 0); // MessageType.Regular = 0

    // Verify that the Endpoint mock on chain A has emitted a MessageSent event for eidB.
    const filter = lzEndpointA.filters.MessageSent(eidB);
    const events = await lzEndpointA.queryFilter(filter);
    expect(events.length).to.be.greaterThan(0);
  });
});
