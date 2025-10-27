import { ethers, upgrades } from "hardhat";

async function main() {
  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || "0x51336a21eDf2225db97513d3671e8a4e26C299ea";
  const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS || "0xcBeC89921DDb9Ec10aF7737e7AA10249660d37D8";
  const adminAddress = process.env.ADMIN_ADDRESS || "0x0904192498effF59e0502aE1700ecAa9B1708543";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const MerkleFactory = await ethers.getContractFactory("MerkleDistributor");
  const merkle = await MerkleFactory.deploy(tokenAddress, adminAddress);
  await merkle.waitForDeployment();
  const merkleAddress = await merkle.getAddress();
  console.log("MerkleDistributor deployed:", merkleAddress);

  const StakingFactory = await ethers.getContractFactory("StakingContract");
  const staking = await upgrades.deployProxy(
    StakingFactory,
    [tokenAddress, emissionsAddress, merkleAddress, adminAddress],
    { initializer: "initialize" }
  );
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("Staking proxy deployed:", stakingAddress);

  const emissions = await ethers.getContractAt("EmissionsUpgradeable", emissionsAddress);
  await (await emissions.setStakingContract(stakingAddress)).wait();
  console.log("Emissions staking contract updated.");

  const token = await ethers.getContractAt("MyntisToken", tokenAddress);
  const minterRole = await token.MINTER_ROLE();
  if (!(await token.hasRole(minterRole, emissionsAddress))) {
    await (await token.grantRole(minterRole, emissionsAddress)).wait();
    console.log("Granted MINTER_ROLE to emissions");
  }

  console.log("Deployment summary:");
  console.log("  Token:            ", tokenAddress);
  console.log("  Emissions:        ", emissionsAddress);
  console.log("  Staking (proxy):  ", stakingAddress);
  console.log("  MerkleDistributor:", merkleAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
