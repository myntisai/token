import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ZKMerkleDistributor", function () {
  async function deployZKMerkleDistributorFixture() {
    const [admin, provider1, provider2, user1, user2] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("MyntisToken");
    const token = await TokenFactory.connect(admin).deploy(admin.address);
    await token.waitForDeployment();

    // Deploy ZK verifier
    const RewardClaimVerifier = await ethers.getContractFactory("RewardClaimVerifier");
    const verifier = await RewardClaimVerifier.connect(admin).deploy();
    await verifier.waitForDeployment();
    const MockGroth16Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const grothVerifier = await MockGroth16Verifier.connect(admin).deploy();
    await verifier.connect(admin).setVerifierContract(await grothVerifier.getAddress());

    // Deploy ZK Merkle Distributor
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(
      await token.getAddress(),
      await verifier.getAddress(),
      admin.address
    );
    await distributor.waitForDeployment();

    // Grant provider roles
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider1.address);
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider2.address);

    // Mint tokens to distributor
    await token.connect(admin).mint(await distributor.getAddress(), ethers.parseEther("1000000"));

    // Add provider balances
    await distributor.connect(admin).addProviderBalance(provider1.address, ethers.parseEther("10000"));
    await distributor.connect(admin).addProviderBalance(provider2.address, ethers.parseEther("10000"));

    return {
      distributor,
      token,
      verifier,
      admin,
      provider1,
      provider2,
      user1,
      user2
    };
  }

  async function futureExpiry(offsetSeconds = 172_800): Promise<number> {
    const block = await ethers.provider.getBlock("latest");
    const baseline = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
    return baseline + offsetSeconds;
  }

  describe("Deployment", function () {
    it("Should initialize with correct parameters", async function () {
      const { distributor, token, verifier, admin } = await loadFixture(deployZKMerkleDistributorFixture);

      expect(await distributor.token()).to.equal(await token.getAddress());
      expect(await distributor.verifier()).to.equal(await verifier.getAddress());
      expect(await distributor.hasRole(await distributor.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
    });
  });

  describe("Provider Balance Management", function () {
    it("Should allow admin to add provider balance", async function () {
      const { distributor, admin, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const amount = ethers.parseEther("1000");
      await distributor.connect(admin).addProviderBalance(provider1.address, amount);

      expect(await distributor.getProviderBalance(provider1.address)).to.equal(ethers.parseEther("11000"));
    });

    it("Should reject non-admin balance addition", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const amount = ethers.parseEther("1000");
      await expect(
        distributor.connect(provider1).addProviderBalance(provider1.address, amount)
      ).to.be.revertedWithCustomError(distributor, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Merkle Root Submission", function () {
    it("Should allow provider to submit Merkle root with ZK enabled", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry(); // 1 day from now
      const totalClaimable = ethers.parseEther("1000");
      const zkEnabled = true;

      await expect(
        distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, zkEnabled)
      ).to.emit(distributor, "MerkleRootSubmitted")
        .withArgs(provider1.address, 0, root, expiry, totalClaimable, zkEnabled);
    });

    it("Should allow provider to submit Merkle root without ZK", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      const zkEnabled = false;

      await expect(
        distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, zkEnabled)
      ).to.emit(distributor, "MerkleRootSubmitted")
        .withArgs(provider1.address, 0, root, expiry, totalClaimable, zkEnabled);
    });

    it("Should reject submission with insufficient balance", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("20000"); // More than available balance
      const zkEnabled = true;

      await expect(
        distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, zkEnabled)
      ).to.be.revertedWith("Insufficient balance for claims");
    });

    it("Should reject submission with expiry too soon", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry(3600); // 1 hour from now (too soon)
      const totalClaimable = ethers.parseEther("1000");
      const zkEnabled = true;

      await expect(
        distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, zkEnabled)
      ).to.be.revertedWith("expiry too soon");
    });
  });

  describe("ZK Claim Verification", function () {
    it("Should reject ZK claim when ZK is not enabled", async function () {
      const { distributor, provider1, user1 } = await loadFixture(deployZKMerkleDistributorFixture);

      // Submit root without ZK
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      await distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, false);

      // Try to claim with ZK proof
      const amount = ethers.parseEther("100");
      const merkleProof = [ethers.keccak256(ethers.toUtf8Bytes("proof"))];
      const zkProof = {
        a: [ethers.parseEther("1"), ethers.parseEther("2")],
        b: [[ethers.parseEther("3"), ethers.parseEther("4")], [ethers.parseEther("5"), ethers.parseEther("6")]],
        c: [ethers.parseEther("7"), ethers.parseEther("8")]
      };
      const publicInputs = [ethers.parseEther("1"), ethers.parseEther("2"), ethers.parseEther("3")];

      await expect(
        distributor.connect(user1).claimWithZK(provider1.address, 0, amount, merkleProof, zkProof, publicInputs)
      ).to.be.revertedWith("ZK not enabled for this epoch");
    });

    it("Should reject claim without ZK when ZK is enabled", async function () {
      const { distributor, provider1, user1 } = await loadFixture(deployZKMerkleDistributorFixture);

      // Submit root with ZK
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      await distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, true);

      // Try to claim without ZK proof
      const amount = ethers.parseEther("100");
      const merkleProof = [ethers.keccak256(ethers.toUtf8Bytes("proof"))];

      await expect(
        distributor.connect(user1).claimWithoutZK(provider1.address, 0, amount, merkleProof)
      ).to.be.revertedWith("ZK required for this epoch");
    });
  });

  describe("Epoch Management", function () {
    it("Should allow admin to close epoch after grace period", async function () {
      const { distributor, admin, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      // Submit root
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      await distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, false);

      // Fast forward past grace period
      await ethers.provider.send("evm_increaseTime", [86400 * 7]); // 3 days
      await ethers.provider.send("evm_mine", []);

      await expect(
        distributor.connect(admin).closeEpoch(provider1.address, 0)
      ).to.emit(distributor, "EpochClosed")
        .withArgs(provider1.address, 0);
    });

    it("Should reject closing epoch before grace period", async function () {
      const { distributor, admin, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      // Submit root
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      await distributor.connect(provider1).submitMerkleRoot(root, expiry, totalClaimable, false);

      // Try to close immediately
      await expect(
        distributor.connect(admin).closeEpoch(provider1.address, 0)
      ).to.be.revertedWith("grace period not over");
    });
  });

  describe("Provider Slashing", function () {
    it("Should allow admin to slash provider balance", async function () {
      const { distributor, admin, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const slashAmount = ethers.parseEther("1000");
      const initialBalance = await distributor.getProviderBalance(provider1.address);

      await expect(
        distributor.connect(admin).slashProvider(provider1.address, slashAmount)
      ).to.emit(distributor, "ProviderSlashed")
        .withArgs(provider1.address, slashAmount);

      expect(await distributor.getProviderBalance(provider1.address)).to.equal(initialBalance - slashAmount);
    });

    it("Should reject slashing more than available balance", async function () {
      const { distributor, admin, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const slashAmount = ethers.parseEther("20000"); // More than available
      await expect(
        distributor.connect(admin).slashProvider(provider1.address, slashAmount)
      ).to.be.revertedWith("insufficient balance");
    });
  });

  describe("Access Control", function () {
    it("Should reject non-admin epoch closing", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      await expect(
        distributor.connect(provider1).closeEpoch(provider1.address, 0)
      ).to.be.revertedWithCustomError(distributor, "AccessControlUnauthorizedAccount");
    });

    it("Should reject non-admin provider slashing", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      await expect(
        distributor.connect(provider1).slashProvider(provider1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(distributor, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Integration", function () {
    it("Should handle multiple providers with different ZK settings", async function () {
      const { distributor, provider1, provider2 } = await loadFixture(deployZKMerkleDistributorFixture);

      // Provider1 submits with ZK enabled
      const root1 = ethers.keccak256(ethers.toUtf8Bytes("test root 1"));
      const expiry1 = await futureExpiry();
      await distributor.connect(provider1).submitMerkleRoot(root1, expiry1, ethers.parseEther("1000"), true);

      // Provider2 submits without ZK
      const root2 = ethers.keccak256(ethers.toUtf8Bytes("test root 2"));
      const expiry2 = await futureExpiry();
      await distributor.connect(provider2).submitMerkleRoot(root2, expiry2, ethers.parseEther("1000"), false);

      // Check epoch info
      const epoch1 = await distributor.getEpochInfo(provider1.address, 0);
      const epoch2 = await distributor.getEpochInfo(provider2.address, 0);

      expect(epoch1.zkEnabled).to.be.true;
      expect(epoch2.zkEnabled).to.be.false;
    });

    it("Should track ZK claim counts per user", async function () {
      const { distributor, user1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const initialCount = await distributor.getZKClaimCount(user1.address);
      expect(initialCount).to.equal(0);

      // In a real scenario, ZK claims would increment this counter
      // This test verifies the counter exists and is accessible
    });
  });
});
