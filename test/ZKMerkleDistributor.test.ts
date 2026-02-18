import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ZKMerkleDistributor", function () {
  async function deployZKMerkleDistributorFixture() {
    const [admin, provider1, provider2, user1, user2] = await ethers.getSigners();

    // Deploy mock LayerZero endpoint (required for Myntis constructor)
    const LayerZeroEndpointMockFactory = await ethers.getContractFactory("LayerZeroEndpointMock");
    const mockEndpoint = await LayerZeroEndpointMockFactory.deploy(1);
    await mockEndpoint.waitForDeployment();

    const TokenFactory = await ethers.getContractFactory("Myntis");
    const token = await TokenFactory.connect(admin).deploy(await mockEndpoint.getAddress(), admin.address);
    await token.waitForDeployment();

    const MockGroth16Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const verifier = await MockGroth16Verifier.connect(admin).deploy();
    await verifier.waitForDeployment();

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

    // Set slash recipient for slashing tests
    await distributor.connect(admin).setSlashRecipient(admin.address);

    // Mint tokens to admin and approve distributor for funding
    const fundingAmount = ethers.parseEther("1000000");
    await token.connect(admin).mint(admin.address, fundingAmount);
    await token.connect(admin).approve(await distributor.getAddress(), fundingAmount);

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

  function buildProofInputs(claimRoot: string, totalClaimable: bigint) {
    const proofA: [bigint, bigint] = [0n, 0n];
    const proofB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
    const proofC: [bigint, bigint] = [0n, 0n];
    const batchHash = ethers.keccak256(ethers.toUtf8Bytes("batch"));
    const publicInputs: [bigint, bigint, bigint] = [
      BigInt(claimRoot),
      totalClaimable,
      BigInt(batchHash)
    ];
    return { proofA, proofB, proofC, publicInputs, batchHash };
  }

  describe("Deployment", function () {
    it("Should initialize with correct parameters", async function () {
      const { distributor, token, verifier, admin } = await loadFixture(deployZKMerkleDistributorFixture);

      expect(await distributor.token()).to.equal(await token.getAddress());
      expect(await distributor.batchVerifier()).to.equal(await verifier.getAddress());
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
      const { proofA, proofB, proofC, publicInputs, batchHash } = buildProofInputs(root, totalClaimable);

      await expect(
        distributor.connect(provider1).submitMerkleRoot(
          root,
          expiry,
          totalClaimable,
          proofA,
          proofB,
          proofC,
          publicInputs
        )
      ).to.emit(distributor, "MerkleRootSubmitted")
        .withArgs(provider1.address, 0, root, expiry, totalClaimable, batchHash);
    });

    it("Should allow provider to submit Merkle root without ZK", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      const { proofA, proofB, proofC, publicInputs, batchHash } = buildProofInputs(root, totalClaimable);

      await expect(
        distributor.connect(provider1).submitMerkleRoot(
          root,
          expiry,
          totalClaimable,
          proofA,
          proofB,
          proofC,
          publicInputs
        )
      ).to.emit(distributor, "MerkleRootSubmitted")
        .withArgs(provider1.address, 0, root, expiry, totalClaimable, batchHash);
    });

    it("Should reject submission with insufficient balance", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("20000"); // More than available balance
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(root, totalClaimable);

      await expect(
        distributor.connect(provider1).submitMerkleRoot(
          root,
          expiry,
          totalClaimable,
          proofA,
          proofB,
          proofC,
          publicInputs
        )
      ).to.be.revertedWith("Insufficient balance for claims");
    });

    it("Should reject submission with expiry too soon", async function () {
      const { distributor, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry(3600); // 1 hour from now (too soon)
      const totalClaimable = ethers.parseEther("1000");
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(root, totalClaimable);

      await expect(
        distributor.connect(provider1).submitMerkleRoot(
          root,
          expiry,
          totalClaimable,
          proofA,
          proofB,
          proofC,
          publicInputs
        )
      ).to.be.revertedWith("expiry too soon");
    });
  });

  describe("Claim Verification", function () {
    it("Should allow claim with valid Merkle proof", async function () {
      const { distributor, provider1, user1, token } = await loadFixture(deployZKMerkleDistributorFixture);

      const amount = ethers.parseEther("100");
      const network = await ethers.provider.getNetwork();
      const leaf = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "uint256"],
          [user1.address, amount, network.chainId]
        )
      );

      const expiry = await futureExpiry();
      const totalClaimable = amount;
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(leaf, totalClaimable);

      await distributor.connect(provider1).submitMerkleRoot(
        leaf,
        expiry,
        totalClaimable,
        proofA,
        proofB,
        proofC,
        publicInputs
      );

      const balanceBefore = await token.balanceOf(user1.address);
      await distributor.connect(user1).claim(provider1.address, 0, amount, []);
      const balanceAfter = await token.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should reject claim with invalid Merkle proof", async function () {
      const { distributor, provider1, user1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const amount = ethers.parseEther("100");
      const network = await ethers.provider.getNetwork();
      const leaf = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "uint256"],
          [user1.address, amount, network.chainId]
        )
      );

      const expiry = await futureExpiry();
      const totalClaimable = amount;
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(leaf, totalClaimable);

      await distributor.connect(provider1).submitMerkleRoot(
        leaf,
        expiry,
        totalClaimable,
        proofA,
        proofB,
        proofC,
        publicInputs
      );

      await expect(
        distributor.connect(user1).claim(provider1.address, 0, amount + 1n, [])
      ).to.be.revertedWith("invalid proof");
    });

    it("Should prevent double claims", async function () {
      const { distributor, provider1, user1 } = await loadFixture(deployZKMerkleDistributorFixture);

      const amount = ethers.parseEther("50");
      const network = await ethers.provider.getNetwork();
      const leaf = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "uint256"],
          [user1.address, amount, network.chainId]
        )
      );

      const expiry = await futureExpiry();
      const totalClaimable = amount;
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(leaf, totalClaimable);

      await distributor.connect(provider1).submitMerkleRoot(
        leaf,
        expiry,
        totalClaimable,
        proofA,
        proofB,
        proofC,
        publicInputs
      );

      await distributor.connect(user1).claim(provider1.address, 0, amount, []);
      await expect(
        distributor.connect(user1).claim(provider1.address, 0, amount, [])
      ).to.be.revertedWith("already claimed");
    });
  });

  describe("Epoch Management", function () {
    it("Should allow admin to close epoch after grace period", async function () {
      const { distributor, admin, provider1 } = await loadFixture(deployZKMerkleDistributorFixture);

      // Submit root
      const root = ethers.keccak256(ethers.toUtf8Bytes("test root"));
      const expiry = await futureExpiry();
      const totalClaimable = ethers.parseEther("1000");
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(root, totalClaimable);
      await distributor.connect(provider1).submitMerkleRoot(
        root,
        expiry,
        totalClaimable,
        proofA,
        proofB,
        proofC,
        publicInputs
      );

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
      const { proofA, proofB, proofC, publicInputs } = buildProofInputs(root, totalClaimable);
      await distributor.connect(provider1).submitMerkleRoot(
        root,
        expiry,
        totalClaimable,
        proofA,
        proofB,
        proofC,
        publicInputs
      );

      // Try to close immediately
      await expect(
        distributor.connect(admin).closeEpoch(provider1.address, 0)
      ).to.be.revertedWith("close delay not over");
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
    it("Should handle multiple providers with verified proofs", async function () {
      const { distributor, provider1, provider2 } = await loadFixture(deployZKMerkleDistributorFixture);

      const root1 = ethers.keccak256(ethers.toUtf8Bytes("test root 1"));
      const expiry1 = await futureExpiry();
      const total1 = ethers.parseEther("1000");
      const proof1 = buildProofInputs(root1, total1);
      await distributor.connect(provider1).submitMerkleRoot(
        root1,
        expiry1,
        total1,
        proof1.proofA,
        proof1.proofB,
        proof1.proofC,
        proof1.publicInputs
      );

      const root2 = ethers.keccak256(ethers.toUtf8Bytes("test root 2"));
      const expiry2 = await futureExpiry();
      const total2 = ethers.parseEther("1000");
      const proof2 = buildProofInputs(root2, total2);
      await distributor.connect(provider2).submitMerkleRoot(
        root2,
        expiry2,
        total2,
        proof2.proofA,
        proof2.proofB,
        proof2.proofC,
        proof2.publicInputs
      );

      // Check epoch info
      const epoch1 = await distributor.getEpochInfo(provider1.address, 0);
      const epoch2 = await distributor.getEpochInfo(provider2.address, 0);

      expect(epoch1.providerProofVerified).to.be.true;
      expect(epoch2.providerProofVerified).to.be.true;
    });

    it("Should report unclaimed status for new users", async function () {
      const { distributor, provider1, user1 } = await loadFixture(deployZKMerkleDistributorFixture);
      const hasClaimed = await distributor.hasClaimed(provider1.address, 0, user1.address);
      expect(hasClaimed).to.equal(false);
    });
  });
});
