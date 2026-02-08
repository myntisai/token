import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SpokeDistributor Coverage", function () {
  async function deployFixture() {
    const [admin, provider, user] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const SpokeFactory = await ethers.getContractFactory("MyntisOFTSpoke");
    const spoke = await SpokeFactory.deploy(await endpoint.getAddress(), admin.address, 40245, 1);
    await spoke.waitForDeployment();

    const Distributor = await ethers.getContractFactory("SpokeDistributor");
    const distributor = await Distributor.deploy(await spoke.getAddress(), admin.address);
    await distributor.waitForDeployment();

    const QuotaReceiverMock = await ethers.getContractFactory("QuotaReceiverMock");
    const quotaReceiver = await QuotaReceiverMock.deploy();
    await quotaReceiver.waitForDeployment();
    await spoke.setQuotaReceiver(await quotaReceiver.getAddress());
    await quotaReceiver.increaseQuota(await spoke.getAddress(), ethers.parseEther("1000000"));

    await spoke.grantRole(await spoke.MINTER_ROLE(), await distributor.getAddress());
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider.address);

    return { admin, provider, user, distributor };
  }

  function leaf(claimant: string, amount: bigint, chainId: bigint) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "uint256"], [claimant, amount, chainId])
    );
  }

  function nullifier(claimant: string, amount: bigint, chainId: bigint, provider: string, rootIndex: number) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "address", "uint256"],
        [claimant, amount, chainId, provider, BigInt(rootIndex)]
      )
    );
  }

  it("batch and closeEpoch branches", async function () {
    const { admin, provider, user, distributor } = await deployFixture();
    const network = await ethers.provider.getNetwork();
    const chainId = BigInt(network.chainId);

    const amount = ethers.parseEther("10");
    await distributor.connect(admin).addProviderBalance(provider.address, amount);

    const root = leaf(user.address, amount, chainId);
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    await distributor.connect(provider).submitMerkleRoot(root, expiry, amount);

    const proof: string[] = [];
    const nf = nullifier(user.address, amount, chainId, provider.address, 0);
    await distributor.connect(user).claim(provider.address, 0, amount, proof, nf);

    await expect(distributor.batchClaim(new Array(21).fill(provider.address), [], [], [], [])).to.be.revertedWith(
      "Batch too large"
    );

    await expect(
      distributor.batchClaim([provider.address], [], [], [], [])
    ).to.be.revertedWith("Arrays length mismatch");

    await time.increase(3 * 24 * 60 * 60);
    await expect(distributor.connect(admin).closeEpoch(provider.address, 0)).to.be.revertedWith(
      "close delay not over"
    );
    await time.increase(2 * 24 * 60 * 60);
    await distributor.connect(admin).closeEpoch(provider.address, 0);
    await expect(distributor.connect(admin).closeEpoch(provider.address, 0)).to.be.revertedWith("already closed");

    await expect(distributor.getEpochInfo(provider.address, 5)).to.be.revertedWith("bad index");
  });

  it("batch claim and getter paths", async function () {
    const { admin, provider, user, distributor } = await deployFixture();
    const network = await ethers.provider.getNetwork();
    const chainId = BigInt(network.chainId);

    const amount = ethers.parseEther("5");
    await distributor.connect(admin).addProviderBalance(provider.address, amount);
    const root = leaf(user.address, amount, chainId);
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    await distributor.connect(provider).submitMerkleRoot(root, expiry, amount);

    const proof: string[] = [];
    const nf = nullifier(user.address, amount, chainId, provider.address, 0);
    await distributor.connect(user).batchClaim([provider.address], [0], [amount], [proof], [nf]);

    await distributor.getLockedBalance(provider.address);
    await distributor.hasClaimed(provider.address, 0, user.address);
    await distributor.isNullifierUsed(nf);
    await distributor.getEpochInfo(provider.address, 0);
  });

  it("constructor and guard branches", async function () {
    const [admin] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const Distributor = await ethers.getContractFactory("SpokeDistributor");
    await expect(Distributor.deploy(ethers.ZeroAddress, admin.address)).to.be.revertedWith("invalid spoke token");
    await expect(Distributor.deploy(await token.getAddress(), ethers.ZeroAddress)).to.be.revertedWith("invalid admin");
  });

  it("submit and claim guard branches", async function () {
    const { admin, provider, user, distributor } = await deployFixture();
    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);

    const amount = ethers.parseEther("2");
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    const root = leaf(user.address, amount, chainId);

    await expect(distributor.connect(provider).submitMerkleRoot(root, expiry, 0)).to.be.revertedWith("zero claimable");
    await expect(
      distributor.connect(provider).submitMerkleRoot(root, (await time.latest()) + 10, amount)
    ).to.be.revertedWith("expiry too soon");

    await expect(distributor.connect(admin).addProviderBalance(provider.address, 0)).to.be.revertedWith("zero amount");
    await expect(distributor.connect(admin).addProviderBalance(ethers.ZeroAddress, 1)).to.be.revertedWith(
      "invalid provider"
    );

    await expect(
      distributor.connect(provider).submitMerkleRoot(root, expiry, amount)
    ).to.be.revertedWith("Insufficient balance for claims");

    await distributor.connect(admin).addProviderBalance(provider.address, amount);
    await distributor.connect(provider).submitMerkleRoot(root, expiry, amount);

    const proof: string[] = [];
    const nf = nullifier(user.address, amount, chainId, provider.address, 0);

    await expect(distributor.connect(user).claim(ethers.ZeroAddress, 0, amount, proof, nf)).to.be.revertedWith(
      "invalid provider"
    );
    await expect(distributor.connect(user).claim(provider.address, 1, amount, proof, nf)).to.be.revertedWith(
      "bad index"
    );
    await expect(distributor.connect(user).claim(provider.address, 0, 0, proof, nf)).to.be.revertedWith(
      "zero amount"
    );
    await expect(
      distributor.connect(user).claim(provider.address, 0, amount, proof, ethers.ZeroHash)
    ).to.be.revertedWith("invalid nullifier");
    const badRoot = ethers.keccak256(ethers.toUtf8Bytes("bad-root"));
    await distributor.connect(admin).addProviderBalance(provider.address, amount);
    await distributor.connect(provider).submitMerkleRoot(badRoot, expiry, amount);
    const nfBad = nullifier(user.address, amount, chainId, provider.address, 1);
    await expect(distributor.connect(user).claim(provider.address, 1, amount, proof, nfBad)).to.be.revertedWith(
      "invalid proof"
    );

    // valid claim with correct root/proof (empty proof for single-leaf tree)
    await distributor.connect(user).claim(provider.address, 0, amount, proof, nf);
    await expect(distributor.connect(user).claim(provider.address, 0, amount, proof, nf)).to.be.revertedWith(
      "already claimed"
    );

    const root2 = leaf(user.address, amount, chainId);
    const expiry2 = (await time.latest()) + 2 * 24 * 60 * 60;
    await distributor.connect(admin).addProviderBalance(provider.address, amount);
    await distributor.connect(provider).submitMerkleRoot(root2, expiry2, amount);
    const nf2 = nullifier(user.address, amount, chainId, provider.address, 2);
    await distributor.connect(user).claim(provider.address, 2, amount, proof, nf2);
    await expect(distributor.connect(user).claim(provider.address, 2, amount, proof, nf2)).to.be.revertedWith(
      "already claimed"
    );
  });

  it("claim edge cases and mint verification failure", async function () {
    const [admin, provider, user] = await ethers.getSigners();

    const SpokeToken = await ethers.getContractFactory("SpokeTokenNoMint");
    const token = await SpokeToken.deploy();
    await token.waitForDeployment();

    const Distributor = await ethers.getContractFactory("SpokeDistributor");
    const distributor = await Distributor.deploy(await token.getAddress(), admin.address);
    await distributor.waitForDeployment();
    await distributor.grantRole(await distributor.PROVIDER_ROLE(), provider.address);

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    const amount = ethers.parseEther("1");
    const expiry = (await time.latest()) + 2 * 24 * 60 * 60;
    const root = leaf(user.address, amount, chainId);

    await distributor.connect(admin).addProviderBalance(provider.address, amount);
    await distributor.connect(provider).submitMerkleRoot(root, expiry, amount);
    const proof: string[] = [];
    const nf = nullifier(user.address, amount, chainId, provider.address, 0);

    await expect(distributor.connect(user).claim(provider.address, 0, amount, proof, nf)).to.be.revertedWith(
      "mint verification failed"
    );
  });
});
