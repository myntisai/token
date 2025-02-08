import { ethers } from "hardhat";

async function main() {
  // Grab the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // --------------------------
  // Deploy MyntisToken
  // --------------------------
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", deployer);
  const myntisToken = await MyntisTokenFactory.deploy(deployer.address);
  await myntisToken.waitForDeployment();
  const myntisTokenAddress = await myntisToken.getAddress();
  console.log("MyntisToken deployed at:", myntisTokenAddress);

  // --------------------------
  // Deploy StakingContract
  // --------------------------
  const StakingFactory = await ethers.getContractFactory("StakingContract", deployer);
  const staking = await StakingFactory.deploy(myntisTokenAddress, deployer.address);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("StakingContract deployed at:", stakingAddress);

  // --------------------------
  // Deploy EmissionContract
  // --------------------------
  const EmissionFactory = await ethers.getContractFactory("EmissionContract", deployer);
  const emissions = await EmissionFactory.deploy(myntisTokenAddress, stakingAddress, deployer.address);
  await emissions.waitForDeployment();
  const emissionsAddress = await emissions.getAddress();
  console.log("EmissionContract deployed at:", emissionsAddress);

  // --------------------------
  // Deploy MerkleDistributor
  // --------------------------
  const MerkleDistributorFactory = await ethers.getContractFactory("MerkleDistributor", deployer);
  const merkleDistributor = await MerkleDistributorFactory.deploy(myntisTokenAddress, deployer.address);
  await merkleDistributor.waitForDeployment();
  const merkleDistributorAddress = await merkleDistributor.getAddress();
  console.log("MerkleDistributor deployed at:", merkleDistributorAddress);

  // --------------------------
  // Configure contracts
  // --------------------------

  // Set the Emission and MerkleDistributor addresses in the Staking contract.
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
  const tx4 = await merkleDistributor.setStakingContract(stakingAddress);
  await tx4.wait();

  console.log("Deployment and configuration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });