import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("DualPoolStaking", function () {
  async function deployDualPoolStakingFixture() {
    const [admin, provider1, provider2, user1, user2, emissionsContract] = await ethers.getSigners();

    // Deploy mock token
    const MockToken = await ethers.getContractFactory("MyntisSimple");
    const token = await MockToken.deploy(
      admin.address,
      ethers.parseEther("1000000000"), // 1B cap
      ethers.parseEther("1000000000")  // 1B max supply
    );
    await token.waitForDeployment();

    // Deploy DualPoolStaking
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const staking = await DualPoolStaking.deploy();
    await staking.waitForDeployment();

    // Initialize staking contract
    await staking.initialize(
      await token.getAddress(),
      emissionsContract.address,
      admin.address
    );

    // Deploy LiquidStakingVault
    const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
    const vault = await LiquidStakingVault.deploy(
      await token.getAddress(),
      await staking.getAddress(),
      admin.address
    );
    await vault.waitForDeployment();

    // Set vault in staking contract
    await staking.setLiquidStakingVault(await vault.getAddress());

    // Mint tokens to users
    await token.mint(provider1.address, ethers.parseEther("10000"));
    await token.mint(provider2.address, ethers.parseEther("10000"));
    await token.mint(user1.address, ethers.parseEther("10000"));
    await token.mint(user2.address, ethers.parseEther("10000"));

    // Approve staking contract
    await token.connect(provider1).approve(await staking.getAddress(), ethers.parseEther("10000"));
    await token.connect(provider2).approve(await staking.getAddress(), ethers.parseEther("10000"));
    await token.connect(user1).approve(await vault.getAddress(), ethers.parseEther("10000"));
    await token.connect(user2).approve(await vault.getAddress(), ethers.parseEther("10000"));

    return {
      staking,
      token,
      vault,
      admin,
      provider1,
      provider2,
      user1,
      user2,
      emissionsContract
    };
  }

  describe("Deployment", function () {
    it("Should initialize with correct parameters", async function () {
      const { staking, token, admin } = await loadFixture(deployDualPoolStakingFixture());

      expect(await staking.token()).to.equal(await token.getAddress());
      expect(await staking.minProviderStake()).to.equal(ethers.parseEther("100"));
      
      // Check roles
      expect(await staking.hasRole(await staking.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
      expect(await staking.hasRole(await staking.UPGRADER_ROLE(), admin.address)).to.be.true;
    });

    it("Should initialize pools with correct emission shares", async function () {
      const { staking } = await loadFixture(deployDualPoolStakingFixture());

      const providerPool = await staking.getPoolInfo(0); // PoolType.Provider
      const userPool = await staking.getPoolInfo(1);   // PoolType.User

      expect(providerPool.emissionShare).to.equal(875); // 87.5%
      expect(userPool.emissionShare).to.equal(125);     // 12.5%
    });
  });

  describe("Provider Pool Staking", function () {
    it("Should allow provider to stake in provider pool", async function () {
      const { staking, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await staking.connect(provider1).stakeToProviderPool(stakeAmount);

      const userInfo = await staking.userInfo(provider1.address);
      expect(userInfo.amount).to.equal(stakeAmount);
      expect(userInfo.poolType).to.equal(0); // PoolType.Provider
      expect(userInfo.isProvider).to.be.true;

      const providerPool = await staking.getPoolInfo(0);
      expect(providerPool.totalStaked).to.equal(stakeAmount);
    });

    it("Should reject stake below minimum", async function () {
      const { staking, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("50"); // Below 100 MYNT minimum
      await expect(
        staking.connect(provider1).stakeToProviderPool(stakeAmount)
      ).to.be.revertedWith("Below minimum stake");
    });

    it("Should allow provider to unstake", async function () {
      const { staking, token, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await staking.connect(provider1).stakeToProviderPool(stakeAmount);

      const unstakeAmount = ethers.parseEther("500");
      await staking.connect(provider1).unstakeFromProviderPool(unstakeAmount);

      const userInfo = await staking.userInfo(provider1.address);
      expect(userInfo.amount).to.equal(stakeAmount - unstakeAmount);

      const providerPool = await staking.getPoolInfo(0);
      expect(providerPool.totalStaked).to.equal(stakeAmount - unstakeAmount);
    });

    it("Should prevent unstaking more than staked", async function () {
      const { staking, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await staking.connect(provider1).stakeToProviderPool(stakeAmount);

      const unstakeAmount = ethers.parseEther("1500");
      await expect(
        staking.connect(provider1).unstakeFromProviderPool(unstakeAmount)
      ).to.be.revertedWith("Insufficient stake");
    });
  });

  describe("User Pool Staking (Liquid Staking)", function () {
    it("Should allow user to stake via liquid staking vault", async function () {
      const { vault, user1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await vault.connect(user1).deposit(stakeAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      expect(shares).to.be.gt(0);

      const userInfo = await vault.dualPoolStaking().then(addr => 
        ethers.getContractAt("DualPoolStaking", addr)
      ).then(contract => 
        contract.userInfo(user1.address)
      );
      expect(userInfo.amount).to.equal(stakeAmount);
      expect(userInfo.poolType).to.equal(1); // PoolType.User
      expect(userInfo.isProvider).to.be.false;
    });

    it("Should allow user to withdraw from liquid staking vault", async function () {
      const { vault, token, user1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await vault.connect(user1).deposit(stakeAmount, user1.address);

      const withdrawAmount = ethers.parseEther("500");
      await vault.connect(user1).withdraw(withdrawAmount, user1.address, user1.address);

      const balance = await token.balanceOf(user1.address);
      expect(balance).to.be.gt(0);
    });

    it("Should mint transferrable shares", async function () {
      const { vault, user1, user2 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await vault.connect(user1).deposit(stakeAmount, user1.address);

      const shares = await vault.balanceOf(user1.address);
      
      // Transfer shares to another user
      await vault.connect(user1).transfer(user2.address, shares);
      
      const user2Shares = await vault.balanceOf(user2.address);
      expect(user2Shares).to.equal(shares);
    });
  });

  describe("Pool Management", function () {
    it("Should update minimum provider stake", async function () {
      const { staking, admin } = await loadFixture(deployDualPoolStakingFixture());

      const newMinStake = ethers.parseEther("200");
      await staking.connect(admin).updateMinProviderStake(newMinStake);

      expect(await staking.minProviderStake()).to.equal(newMinStake);
    });

    it("Should reject stake below updated minimum", async function () {
      const { staking, admin, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const newMinStake = ethers.parseEther("200");
      await staking.connect(admin).updateMinProviderStake(newMinStake);

      const stakeAmount = ethers.parseEther("150"); // Below new minimum
      await expect(
        staking.connect(provider1).stakeToProviderPool(stakeAmount)
      ).to.be.revertedWith("Below minimum stake");
    });

    it("Should calculate total staked across both pools", async function () {
      const { staking, vault, provider1, user1 } = await loadFixture(deployDualPoolStakingFixture());

      const providerStake = ethers.parseEther("1000");
      const userStake = ethers.parseEther("500");

      await staking.connect(provider1).stakeToProviderPool(providerStake);
      await vault.connect(user1).deposit(userStake, user1.address);

      const totalStaked = await staking.getTotalStaked();
      expect(totalStaked).to.equal(providerStake + userStake);
    });
  });

  describe("Access Control", function () {
    it("Should only allow admin to update minimum stake", async function () {
      const { staking, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const newMinStake = ethers.parseEther("200");
      await expect(
        staking.connect(provider1).updateMinProviderStake(newMinStake)
      ).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });

    it("Should only allow admin to set liquid staking vault", async function () {
      const { staking, provider1, vault } = await loadFixture(deployDualPoolStakingFixture());

      await expect(
        staking.connect(provider1).setLiquidStakingVault(await vault.getAddress())
      ).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Events", function () {
    it("Should emit Staked event", async function () {
      const { staking, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await expect(
        staking.connect(provider1).stakeToProviderPool(stakeAmount)
      ).to.emit(staking, "Staked")
        .withArgs(provider1.address, stakeAmount, 0); // PoolType.Provider
    });

    it("Should emit Unstaked event", async function () {
      const { staking, provider1 } = await loadFixture(deployDualPoolStakingFixture());

      const stakeAmount = ethers.parseEther("1000");
      await staking.connect(provider1).stakeToProviderPool(stakeAmount);

      const unstakeAmount = ethers.parseEther("500");
      await expect(
        staking.connect(provider1).unstakeFromProviderPool(unstakeAmount)
      ).to.emit(staking, "Unstaked")
        .withArgs(provider1.address, unstakeAmount, 0); // PoolType.Provider
    });

    it("Should emit MinProviderStakeUpdated event", async function () {
      const { staking, admin } = await loadFixture(deployDualPoolStakingFixture());

      const newMinStake = ethers.parseEther("200");
      await expect(
        staking.connect(admin).updateMinProviderStake(newMinStake)
      ).to.emit(staking, "MinProviderStakeUpdated")
        .withArgs(ethers.parseEther("100"), newMinStake);
    });
  });

  describe("Integration", function () {
    it("Should handle multiple providers and users", async function () {
      const { staking, vault, provider1, provider2, user1, user2 } = await loadFixture(deployDualPoolStakingFixture());

      // Multiple providers stake
      await staking.connect(provider1).stakeToProviderPool(ethers.parseEther("1000"));
      await staking.connect(provider2).stakeToProviderPool(ethers.parseEther("2000"));

      // Multiple users stake via vault
      await vault.connect(user1).deposit(ethers.parseEther("500"), user1.address);
      await vault.connect(user2).deposit(ethers.parseEther("750"), user2.address);

      // Check total stakes
      const providerPool = await staking.getPoolInfo(0);
      const userPool = await staking.getPoolInfo(1);
      const totalStaked = await staking.getTotalStaked();

      expect(providerPool.totalStaked).to.equal(ethers.parseEther("3000"));
      expect(userPool.totalStaked).to.equal(ethers.parseEther("1250"));
      expect(totalStaked).to.equal(ethers.parseEther("4250"));
    });

    it("Should maintain correct emission shares", async function () {
      const { staking } = await loadFixture(deployDualPoolStakingFixture());

      const providerPool = await staking.getPoolInfo(0);
      const userPool = await staking.getPoolInfo(1);

      // Provider pool should get 87.5% of emissions
      expect(providerPool.emissionShare).to.equal(875);
      
      // User pool should get 12.5% of emissions
      expect(userPool.emissionShare).to.equal(125);
      
      // Total should be 100%
      expect(providerPool.emissionShare + userPool.emissionShare).to.equal(1000);
    });
  });
});
