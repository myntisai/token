import { ethers } from "hardhat";

async function main() {
  const proxy = process.env.STAKING_CONTRACT_ADDRESS || "0x22cD2e45f3462d44bAb4ab2427A491c5FE70f7d4";
  const implementation = process.env.NEW_STAKING_IMPLEMENTATION;
  if (!implementation) throw new Error("NEW_STAKING_IMPLEMENTATION required");

  const abi = [
    "function upgradeTo(address newImplementation) external",
    "function implementation() view returns (address)"
  ];
  const proxyContract = await ethers.getContractAt(abi, proxy);

  console.log("Current implementation:", await proxyContract.implementation());

  const tx = await proxyContract.upgradeTo(implementation);
  console.log("Upgrade tx:", tx.hash);
  await tx.wait();
  console.log("✅ Proxy upgraded");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
