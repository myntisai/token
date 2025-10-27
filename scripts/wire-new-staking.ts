import { ethers } from "hardhat";

async function main() {
  const stakingAddr = process.env.NEW_STAKING!;
  const emissionsAddr = process.env.NEW_EMISSIONS!;
  const merkleAddr = process.env.NEW_MERKLE!;
  const tokenAddr = process.env.TOKEN_ADDR!;

  console.log("Staking:", stakingAddr);
  console.log("Emissions:", emissionsAddr);
  console.log("Merkle:", merkleAddr);
  console.log("Token:", tokenAddr);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const staking = await ethers.getContractAt("StakingContract", stakingAddr);
  const token = await ethers.getContractAt("MyntisToken", tokenAddr);

  try {
    const gas = await staking.setEmissionContract.estimateGas(emissionsAddr);
    console.log("setEmissionContract gas:", gas.toString());
    const tx = await staking.setEmissionContract(emissionsAddr);
    console.log("setEmissionContract tx:", tx.hash);
    await tx.wait();
  } catch (e:any) {
    console.log("setEmissionContract error:", e.message);
  }

  try {
    const gas2 = await staking.setMerkleDistributor.estimateGas(merkleAddr);
    console.log("setMerkleDistributor gas:", gas2.toString());
    const tx2 = await staking.setMerkleDistributor(merkleAddr);
    console.log("setMerkleDistributor tx:", tx2.hash);
    await tx2.wait();
  } catch (e:any) {
    console.log("setMerkleDistributor error:", e.message);
  }

  try {
    const MINTER_ROLE = await token.MINTER_ROLE();
    const has = await token.hasRole(MINTER_ROLE, emissionsAddr);
    if (!has) {
      const tx3 = await token.grantRole(MINTER_ROLE, emissionsAddr);
      console.log("grantRole(MINTER_ROLE) tx:", tx3.hash);
      await tx3.wait();
    } else {
      console.log("Emissions already has MINTER_ROLE");
    }
  } catch (e:any) {
    console.log("grantRole error:", e.message);
  }

  try {
    const ec = await staking.emissionContract();
    console.log("emissionContract now:", ec);
  } catch (e:any) {
    console.log("read emissionContract error:", e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
