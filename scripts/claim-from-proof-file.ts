import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(
  __dirname,
  "..",
  "deployments",
  "deployment-base-sepolia-latest.json"
);

type ProofFile = {
  merkle_root: string;
  merkle_proofs: Record<string, string[]>;
};

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const distributorAddr = deployment.zkMerkleDistributor as string;
  const tokenAddr = deployment.myntis as string;

  const proofFile =
    process.env.ZK_PROOF_FILE || path.join(__dirname, "..", "scripts", "test-zk-proof.json");
  const claimAmount = process.env.CLAIM_AMOUNT
    ? ethers.parseEther(process.env.CLAIM_AMOUNT)
    : ethers.parseEther("10");

  const [rawSigner] = await ethers.getSigners();
  const signer = new ethers.NonceManager(rawSigner);
  const signerAddress = await rawSigner.getAddress();
  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(80));
  console.log("CLAIM FROM PROOF FILE");
  console.log("=".repeat(80));
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Signer:", signerAddress);
  console.log("Distributor:", distributorAddr);
  console.log("Token:", tokenAddr);
  console.log("Proof file:", proofFile);

  if (!fs.existsSync(proofFile)) {
    throw new Error(`Proof file not found: ${proofFile}`);
  }

  const proofData = JSON.parse(fs.readFileSync(proofFile, "utf8")) as ProofFile;
  if (!proofData.merkle_root || !proofData.merkle_proofs) {
    throw new Error("Proof file missing merkle_root or merkle_proofs");
  }

  const merkleProof = proofData.merkle_proofs[signerAddress];
  if (!merkleProof || merkleProof.length === 0) {
    throw new Error("No merkle proof found for signer in proof file");
  }

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

  console.log("On-chain root:", onchainRoot);
  console.log("Proof file root:", proofData.merkle_root);

  if (String(onchainRoot).toLowerCase() !== proofData.merkle_root.toLowerCase()) {
    throw new Error("On-chain root does not match proof file root.");
  }

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
