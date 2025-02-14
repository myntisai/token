import { ethers } from "hardhat";

async function main() {
  // Grab the deployer (admin) account.
  const [deployer] = await ethers.getSigners();
  console.log("Deploying L2 contracts with the account:", deployer.address);

  // --------------------------
  // Deploy L2 MyntisToken
  // --------------------------
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", deployer);
  const l2Token = await MyntisTokenFactory.deploy(deployer.address);
  await l2Token.waitForDeployment();
  const l2TokenAddress = await l2Token.getAddress();
  console.log("L2 MyntisToken deployed at:", l2TokenAddress);

  // --------------------------
  // Deploy MyntisBridgeL2
  // --------------------------
  const MyntisBridgeL2Factory = await ethers.getContractFactory("MyntisBridgeL2", deployer);
  const l2Bridge = await MyntisBridgeL2Factory.deploy(l2TokenAddress, deployer.address);
  await l2Bridge.waitForDeployment();
  const l2BridgeAddress = await l2Bridge.getAddress();
  console.log("L2 MyntisBridge deployed at:", l2BridgeAddress);

  // Grant MINTER_ROLE on l2Token to l2Bridge.
  const MINTER_ROLE = await l2Token.MINTER_ROLE();
  const grantTx = await l2Token.grantRole(MINTER_ROLE, l2BridgeAddress);
  await grantTx.wait();
  console.log("Granted MINTER_ROLE on L2 MyntisToken to L2 Bridge.");

  // --------------------------
  // Deploy L2MerkleDistributor
  // --------------------------
  const L2MerkleDistributorFactory = await ethers.getContractFactory("L2MerkleDistributor", deployer);
  const l2MerkleDistributor = await L2MerkleDistributorFactory.deploy(l2TokenAddress, deployer.address);
  await l2MerkleDistributor.waitForDeployment();
  const l2MerkleDistributorAddress = await l2MerkleDistributor.getAddress();
  console.log("L2MerkleDistributor deployed at:", l2MerkleDistributorAddress);

  console.log("L2 Deployment and configuration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in L2 Deployment:", error);
    process.exit(1);
  });