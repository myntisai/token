import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying L1 contracts with the account:", deployer.address);

  // Deploy MyntisToken on L1
  const MyntisTokenFactory = await ethers.getContractFactory("MyntisToken", deployer);
  const l1Token = await MyntisTokenFactory.deploy(deployer.address);
  await l1Token.waitForDeployment();
  const l1TokenAddress = await l1Token.getAddress();
  console.log("L1 MyntisToken deployed at:", l1TokenAddress);

  // Deploy MyntisBridgeL1 (L1 bridge)
  const MyntisBridgeL1Factory = await ethers.getContractFactory("MyntisBridgeL1", deployer);
  const l1Bridge = await MyntisBridgeL1Factory.deploy(l1TokenAddress, deployer.address);
  await l1Bridge.waitForDeployment();
  const l1BridgeAddress = await l1Bridge.getAddress();
  console.log("L1 Bridge deployed at:", l1BridgeAddress);

  console.log("L1 Deployment complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error in L1 Deployment:", error);
    process.exit(1);
  });