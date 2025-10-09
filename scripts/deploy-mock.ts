// scripts/deploy-mock.ts
import { ethers } from "hardhat";

async function main() {
  // Deploy the mock LayerZero endpoint
  const MockLzEndpoint = await ethers.getContractFactory("MockLzEndpoint");
  const mockEndpoint = await MockLzEndpoint.deploy();
  await mockEndpoint.waitForDeployment();
  const endpointAddress = await mockEndpoint.getAddress();
  console.log("MockLzEndpoint deployed at:", endpointAddress);

  // Deploy your MyntisBridge contract with the mock endpoint address
  const [deployer] = await ethers.getSigners();
  const myntisTokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // use a mock token if needed
  const merkleDistributorAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"; // or a mock
  const MyntisBridge = await ethers.getContractFactory("MyntisBridge");
  const bridge = await MyntisBridge.deploy(
    endpointAddress,
    deployer.address,
    myntisTokenAddress,
    merkleDistributorAddress
  );
  await bridge.waitForDeployment();
  console.log("MyntisBridge deployed at:", await bridge.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
