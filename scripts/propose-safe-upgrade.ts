import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type ProposalTx = {
  to: string;
  value: string;
  data: string;
  description?: string;
};

type ProposalFile = {
  chainId?: number;
  multisig?: string;
  transactions: ProposalTx[];
};

type ProposedResult = {
  index: number;
  description: string;
  nonce: number;
  safeTxHash: string;
  to: string;
  status: "proposed" | "exists";
  responseStatus: number;
  responseBody: any;
};

const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)"
];

function getServiceUrl(chainId: number): string {
  const explicit = process.env.SAFE_TX_SERVICE_URL;
  if (explicit && explicit.trim().length > 0) return explicit.trim().replace(/\/$/, "");
  const map: Record<number, string> = {
    1: "https://safe-transaction-mainnet.safe.global",
    10: "https://safe-transaction-optimism.safe.global",
    100: "https://safe-transaction-gnosis-chain.safe.global",
    137: "https://safe-transaction-polygon.safe.global",
    42161: "https://safe-transaction-arbitrum.safe.global",
    43114: "https://safe-transaction-avalanche.safe.global",
    8453: "https://safe-transaction-base.safe.global",
    11155111: "https://safe-transaction-sepolia.safe.global",
    84532: "https://safe-transaction-sepolia.safe.global"
  };
  const url = map[chainId];
  if (!url) {
    throw new Error(`No default Safe Transaction Service URL for chainId ${chainId}. Set SAFE_TX_SERVICE_URL.`);
  }
  return url;
}

function resolveProposalFile(): string {
  const explicit = process.env.PROPOSAL_FILE;
  if (explicit && explicit.trim().length > 0) {
    return path.isAbsolute(explicit) ? explicit : path.join(__dirname, "..", explicit);
  }
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^multisig-proposal-.*-emissions-upgrade-.*\.json$/.test(f))
    .sort();
  if (files.length === 0) throw new Error("No multisig proposal JSON found in deployments/");
  return path.join(dir, files[files.length - 1]);
}

function asAddress(label: string, value: string): string {
  if (!ethers.isAddress(value)) throw new Error(`Invalid ${label}: ${value}`);
  return ethers.getAddress(value);
}

async function postProposal(
  serviceUrl: string,
  safeAddress: string,
  payload: any
): Promise<{ status: number; body: any }> {
  const url = `${serviceUrl}/api/v1/safes/${safeAddress}/multisig-transactions/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw body
  }
  return { status: res.status, body };
}

function parseMaybeNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const chain = await ethers.provider.getNetwork();
  const chainId = Number(chain.chainId);

  const proposalPath = resolveProposalFile();
  const proposal: ProposalFile = JSON.parse(fs.readFileSync(proposalPath, "utf8"));

  if (!Array.isArray(proposal.transactions) || proposal.transactions.length === 0) {
    throw new Error("Proposal has no transactions");
  }

  const safeAddress = asAddress(
    "SAFE address",
    process.env.SAFE_ADDRESS || process.env.MULTISIG || proposal.multisig || ""
  );

  const serviceUrl = getServiceUrl(chainId);
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);

  const rawPk = (process.env.PRIVATE_KEY || "").trim();
  const normalizedPk = rawPk ? (rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`) : "";
  const signingWallet = normalizedPk ? new ethers.Wallet(normalizedPk, ethers.provider) : null;
  const senderAddress = signingWallet ? signingWallet.address : signer.address;

  const liveNonce = Number(await safe.nonce());
  const requestedNonce = parseMaybeNumber(process.env.START_NONCE);
  const startNonce = requestedNonce ?? liveNonce;
  const origin = process.env.SAFE_ORIGIN || `myntis-${network.name}-upgrade`;
  const dryRun = (process.env.DRY_RUN || "").toLowerCase() === "true";

  const results: ProposedResult[] = [];

  console.log(`Network: ${network.name} (${chainId})`);
  console.log(`Signer: ${signer.address}`);
  console.log(`Sender used for proposal signature: ${senderAddress}`);
  console.log(`Safe: ${safeAddress}`);
  console.log(`Service: ${serviceUrl}`);
  console.log(`Proposal file: ${proposalPath}`);
  console.log(`Safe nonce on-chain: ${liveNonce}`);
  console.log(`Start nonce used: ${startNonce}`);
  console.log(`Dry run: ${dryRun}`);

  for (let i = 0; i < proposal.transactions.length; i++) {
    const tx = proposal.transactions[i];
    const nonce = startNonce + i;
    const to = asAddress(`tx[${i}].to`, tx.to);
    const value = tx.value ?? "0";
    const data = tx.data ?? "0x";
    const description = tx.description || `tx-${i + 1}`;

    const safeTxHash: string = await safe.getTransactionHash(
      to,
      value,
      data,
      0, // operation: CALL
      0, // safeTxGas
      0, // baseGas
      0, // gasPrice
      ethers.ZeroAddress, // gasToken
      ethers.ZeroAddress, // refundReceiver
      nonce
    );

    let signature: string;
    if (signingWallet) {
      const sig = signingWallet.signingKey.sign(safeTxHash);
      signature = ethers.Signature.from(sig).serialized;
    } else {
      // Safe accepts eth_sign style signatures when v is adjusted to 31/32.
      const msgSig = await signer.signMessage(ethers.getBytes(safeTxHash));
      const parsed = ethers.Signature.from(msgSig);
      const adjustedV = parsed.v + 4;
      signature = ethers.Signature.from({
        r: parsed.r,
        s: parsed.s,
        v: adjustedV
      }).serialized;
    }

    const payload = {
      to,
      value: String(value),
      data,
      operation: 0,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: "0",
      gasToken: ethers.ZeroAddress,
      refundReceiver: ethers.ZeroAddress,
      nonce,
      contractTransactionHash: safeTxHash,
      sender: senderAddress,
      signature,
      origin
    };

    if (dryRun) {
      results.push({
        index: i + 1,
        description,
        nonce,
        safeTxHash,
        to,
        status: "proposed",
        responseStatus: 0,
        responseBody: payload
      });
      console.log(`[DRY] #${i + 1} nonce=${nonce} safeTxHash=${safeTxHash} ${description}`);
      continue;
    }

    const { status, body } = await postProposal(serviceUrl, safeAddress, payload);
    let parsedStatus: "proposed" | "exists" = "proposed";
    if (status >= 200 && status < 300) {
      parsedStatus = "proposed";
    } else if (status === 409) {
      parsedStatus = "exists";
    } else {
      throw new Error(`Failed proposing tx #${i + 1} (${description}) status=${status} body=${JSON.stringify(body)}`);
    }

    results.push({
      index: i + 1,
      description,
      nonce,
      safeTxHash,
      to,
      status: parsedStatus,
      responseStatus: status,
      responseBody: body
    });

    console.log(`#${i + 1} nonce=${nonce} safeTxHash=${safeTxHash} status=${parsedStatus}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    safeAddress,
    serviceUrl,
    proposalFile: path.relative(path.join(__dirname, ".."), proposalPath),
    startNonce,
    results
  };

  const outFile = path.join(
    __dirname,
    "..",
    "deployments",
    `safe-proposal-submit-${network.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
