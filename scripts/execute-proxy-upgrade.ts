import { ethers } from "hardhat";

async function main() {
  const proxy = process.env.STAKING_CONTRACT_ADDRESS || "0x22cD2e45f3462d44bAb4ab2427A491c5FE70f7d4";
  const admin = process.env.STAKING_PROXY_ADMIN || "0x464E19a880D5D4D038d82D3202162cC441B1D96A";
  const implementation = process.env.NEW_STAKING_IMPLEMENTATION;

  if (!implementation) {
    throw new Error("NEW_STAKING_IMPLEMENTATION env var required");
  }

  console.log("Proxy:", proxy);
  console.log("ProxyAdmin:", admin);
  console.log("New implementation:", implementation);

  const [signer] = await ethers.getSigners();
  const proxyAdminAbi = ["function upgrade(address proxy, address implementation) external"];
  const proxyAdmin = await ethers.getContractAt(proxyAdminAbi, admin);
  const populated = await proxyAdmin.getFunction("upgrade").populateTransaction(proxy, implementation);
  console.log("Calldata:", populated.data);
 const tx = await signer.sendTransaction({
    to: admin,
    data: populated.data,
    gasLimit: 2_000_000,
  });
  console.log("Upgrade tx:", tx.hash);
  console.log("Tx data field:", tx.data);
  await tx.wait();
  console.log("✅ Proxy upgraded");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
