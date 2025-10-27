import { ethers, upgrades } from "hardhat";

async function main() {
  const tokenAddress = process.env.MYNTIS_OFT_ADDRESS;
  const adminAddress = process.env.ADMIN_ADDRESS;

  if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
    throw new Error("Missing or invalid MYNTIS_OFT_ADDRESS");
  }

  const [deployer] = await ethers.getSigners();
  const admin = adminAddress ? ethers.getAddress(adminAddress) : deployer.address;

  console.log("👷 Deploying staking stack with account:", deployer.address);
  console.log("   Token:", tokenAddress);
  console.log("   Admin:", admin);

  // MerkleDistributor
  const MerkleFactory = await ethers.getContractFactory("MerkleDistributor");
  const merkle = await MerkleFactory.deploy(tokenAddress, admin);
  await merkle.waitForDeployment();
  const merkleAddress = await merkle.getAddress();
  console.log("✅ MerkleDistributor:", merkleAddress);

  // Staking proxy
  const StakingFactory = await ethers.getContractFactory("StakingContract");
  const staking = await upgrades.deployProxy(
    StakingFactory,
    [tokenAddress, ethers.ZeroAddress, merkleAddress, admin],
    { initializer: "initialize" }
  );
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("✅ StakingContract (proxy):", stakingAddress);

  // Emissions proxy
  const EmissionsFactory = await ethers.getContractFactory("EmissionsUpgradeable");
  const emissions = await upgrades.deployProxy(
    EmissionsFactory,
    [tokenAddress, stakingAddress, admin],
    { initializer: "initialize", kind: "uups" }
  );
  await emissions.waitForDeployment();
  const emissionsAddress = await emissions.getAddress();
  console.log("✅ EmissionsUpgradeable (proxy):", emissionsAddress);

  // Wire dependencies
  console.log("🔧 Wiring contracts...");
  await (await staking.setEmissionContract(emissionsAddress)).wait();
  await (await staking.setMerkleDistributor(merkleAddress)).wait();

  const token = await ethers.getContractAt("MyntisOFT", tokenAddress);
  const MINTER_ROLE = await token.MINTER_ROLE();
  await (await token.grantRole(MINTER_ROLE, emissionsAddress)).wait();

  if (token.grantRole) {
    await (await token.grantRole(MINTER_ROLE, stakingAddress)).wait();
  }

  console.log("🎉 Staking stack deployment complete.");
  console.log("   MerkleDistributor:", merkleAddress);
  console.log("   StakingContract:", stakingAddress);
  console.log("   EmissionsUpgradeable:", emissionsAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
