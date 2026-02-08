import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const BASE_DEPLOYMENT = path.join(
  __dirname,
  "..",
  "deployments",
  "deployment-base-sepolia-latest.json"
);

type ProofData = {
  proof: {
    a: string[];
    b: string[][];
    c: string[];
  };
  public_signals: string[];
};

async function main() {
  const deployment = JSON.parse(fs.readFileSync(BASE_DEPLOYMENT, "utf8"));
  const useEnv = process.env.USE_ENV === "1";
  const tokenAddr = (useEnv && process.env.MYNTIS_TOKEN_ADDRESS
    ? process.env.MYNTIS_TOKEN_ADDRESS
    : deployment.myntis) as string;
  const distributorAddr = (useEnv && process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS
    ? process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS
    : deployment.zkMerkleDistributor) as string;

  const [rawSigner, fallbackUser] = await ethers.getSigners();
  const signer = new ethers.NonceManager(rawSigner);
  const signerAddress = await rawSigner.getAddress();
  const testUser = fallbackUser ?? rawSigner;

  const network = await ethers.provider.getNetwork();

  console.log("=".repeat(80));
  console.log("TEST ZK DISTRIBUTOR (LATEST)");
  console.log("=".repeat(80));
  console.log("Network:", network.name, `(chainId: ${network.chainId})`);
  console.log("Signer:", signerAddress);
  console.log("Test user:", testUser.address);
  console.log("Token:", tokenAddr);
  console.log("Distributor:", distributorAddr);

  const token = await ethers.getContractAt("Myntis", tokenAddr, signer);
  const distributor = await ethers.getContractAt(
    "ZKMerkleDistributor",
    distributorAddr,
    signer
  );

  const providerRole = await distributor.PROVIDER_ROLE();
  const hasRole = await distributor.hasRole(providerRole, signerAddress);
  if (!hasRole) {
    if (process.env.AUTO_GRANT_ROLE === "1") {
      const grantTx = await distributor.grantRole(providerRole, signerAddress);
      console.log("grantRole tx:", grantTx.hash);
      await grantTx.wait();
      console.log("✅ PROVIDER_ROLE granted");
    } else {
      throw new Error(
        "Signer is missing PROVIDER_ROLE. Re-run with AUTO_GRANT_ROLE=1 to grant."
      );
    }
  }

  const claimAmounts = [
    ethers.parseEther("10"),
    ethers.parseEther("20"),
    ethers.parseEther("30"),
  ];
  let totalAmount = claimAmounts.reduce((sum, amt) => sum + amt, 0n);

  let providerBalance = await distributor.getProviderBalance(signerAddress);
  if (providerBalance < totalAmount) {
    const missing = totalAmount - providerBalance;
    if (process.env.AUTO_FUND === "1") {
      console.log(
        "Funding provider balance with",
        ethers.formatEther(missing),
        "MYNT"
      );
      const approveTx = await token.approve(distributorAddr, missing);
      console.log("approve tx:", approveTx.hash);
      await approveTx.wait();
      const depositTx = await distributor.depositBalance(missing);
      console.log("depositBalance tx:", depositTx.hash);
      await depositTx.wait();
      providerBalance = await distributor.getProviderBalance(signerAddress);
    } else {
      throw new Error(
        `Provider balance (${ethers.formatEther(
          providerBalance
        )}) < totalAmount (${ethers.formatEther(
          totalAmount
        )}). Re-run with AUTO_FUND=1 to top up.`
      );
    }
  }

  console.log("Provider balance:", ethers.formatEther(providerBalance), "MYNT");

  const users = [
    testUser.address,
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
  const hashFn = (data: Buffer) =>
    Buffer.from(ethers.getBytes(ethers.keccak256(data)));
  const leafBuffers = leaves.map((l) => Buffer.from(l.slice(2), "hex"));
  const merkleTree = new MerkleTree(leafBuffers, hashFn, {
    sortPairs: false,
  });
  let merkleRoot = merkleTree.getHexRoot();

  console.log("Merkle root:", merkleRoot);

  const expiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const proofFile =
    process.env.ZK_PROOF_FILE || path.join(__dirname, "..", "test-zk-proof.json");
  let proofA: bigint[] = [0n, 0n];
  let proofB: bigint[][] = [
    [0n, 0n],
    [0n, 0n],
  ];
  let proofC: bigint[] = [0n, 0n];
  let publicInputs: bigint[] = [BigInt(merkleRoot), totalAmount, 0n];
  let usingRealProof = false;

  if (fs.existsSync(proofFile)) {
    const data = JSON.parse(fs.readFileSync(proofFile, "utf8")) as ProofData;
    if (data.proof && data.public_signals) {
      proofA = data.proof.a.map((v) => BigInt(v));
      proofB = [
        [BigInt(data.proof.b[0][0]), BigInt(data.proof.b[0][1])],
        [BigInt(data.proof.b[1][0]), BigInt(data.proof.b[1][1])],
      ];
      proofC = data.proof.c.map((v) => BigInt(v));
      publicInputs = data.public_signals.map((v) => BigInt(v));
      usingRealProof = true;
      if (publicInputs.length > 1) {
        totalAmount = publicInputs[1];
      }
      if ((data as any).merkle_root) {
        merkleRoot = (data as any).merkle_root as string;
      }
    }
  }

  const submitOnchain = process.env.SUBMIT_ONCHAIN === "1";

  if (!usingRealProof && submitOnchain && process.env.ALLOW_MOCK_SUBMIT !== "1") {
    throw new Error(
      "Mock proof loaded. Set ALLOW_MOCK_SUBMIT=1 to send a reverting tx, or provide ZK_PROOF_FILE."
    );
  }

  if (submitOnchain) {
    console.log("Submitting Merkle root on-chain...");
    const submitTx = await distributor.submitMerkleRoot(
      merkleRoot,
      expiry,
      totalAmount,
      proofA,
      proofB,
      proofC,
      publicInputs
    );
    console.log("submitMerkleRoot tx:", submitTx.hash);
    await submitTx.wait();
    console.log("✅ Submitted");
  } else {
    console.log("Running staticCall (no tx)...");
    try {
      await distributor.submitMerkleRoot.staticCall(
        merkleRoot,
        expiry,
        totalAmount,
        proofA,
        proofB,
        proofC,
        publicInputs
      );
      console.log("✅ staticCall passed");
    } catch (err: any) {
      console.log("❌ staticCall reverted (expected with mock proof):", err.message);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
