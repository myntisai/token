import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ZKMerkleDistributor Coverage", function () {
  async function deployFixture() {
    const [admin, provider, user, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const Dist = await ethers.getContractFactory("ZKMerkleDistributor");
    const dist = await Dist.deploy(await token.getAddress(), await verifier.getAddress(), admin.address);
    await dist.waitForDeployment();

    await dist.grantRole(await dist.PROVIDER_ROLE(), provider.address);
    await dist.setSlashRecipient(admin.address);

    await token.mint(admin.address, ethers.parseEther("100000"));
    await token.connect(admin).approve(await dist.getAddress(), ethers.parseEther("100000"));

    return { admin, provider, user, other, token, verifier, dist };
  }

  function buildProof(total: bigint) {
    const proofA: [bigint, bigint] = [0n, 0n];
    const proofB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
    const proofC: [bigint, bigint] = [0n, 0n];
    const batchHash = ethers.keccak256(ethers.toUtf8Bytes("batch"));
    const publicInputs: [bigint, bigint, bigint] = [0n, total, BigInt(batchHash)];
    return { proofA, proofB, proofC, publicInputs, batchHash };
  }

  it("constructor guards", async function () {
    const [admin] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const Verifier = await ethers.getContractFactory("MockGroth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const Dist = await ethers.getContractFactory("ZKMerkleDistributor");
    await expect(Dist.deploy(ethers.ZeroAddress, await verifier.getAddress(), admin.address)).to.be.revertedWith(
      "Invalid token address"
    );
    await expect(Dist.deploy(await token.getAddress(), ethers.ZeroAddress, admin.address)).to.be.revertedWith(
      "Invalid verifier address"
    );
    await expect(Dist.deploy(await token.getAddress(), await verifier.getAddress(), ethers.ZeroAddress)).to.be.revertedWith(
      "Invalid admin address"
    );
  });

  it("verifier update paths", async function () {
    const { dist, verifier, admin } = await deployFixture();
    await expect(dist.executeBatchVerifierUpdate()).to.be.revertedWith("No pending verifier");
    await dist.setVerifierUpdateDelay(0);
    await dist.setBatchVerifier(await verifier.getAddress());

    await dist.setVerifierUpdateDelay(100);
    await dist.setBatchVerifier(await verifier.getAddress());
    await expect(dist.executeBatchVerifierUpdate()).to.be.revertedWith("Verifier update not ready");
    await time.increase(200);
    await dist.executeBatchVerifierUpdate();
  });

  it("admin setter validations", async function () {
    const { dist, other } = await deployFixture();
    await expect(dist.setBatchVerifier(ethers.ZeroAddress)).to.be.revertedWith("Invalid verifier address");
    await expect(dist.setSlashRecipient(ethers.ZeroAddress)).to.be.revertedWith("invalid slash recipient");
    await expect(dist.setStakingContract(ethers.ZeroAddress)).to.be.revertedWith("invalid staking");
    await expect(dist.connect(other).setStakingContract(other.address)).to.be.reverted;
  });

  it("funding paths", async function () {
    const { dist, token, admin, provider, other } = await deployFixture();
    await expect(dist.addProviderBalance(provider.address, 0)).to.be.revertedWith("zero amount");
    await expect(dist.addProviderBalance(ethers.ZeroAddress, 1)).to.be.revertedWith("invalid provider");
    await dist.addProviderBalance(provider.address, ethers.parseEther("100"));

    await dist.setStakingContract(admin.address);
    await token.connect(admin).approve(await dist.getAddress(), ethers.parseEther("100"));
    await expect(
      dist.connect(provider).notifyRewardWithTransfer(provider.address, 1)
    ).to.be.revertedWith("unauthorised notifier");
    await expect(dist.connect(admin).notifyRewardWithTransfer(provider.address, 0)).to.be.revertedWith("zero amount");
    await expect(dist.connect(admin).notifyRewardWithTransfer(ethers.ZeroAddress, 1)).to.be.revertedWith(
      "invalid provider"
    );
    await dist.connect(admin).notifyRewardWithTransfer(provider.address, ethers.parseEther("10"));

    await token.mint(provider.address, 1);
    await token.connect(provider).approve(await dist.getAddress(), 1);
    await expect(dist.connect(other).depositBalance(1)).to.be.reverted;
    await dist.connect(provider).depositBalance(1);
    await expect(dist.connect(provider).depositBalance(0)).to.be.revertedWith("zero amount");
  });

  it("submit and claim guard branches", async function () {
    const { dist, provider, user, token, verifier } = await deployFixture();

    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    const total = ethers.parseEther("1");
    const { proofA, proofB, proofC, publicInputs } = buildProof(total);

    await expect(
      dist.connect(provider).submitMerkleRoot(root, (await time.latest()) + 10, total, proofA, proofB, proofC, publicInputs)
    ).to.be.revertedWith("Insufficient balance for claims");

    await dist.addProviderBalance(provider.address, total);

    await expect(
      dist.connect(provider).submitMerkleRoot(root, (await time.latest()) + 1, total, proofA, proofB, proofC, publicInputs)
    ).to.be.revertedWith("expiry too soon");

    await expect(
      dist.connect(provider).submitMerkleRoot(root, (await time.latest()) + 2 * 24 * 60 * 60, 0, proofA, proofB, proofC, publicInputs)
    ).to.be.revertedWith("zero claimable");

    const badInputs: [bigint, bigint, bigint] = [0n, total + 1n, publicInputs[2]];
    await expect(
      dist.connect(provider).submitMerkleRoot(root, (await time.latest()) + 2 * 24 * 60 * 60, total, proofA, proofB, proofC, badInputs)
    ).to.be.revertedWith("Amount mismatch");

    await verifier.setShouldVerify(false);
    await expect(
      dist.connect(provider).submitMerkleRoot(root, (await time.latest()) + 2 * 24 * 60 * 60, total, proofA, proofB, proofC, publicInputs)
    ).to.be.revertedWith("Invalid batch ZK proof");
    await verifier.setShouldVerify(true);

    await dist.connect(provider).submitMerkleRoot(root, (await time.latest()) + 2 * 24 * 60 * 60, total, proofA, proofB, proofC, publicInputs);

    await expect(dist.connect(user).claim(ethers.ZeroAddress, 0, 1, [])).to.be.revertedWith("invalid provider");
    await expect(dist.connect(user).claim(provider.address, 1, 1, [])).to.be.revertedWith("bad index");
    await expect(dist.connect(user).claim(provider.address, 0, 0, [])).to.be.revertedWith("zero amount");
    await expect(dist.connect(user).claim(provider.address, 0, 1, [])).to.be.revertedWith("invalid proof");

    // create a valid root for a successful claim
    await dist.addProviderBalance(provider.address, total);
    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const leaf = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [user.address, total, chainId])
    );
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    await dist.connect(provider).submitMerkleRoot(leaf, expiry, total, proofA, proofB, proofC, publicInputs);
    await dist.connect(user).claim(provider.address, 1, total, []);
    await expect(dist.connect(user).claim(provider.address, 1, total, [])).to.be.revertedWith("already claimed");
  });

  it("epoch closure and slashing branches", async function () {
    const { dist, provider, token, admin, user } = await deployFixture();

    await dist.addProviderBalance(provider.address, ethers.parseEther("10"));
    const root = ethers.keccak256(ethers.toUtf8Bytes("root"));
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    const total = ethers.parseEther("1");
    const { proofA, proofB, proofC, publicInputs } = buildProof(total);
    await dist.connect(provider).submitMerkleRoot(root, expiry, total, proofA, proofB, proofC, publicInputs);

    await time.increase(2 * 24 * 60 * 60);
    await expect(dist.closeEpoch(provider.address, 0)).to.be.revertedWith("close delay not over");
    await time.increase(3 * 24 * 60 * 60);
    await dist.closeEpoch(provider.address, 0);

    await expect(dist.slashProvider(provider.address, ethers.parseEther("100"))).to.be.revertedWith(
      "insufficient balance"
    );

    await dist.slashProvider(provider.address, ethers.parseEther("1"));

    // claim failure paths
    await expect(
      dist.connect(user).claim(provider.address, 0, 1, [])
    ).to.be.revertedWith("expired or grace period passed");
  });

  it("slashes locked balance when provider balance is insufficient", async function () {
    const { dist, provider, token, admin } = await deployFixture();

    const total = ethers.parseEther("5");
    await dist.addProviderBalance(provider.address, total);

    const root = ethers.keccak256(ethers.toUtf8Bytes("locked-root"));
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    const { proofA, proofB, proofC, publicInputs } = buildProof(total);
    await dist.connect(provider).submitMerkleRoot(root, expiry, total, proofA, proofB, proofC, publicInputs);

    expect(await dist.getProviderBalance(provider.address)).to.equal(0n);
    expect(await dist.getLockedBalance(provider.address)).to.equal(total);

    const adminBalBefore = await token.balanceOf(admin.address);
    const slashAmount = ethers.parseEther("2");
    await dist.slashProvider(provider.address, slashAmount);
    const adminBalAfter = await token.balanceOf(admin.address);

    expect(adminBalAfter - adminBalBefore).to.equal(slashAmount);
    expect(await dist.getLockedBalance(provider.address)).to.equal(total - slashAmount);
    const epoch = await dist.getEpochInfo(provider.address, 0);
    expect(epoch.totalClaimable).to.equal(total - slashAmount);
  });

  it("batch claim and getter paths", async function () {
    const { dist, provider, user } = await deployFixture();

    const total = ethers.parseEther("1");
    await dist.addProviderBalance(provider.address, total);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const root = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [user.address, total, chainId])
    );
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    const { proofA, proofB, proofC, publicInputs } = buildProof(total);
    await dist.connect(provider).submitMerkleRoot(root, expiry, total, proofA, proofB, proofC, publicInputs);

    const proof: string[] = [];
    await dist.connect(user).batchClaim([provider.address], [0], [total], [proof]);

    await dist.getLockedBalance(provider.address);
    await dist.getEpochInfo(provider.address, 0);
    await dist.getEpochCount(provider.address);
  });
});
