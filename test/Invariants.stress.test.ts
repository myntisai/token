import { expect } from "chai";
import { ethers } from "hardhat";

describe("Invariant Stress Tests", function () {
  function nextSeed(seed: bigint): bigint {
    // Deterministic LCG
    return (seed * 48271n) % 0x7fffffffn;
  }

  function randRange(seed: bigint, maxExclusive: number): [bigint, number] {
    const next = nextSeed(seed);
    return [next, Number(next % BigInt(maxExclusive))];
  }

  it("GlobalSupplyRegistry: allocated supply never exceeds cap under random ops", async function () {
    const [admin] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const Registry = await ethers.getContractFactory("GlobalSupplyRegistry");
    const registry = await Registry.deploy(await endpoint.getAddress(), admin.address);
    await registry.waitForDeployment();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock", "MOCK");
    await token.waitForDeployment();

    const network = await ethers.provider.getNetwork();
    const hubChainId = Number(network.chainId);

    const tokenAddress = await token.getAddress();
    await registry.registerToken(tokenAddress);
    await ethers.provider.send("hardhat_setBalance", [tokenAddress, "0x1000000000000000000"]);
    const tokenSigner = await ethers.getImpersonatedSigner(tokenAddress);
    const registryAsToken = registry.connect(tokenSigner);
    await registry.updateCap(1_000_000);
    await registry.seedChainSupply(hubChainId, 1000);
    await registry.setChainQuota(2, 500);

    let seed = 12345n;
    for (let i = 0; i < 5; i += 1) {
      [seed, i] = [seed, i];
      let action: number;
      [seed, action] = randRange(seed, 4);

      const cap = await registry.globalCap();
      const total = await registry.totalCrossChainSupply();
      const reserved = await registry.totalReservedQuota();
      const chainQuota = await registry.chainQuota(2);

      if (action === 0) {
        // recordMint if possible
        const maxMint = cap > total + reserved ? cap - total - reserved : 0n;
        if (maxMint > 0n) {
          const amount = maxMint > 10n ? 10n : maxMint;
          await registryAsToken.recordMint(amount);
        }
      } else if (action === 1) {
        // recordBurn if supply available
        const hubSupply = await registry.chainSupply(hubChainId);
        if (hubSupply > 0n) {
          const amount = hubSupply > 5n ? 5n : hubSupply;
          await registryAsToken.recordBurn(amount);
        }
      } else if (action === 2) {
        // adjust chain quota within cap
        const alloc = total + reserved - chainQuota;
        const maxQuota = cap > alloc ? cap - alloc : 0n;
        const newQuota = maxQuota > 50n ? 50n : maxQuota;
        await registry.setChainQuota(2, newQuota);
      } else {
        // update cap to current allocated + buffer
        const alloc = total + reserved;
        await registry.updateCap(alloc + 1000n);
      }

      const newTotal = await registry.totalCrossChainSupply();
      const newReserved = await registry.totalReservedQuota();
      const newCap = await registry.globalCap();
      const q2 = await registry.chainQuota(2);
      const qHub = await registry.chainQuota(hubChainId);

      expect(newTotal + newReserved).to.be.lte(newCap);
      expect(newReserved).to.equal(q2 + qHub);
    }
  });

  it("MyntisOFTSpoke: totalSupply matches tracked balance under random ops", async function () {
    const [admin, user] = await ethers.getSigners();
    const Endpoint = await ethers.getContractFactory("LayerZeroEndpointMock");
    const endpoint = await Endpoint.deploy(1);
    await endpoint.waitForDeployment();

    const Spoke = await ethers.getContractFactory("MyntisOFTSpoke");
    const spoke = await Spoke.deploy(await endpoint.getAddress(), admin.address, 1, 1);
    await spoke.waitForDeployment();

    await spoke.grantRole(await spoke.MINTER_ROLE(), admin.address);
    const QuotaReceiverMock = await ethers.getContractFactory("QuotaReceiverMock");
    const quotaReceiver = await QuotaReceiverMock.deploy();
    await quotaReceiver.waitForDeployment();
    await spoke.setQuotaReceiver(await quotaReceiver.getAddress());
    await quotaReceiver.increaseQuota(await spoke.getAddress(), 1000);

    let expectedSupply = 0n;
    let expectedUser = 0n;
    let seed = 999n;

    for (let i = 0; i < 5; i += 1) {
      let action: number;
      [seed, action] = randRange(seed, 4);
      const amount = BigInt((i % 5) + 1);

      if (action === 0) {
        await spoke.mint(user.address, amount);
        expectedSupply += amount;
        expectedUser += amount;
      } else if (action === 1) {
        await spoke.emergencyMint(user.address, amount, "stress");
        expectedSupply += amount;
        expectedUser += amount;
      } else if (action === 2) {
        if (expectedUser >= amount) {
          await spoke.connect(user).burn(amount);
          expectedSupply -= amount;
          expectedUser -= amount;
        }
      }

      expect(await spoke.totalSupply()).to.equal(expectedSupply);
      expect(await spoke.balanceOf(user.address)).to.equal(expectedUser);
    }
  });
});
