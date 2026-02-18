import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(
  __dirname,
  "..",
  "deployments",
  "deployment-base-sepolia-latest.json"
);

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const distributorAddr = deployment.zkMerkleDistributor as string;
  const tokenAddr = deployment.myntis as string;

  const [rawSigner] = await ethers.getSigners();
  const signer = new ethers.NonceManager(rawSigner);
  const signerAddress = await rawSigner.getAddress();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(80));
  console.log("CLAIM LATEST ROOT (TEST)");
  console.log("=".repeat(80));
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Signer:", signerAddress);
  console.log("Distributor:", distributorAddr);
  console.log("Token:", tokenAddr);

  const distributor = await ethers.getContractAt(
    "ZKMerkleDistributor",
    distributorAddr,
    signer
  );
  const token = await ethers.getContractAt("Myntis", tokenAddr, signer);

  const epochCount = await distributor.getEpochCount(signerAddress);
  if (epochCount === 0n) {
    throw new Error("No epochs found for provider.");
  }

  const rootIndex = Number(epochCount - 1n);
  const epochInfo = await distributor.getEpochInfo(signerAddress, rootIndex);
  const onchainRoot = epochInfo[0];

  const claimAmounts = [
    ethers.parseEther("10"),
    ethers.parseEther("20"),
    ethers.parseEther("30"),
  ];
  const users = [
    signerAddress,
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
  ];

  const leaves = users.map((user, i) =>
    ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256"],
      [user, claimAmounts[i], network.chainId]
    )
  );

  const { MerkleTree } = require("merkletreejs");
  const hashFn = (data: string) => Buffer.from(ethers.getBytes(ethers.keccak256(data)));
  const leafBuffers = leaves.map((l) => Buffer.from(l.slice(2), "hex"));
  const tree = new MerkleTree(leafBuffers, hashFn, {
    sortPairs: false,
  });
  const computedRoot = tree.getHexRoot();

  console.log("On-chain root:", onchainRoot);
  console.log("Computed root:", computedRoot);

  if (computedRoot.toLowerCase() !== String(onchainRoot).toLowerCase()) {
    throw new Error("Computed root does not match on-chain root. Abort claim.");
  }

  const claimantLeaf = leafBuffers[0];
  const merkleProof = tree.getHexProof(claimantLeaf).map((p: Buffer) =>
    ethers.hexlify(p)
  );

  const claimAmount = claimAmounts[0];

  const balanceBefore = await token.balanceOf(signerAddress);
  console.log("Balance before:", ethers.formatEther(balanceBefore), "MYNT");

  const claimTx = await distributor.claim(
    signerAddress,
    rootIndex,
    claimAmount,
    merkleProof
  );
  console.log("claim tx:", claimTx.hash);
  await claimTx.wait();

  const balanceAfter = await token.balanceOf(signerAddress);
  console.log("Balance after:", ethers.formatEther(balanceAfter), "MYNT");
  console.log(
    "Received:",
    ethers.formatEther(balanceAfter - balanceBefore),
    "MYNT"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
