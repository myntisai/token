const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("Comprehensive Myntis Ecosystem Testing", function () {
  let admin, provider1, provider2, provider3, user, other;
  let myntisToken, stakingContract, emissionContract, merkleDistributor, bridge;
  // Use a large initial supply for minting tokens for providers/users.
  const initialSupply = ethers.parseEther("1000000");
  const depositAmount = ethers.parseEther("100");

  beforeEach(async function () {
    // Retrieve signers.
    [admin, provider1, provider2, provider3, user, other] = await ethers.getSigners();

    // Deploy the MyntisToken contract.
    const MyntisToken = await ethers.getContractFactory("MyntisToken");
    myntisToken = await MyntisToken.deploy(admin.address);
    await myntisToken.waitForDeployment();

    // Mint tokens for providers and a user.
    await myntisToken.mint(provider1.address, ethers.parseEther("5000"));
    await myntisToken.mint(provider2.address, ethers.parseEther("5000"));
    await myntisToken.mint(provider3.address, ethers.parseEther("5000"));
    await myntisToken.mint(user.address, ethers.parseEther("2000"));
    await myntisToken.mint(admin.address, ethers.parseEther("10000"));

    // Deploy the StakingContract.
    const StakingContract = await ethers.getContractFactory("StakingContract");
    stakingContract = await StakingContract.deploy(await myntisToken.getAddress(), admin.address);
    await stakingContract.waitForDeployment();

    // Deploy the EmissionContract with the correct constructor arguments:
    // myntisToken address, stakingContract address, and admin address.
    const EmissionContract = await ethers.getContractFactory("EmissionContract");
    emissionContract = await EmissionContract.deploy(
      await myntisToken.getAddress(),
      await stakingContract.getAddress(),
      admin.address
    );
    await emissionContract.waitForDeployment();

    // Grant MINTER_ROLE on the MyntisToken to the EmissionContract so it can mint tokens.
    const MINTER_ROLE = await myntisToken.MINTER_ROLE();
    await myntisToken.connect(admin).grantRole(MINTER_ROLE, await emissionContract.getAddress());

    // --- Set the StakingContract address inside EmissionContract if needed.
    // (This setup is optional if the constructor already handles it.)
    if (emissionContract.setStakingContract) {
      await emissionContract.connect(admin).setStakingContract(await stakingContract.getAddress());
    }

    // In the StakingContract, set the EmissionContract.
    await stakingContract.connect(admin).setEmissionContract(await emissionContract.getAddress());

    // Deploy the MerkleDistributor.
    const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
    merkleDistributor = await MerkleDistributor.deploy(
      await myntisToken.getAddress(),
      admin.address
    );
    await merkleDistributor.waitForDeployment();

    // Set the staking contract inside the MerkleDistributor.
    await merkleDistributor.connect(admin).setStakingContract(await stakingContract.getAddress());

    // Tell the StakingContract which MerkleDistributor to use.
    await stakingContract.connect(admin).setMerkleDistributor(await merkleDistributor.getAddress());

    // Deploy a mock router (assuming you have a MockCCIPRouter contract)
    const MockCCIPRouter = await ethers.getContractFactory("MockCCIPRouter");
    const mockRouter = await MockCCIPRouter.deploy();
    await mockRouter.waitForDeployment();

    // Deploy MyntisBridgeL1 with all required constructor arguments
    const chainSelector = 100; // example chain selector
    const l2Receiver = admin.address; // or any address intended to be the L2 receiver
    const Bridge = await ethers.getContractFactory("MyntisBridgeL1");
    bridge = await Bridge.deploy(
      await myntisToken.getAddress(),
      await mockRouter.getAddress(),
      chainSelector,
      l2Receiver
    );
    await bridge.waitForDeployment();
  });

  describe("Staking & Unstaking by Providers", function () {
    it("should allow providers to register, increase stake, and withdraw stake", async function () {
      // Providers must approve staking contract to spend tokens.
      await myntisToken.connect(provider1).approve(await stakingContract.getAddress(), ethers.parseEther("5000"));
      await myntisToken.connect(provider2).approve(await stakingContract.getAddress(), ethers.parseEther("5000"));
      await myntisToken.connect(provider3).approve(await stakingContract.getAddress(), ethers.parseEther("5000"));

      // Register providers (each provider must stake at least the minimum – here we use values > MINIMUM_STAKE).
      await stakingContract.connect(provider1).registerProvider(ethers.parseEther("2000"));
      await stakingContract.connect(provider2).registerProvider(ethers.parseEther("3000"));
      await stakingContract.connect(provider3).registerProvider(ethers.parseEther("4000"));

      // Increase stake—for example, provider1 adds an extra 1000 tokens.
      await myntisToken.connect(provider1).approve(await stakingContract.getAddress(), ethers.parseEther("1000"));
      await stakingContract.connect(provider1).increaseStake(ethers.parseEther("1000"));
      const info1 = await stakingContract.getProviderInfo(provider1.address);
      expect(info1.stake).to.equal(ethers.parseEther("3000"));

      // Withdraw stake—for example, provider2 withdraws 1000 tokens.
      await stakingContract.connect(provider2).withdrawStake(ethers.parseEther("1000"));
      const info2 = await stakingContract.getProviderInfo(provider2.address);
      expect(info2.stake).to.equal(ethers.parseEther("2000"));
    });

    it("should simulate long-term staking with additional harvests", async function () {
      // Register provider3 if not already.
      await myntisToken.connect(provider3).approve(await stakingContract.getAddress(), ethers.parseEther("5000"));
      await stakingContract.connect(provider3).registerProvider(ethers.parseEther("4000"));

      // First harvest.
      await stakingContract.connect(provider3).harvestRewards();
      const initialReward = await merkleDistributor.providerBalance(provider3.address);

      // Simulate passage of time (e.g., increase by 30 days).
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 3600]);
      await ethers.provider.send("evm_mine");

      // Second harvest.
      await stakingContract.connect(provider3).harvestRewards();
      const secondReward = await merkleDistributor.providerBalance(provider3.address);

      expect(secondReward).to.be.gt(initialReward);
    });
  });

  describe("Emission & Harvesting Rewards", function () {
    it("should harvest rewards and transfer them to the MerkleDistributor", async function () {
      // Register provider1.
      await myntisToken.connect(provider1).approve(await stakingContract.getAddress(), ethers.parseEther("5000"));
      await stakingContract.connect(provider1).registerProvider(ethers.parseEther("2000"));
      // Harvest rewards.
      await stakingContract.connect(provider1).harvestRewards();

      // After harvesting, provider1's reward balance stored in the MerkleDistributor should be > 0.
      const rewardBalance = await merkleDistributor.providerBalance(provider1.address);
      expect(rewardBalance).to.be.gt(0);
    });
  });

  describe("MerkleDistributor & Claiming Rewards", function () {
    it("should allow a provider to submit a Merkle root and let claimants claim rewards", async function () {
      // Register provider1 and harvest rewards.
      await myntisToken.connect(provider1).approve(await stakingContract.getAddress(), ethers.parseEther("5000"));
      await stakingContract.connect(provider1).registerProvider(ethers.parseEther("2000"));
      await stakingContract.connect(provider1).harvestRewards();
      const rewardBalance = await merkleDistributor.providerBalance(provider1.address);
      expect(rewardBalance).to.be.gt(0);

      // Prepare a distribution. In this test, provider1 will distribute its rewards among three claimants.
      // Use the signers for claimants: user, provider2, and provider3.
      const oneThird = rewardBalance / 3n;
      const claimants = [
        { signer: user, amount: oneThird },
        { signer: provider2, amount: oneThird },
        { signer: provider3, amount: rewardBalance - oneThird * 2n }
      ];

      // Create Merkle tree leaves (each leaf is keccak256(abi.encodePacked(claimant, amount))).
      const leaves = claimants.map(x =>
        ethers.solidityPackedKeccak256(
          ["address", "uint256"],
          [x.signer.address, x.amount]
        )
      );
      const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const root = merkleTree.getRoot();

      // Set an expiry time in the future (e.g., current time + 1 day).
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 86400;

      // Provider1 submits the Merkle root.
      const subTx = await merkleDistributor.connect(provider1).submitMerkleRoot(root, expiry);
      await subTx.wait();
      // (Since this is provider1's first submission, the root index is 0.)

      // Each claimant generates his/her proof and claims rewards.
      for (const claimant of claimants) {
        const leaf = ethers.solidityPackedKeccak256(
          ["address", "uint256"],
          [claimant.signer.address, claimant.amount]
        );
        const proof = merkleTree.getHexProof(leaf);
        const balanceBefore = await myntisToken.balanceOf(claimant.signer.address);
        const claimTx = await merkleDistributor
          .connect(claimant.signer)
          .claimRewards(provider1.address, 0, claimant.amount, proof);
        await claimTx.wait();
        const balanceAfter = await myntisToken.balanceOf(claimant.signer.address);
        expect(balanceAfter - balanceBefore).to.equal(claimant.amount);
      }

      // After all claims, provider1's MerkleDistributor balance should be zero.
      const remainingBalance = await merkleDistributor.providerBalance(provider1.address);
      expect(remainingBalance).to.equal(0);
    });
  });

  // describe("Bridge Functionality", function () {
  //   it("should deposit tokens into the bridge and allow unlock by the operator", async function () {
  //     // For this test, ensure provider1 has enough tokens.
  //     await myntisToken.connect(admin).mint(provider1.address, ethers.parseEther("1000"));

  //     // Provider1 approves tokens for the bridge and deposits them.
  //     await myntisToken.connect(provider1).approve(await bridge.getAddress(), depositAmount);
  //     const depositTx = await bridge.connect(provider1).deposit(depositAmount);
  //     await depositTx.wait();

  //     // Confirm that the bridge holds the tokens.
  //     const bridgeBalance = await myntisToken.balanceOf(await bridge.getAddress());
  //     expect(bridgeBalance).to.equal(depositAmount);

  //     // A non-operator (provider1) attempting to unlock should revert.
  //     await expect(
  //       bridge.connect(provider1).unlock(provider1.address, depositAmount, 1)
  //     ).to.be.reverted;

  //     // The operator (admin) unlocks the deposit.
  //     const balanceBefore = await myntisToken.balanceOf(provider1.address);
  //     const unlockTx = await bridge.connect(admin).unlock(provider1.address, depositAmount, 1);
  //     await unlockTx.wait();
  //     const balanceAfter = await myntisToken.balanceOf(provider1.address);
  //     expect(balanceAfter - balanceBefore).to.equal(depositAmount);

  //     // A second attempt to unlock the same deposit should revert.
  //     await expect(
  //       bridge.connect(admin).unlock(provider1.address, depositAmount, 1)
  //     ).to.be.revertedWith("Deposit already processed");
  //   });
  // });
});