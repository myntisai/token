import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Deployment = {
  dualPoolStaking: string;
  chainId: number;
  deployer?: string;
};

type ProposalTx = {
  to: string;
  value: string;
  data: string;
  description: string;
};

function asAddress(label: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Invalid ${label}: ${value ?? "<undefined>"}`);
  }
  return ethers.getAddress(value);
}

function nowTag(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function loadDeployment(): Deployment {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function splitAddrs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((a) => asAddress("FIX_ACCOUNTS entry", a));
}

async function main() {
  const deployment = loadDeployment();
  const networkInfo = await ethers.provider.getNetwork();
  const chainId = Number(networkInfo.chainId);
  if (chainId !== deployment.chainId) {
    throw new Error(`Chain mismatch: provider=${chainId} deploymentFile=${deployment.chainId}`);
  }

  const multisig = asAddress("MULTISIG", process.env.MULTISIG || process.env.SAFE || process.env.TREASURY);
  const newImpl = asAddress("NEW_STAKING_IMPLEMENTATION", process.env.NEW_STAKING_IMPLEMENTATION);

  const stakingProxy = asAddress("dualPoolStaking", deployment.dualPoolStaking);
  const staking = await ethers.getContractAt("DualPoolStaking", stakingProxy);

  const fixAccounts = splitAddrs(process.env.FIX_ACCOUNTS);
  if (fixAccounts.length === 0) {
    throw new Error(
      "No accounts provided. Set FIX_ACCOUNTS=0x...,0x... (must include the LiquidStakingVault and any staker/provider addresses)."
    );
  }

  const fixCall = staking.interface.encodeFunctionData("reinitializeV5MasterchefFix", [fixAccounts]);
  const upgradeCall = staking.interface.encodeFunctionData("upgradeToAndCall", [newImpl, fixCall]);

  const txs: ProposalTx[] = [
    {
      to: stakingProxy,
      value: "0",
      data: upgradeCall,
      description: `DualPoolStaking.upgradeToAndCall(newImpl, reinitializeV5MasterchefFix(${fixAccounts.length} accounts))`
    }
  ];

  const proposal = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    multisig,
    stakingProxy,
    newImplementation: newImpl,
    fixAccounts,
    transactions: txs,
    notes: [
      "This upgrade changes syncEmissions() to MasterChef-correct delta syncing using EmissionsContract.mintedEmissions().",
      "The reinitializer writes down pendingTreasuryWithdrawal (drift bucket) and rebaselines rewardDebt for the listed accounts.",
      "This sets pending rewards for the listed accounts to ~0 at execution time.",
      "If you plan to compensate historical rewards from a broken epoch, do it separately (Merkle/manual) and document it."
    ]
  };

  const outDir = path.join(__dirname, "..", "deployments");
  const tag = nowTag();
  const jsonOut = path.join(outDir, `multisig-proposal-${network.name}-staking-masterchef-fix-${tag}.json`);
  const mdOut = path.join(outDir, `multisig-proposal-${network.name}-staking-masterchef-fix-${tag}.md`);

  fs.writeFileSync(jsonOut, JSON.stringify(proposal, null, 2) + "\n", "utf8");

  const mdLines: string[] = [];
  mdLines.push("# DualPoolStaking MasterChef Delta-Sync Fix Proposal");
  mdLines.push("");
  mdLines.push(`- Generated: ${proposal.generatedAt}`);
  mdLines.push(`- Network: ${proposal.network} (${proposal.chainId})`);
  mdLines.push(`- Multisig: \`${proposal.multisig}\``);
  mdLines.push(`- Staking proxy: \`${proposal.stakingProxy}\``);
  mdLines.push(`- New implementation: \`${proposal.newImplementation}\``);
  mdLines.push("");
  mdLines.push("## Fix Accounts");
  mdLines.push("");
  proposal.fixAccounts.forEach((a: string) => mdLines.push(`- \`${a}\``));
  mdLines.push("");
  mdLines.push("## Safe Transaction");
  mdLines.push("");
  proposal.transactions.forEach((tx: ProposalTx, idx: number) => {
    mdLines.push(`${idx + 1}. ${tx.description}`);
    mdLines.push(`   - to: \`${tx.to}\``);
    mdLines.push(`   - value: \`${tx.value}\``);
    mdLines.push(`   - data: \`${tx.data}\``);
  });
  mdLines.push("");
  mdLines.push("## Notes");
  mdLines.push("");
  proposal.notes.forEach((n: string) => mdLines.push(`- ${n}`));

  fs.writeFileSync(mdOut, mdLines.join("\n") + "\n", "utf8");

  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${mdOut}`);
  console.log(`Transactions: ${proposal.transactions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

