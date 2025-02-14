const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("L2 Bridging & Merkle Distribution", function () {
  let admin, provider, user;
  let l2Token, l2Bridge, l2MerkleDistributor;
  const depositAmount = ethers.parseEther("100");

  beforeEach(async function () {
    // Setup signers.
    [admin, provider, user] = await ethers.getSigners();

    // Deploy L2 MyntisToken (assumed similar to your MyntisToken with mint/burn capabilities).
    const MyntisToken = await ethers.getContractFactory("MyntisToken");
    l2Token = await MyntisToken.connect(admin).deploy(admin.address);
    await l2Token.waitForDeployment();

    // Deploy L2 Bridge.
    const MyntisBridgeL2 = await ethers.getContractFactory("MyntisBridgeL2");
    l2Bridge = await MyntisBridgeL2.connect(admin).deploy(l2Token.target, admin.address);
    await l2Bridge.waitForDeployment();

    // Grant MINTER_ROLE on l2Token to l2Bridge.
    const MINTER_ROLE = await l2Token.MINTER_ROLE();
    await l2Token.connect(admin).grantRole(MINTER_ROLE, l2Bridge.target);

    // Deploy L2MerkleDistributor.
    const L2MerkleDistributor = await ethers.getContractFactory("L2MerkleDistributor");
    l2MerkleDistributor = await L2MerkleDistributor.connect(admin).deploy(l2Token.target, admin.address);
    await l2MerkleDistributor.waitForDeployment();
  });

  it("should complete deposit on L2, notify reward, submit Merkle root, and allow claim", async function () {
    // Simulate the operator completing a deposit on L2.
    // This mints tokens to the provider.
    await expect(l2Bridge.connect(admin).completeDeposit(provider.address, depositAmount, 1))
      .to.emit(l2Bridge, "Minted")
      .withArgs(provider.address, depositAmount, 1);

    // Provider notifies reward to the L2MerkleDistributor.
    await expect(l2MerkleDistributor.connect(provider).notifyReward(provider.address, depositAmount))
      .to.emit(l2MerkleDistributor, "ProviderBalanceUpdated");

    // **Fund the distributor with tokens**
    // Transfer tokens from provider to the distributor so that it can later transfer tokens in claims.
    await l2Token.connect(provider).transfer(l2MerkleDistributor.target, depositAmount);

    // Check that the provider's reward balance is set.
    const balance = await l2MerkleDistributor.providerBalance(provider.address);
    expect(balance).to.equal(depositAmount);

    // Now, provider submits a Merkle root for an epoch.
    // For testing, we'll distribute the entire reward to a single claimant (user).
    const leaf = ethers.solidityPackedKeccak256(["address", "uint256"], [user.address, depositAmount]);
    const merkleTree = new MerkleTree([leaf], keccak256, { sortPairs: true });
    const root = merkleTree.getHexRoot();
    // Set expiry to 1 day from now.
    const latestBlock = await ethers.provider.getBlock("latest");
    const expiry = latestBlock.timestamp + 86400;

    await expect(l2MerkleDistributor.connect(provider).submitMerkleRoot(root, expiry))
      .to.emit(l2MerkleDistributor, "MerkleRootSubmitted")
      .withArgs(provider.address, 0, root, expiry);

    // Generate proof for the user.
    const proof = merkleTree.getHexProof(leaf);

    // User claims rewards using the Merkle proof.
    const userBalanceBefore = await l2Token.balanceOf(user.address);
    await expect(
      l2MerkleDistributor.connect(user).claimRewards(provider.address, 0, depositAmount, proof)
    ).to.emit(l2MerkleDistributor, "RewardsClaimed");
    const userBalanceAfter = await l2Token.balanceOf(user.address);
    expect(userBalanceAfter - userBalanceBefore).to.equal(depositAmount);

    // Ensure the provider's reward balance is reduced.
    const newBalance = await l2MerkleDistributor.providerBalance(provider.address);
    expect(newBalance).to.equal(0);
  });
});
