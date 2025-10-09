import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying Myntis Original Structure...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  // 1. Deploy MyntisToken
  console.log("\n📄 Deploying MyntisToken...");
  const MyntisToken = await ethers.getContractFactory("MyntisToken");
  const token = await MyntisToken.deploy(deployer.address);
  await token.waitForDeployment();
  console.log("✅ MyntisToken deployed to:", await token.getAddress());

  // 2. Deploy MerkleDistributor
  console.log("\n🌳 Deploying MerkleDistributor...");
  const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = await MerkleDistributor.deploy(await token.getAddress(), deployer.address);
  await merkleDistributor.waitForDeployment();
  console.log("✅ MerkleDistributor deployed to:", await merkleDistributor.getAddress());

  // 3. Deploy StakingContract
  console.log("\n🏦 Deploying StakingContract...");
  const StakingContract = await ethers.getContractFactory("StakingContract");
  const stakingContract = await StakingContract.deploy(
    await token.getAddress(),
    ethers.ZeroAddress, // Will set emissions contract later
    await merkleDistributor.getAddress(),
    deployer.address
  );
  await stakingContract.waitForDeployment();
  console.log("✅ StakingContract deployed to:", await stakingContract.getAddress());

  // 4. Deploy EmissionsContract
  console.log("\n⚡ Deploying EmissionsContract...");
  const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
  const emissionsContract = await EmissionsContract.deploy(
    await token.getAddress(),
    await stakingContract.getAddress(),
    deployer.address
  );
  await emissionsContract.waitForDeployment();
  console.log("✅ EmissionsContract deployed to:", await emissionsContract.getAddress());

  // 5. Configure the system
  console.log("\n🔧 Configuring the system...");
  
  // Grant MINTER_ROLE to emissions contract
  await token.grantRole(await token.MINTER_ROLE(), await emissionsContract.getAddress());
  console.log("✅ Granted MINTER_ROLE to EmissionsContract");

  // Set emissions contract in staking contract
  await stakingContract.setEmissionContract(await emissionsContract.getAddress());
  console.log("✅ Set EmissionsContract in StakingContract");

  // Set staking contract in merkle distributor
  await merkleDistributor.setStakingContract(await stakingContract.getAddress());
  console.log("✅ Set StakingContract in MerkleDistributor");

  console.log("\n🎉 Deployment completed successfully!");
  console.log("\n📋 Contract Addresses:");
  console.log("MyntisToken:", await token.getAddress());
  console.log("StakingContract:", await stakingContract.getAddress());
  console.log("EmissionsContract:", await emissionsContract.getAddress());
  console.log("MerkleDistributor:", await merkleDistributor.getAddress());

  console.log("\n🔍 Verification Commands:");
  console.log(`npx hardhat verify --network <network> ${await token.getAddress()} "${deployer.address}"`);
  console.log(`npx hardhat verify --network <network> ${await merkleDistributor.getAddress()} "${await token.getAddress()}" "${deployer.address}"`);
  console.log(`npx hardhat verify --network <network> ${await stakingContract.getAddress()} "${await token.getAddress()}" "${ethers.ZeroAddress}" "${await merkleDistributor.getAddress()}" "${deployer.address}"`);
  console.log(`npx hardhat verify --network <network> ${await emissionsContract.getAddress()} "${await token.getAddress()}" "${await stakingContract.getAddress()}" "${deployer.address}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
