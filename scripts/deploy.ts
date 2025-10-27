import { ethers, upgrades } from "hardhat";

async function main() {
  // Grab the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // --------------------------
  // Deploy MyntisToken
  // --------------------------
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken");
  const myntisToken = (await MyntisTokenFactory.deploy(deployer.address)) as any;
  await myntisToken.waitForDeployment();
  const myntisTokenAddress = await myntisToken.getAddress();
  console.log("MyntisToken deployed at:", myntisTokenAddress);

  // --------------------------
  // Deploy MerkleDistributor (non-upgradeable)
  // --------------------------
  const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = (await MerkleDistributorFactory.deploy(myntisTokenAddress, deployer.address)) as any;
  await merkleDistributor.waitForDeployment();
  const merkleDistributorAddress = await merkleDistributor.getAddress();
  console.log("MerkleDistributor deployed at:", merkleDistributorAddress);

  // --------------------------
  // Deploy StakingContract proxy (initializer)
  // --------------------------
  const StakingFactory = await ethers.getContractFactory("StakingContract");
  const staking = await upgrades.deployProxy(
    StakingFactory,
    [myntisTokenAddress, ethers.ZeroAddress, ethers.ZeroAddress, deployer.address],
    { initializer: "initialize" }
  );
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("StakingContract proxy deployed at:", stakingAddress);

  // --------------------------
  // Deploy EmissionsUpgradeable (UUPS proxy)
  // --------------------------
  const EmissionsFactory = await ethers.getContractFactory("EmissionsUpgradeable");
  const emissions = await upgrades.deployProxy(
    EmissionsFactory,
    [myntisTokenAddress, stakingAddress, deployer.address],
    { initializer: "initialize", kind: "uups" }
  );
  await emissions.waitForDeployment();
  const emissionsAddress = await emissions.getAddress();
  console.log("EmissionsUpgradeable proxy deployed at:", emissionsAddress);

  // --------------------------
  // Configure contracts
  // --------------------------
  console.log("Setting EmissionContract in StakingContract...");
  const tx1 = await staking.setEmissionContract(emissionsAddress);
  await tx1.wait();

  console.log("Setting MerkleDistributor in StakingContract...");
  const tx2 = await staking.setMerkleDistributor(merkleDistributorAddress);
  await tx2.wait();

  // Grant MINTER_ROLE in MyntisToken to the EmissionContract.
  console.log("Granting MINTER_ROLE to EmissionContract...");
  const MINTER_ROLE = await myntisToken.MINTER_ROLE();
  const tx3 = await myntisToken.grantRole(MINTER_ROLE, emissionsAddress);
  await tx3.wait();

  // Set the staking contract address in the MerkleDistributor.
  console.log("Setting StakingContract in MerkleDistributor...");
  if (merkleDistributor.setStakingContract) {
    const tx4 = await merkleDistributor.setStakingContract(stakingAddress);
    await tx4.wait();
  } else {
    console.log("MerkleDistributor does not expose setStakingContract (skipping)");
  }

  console.log("Deployment and configuration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
