import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Deployment = {
  myntis: string;
  emissionsContract: string;
  dualPoolStaking: string;
  dualPoolStakingImplementation?: string;
  network: string;
  chainId: number;
  timestamp: string;
};

type ProposalTx = {
  to: string;
  value: string;
  data: string;
  description: string;
};

type ProviderDebtEntry = {
  provider: string;
  debt: bigint;
};

function boolEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function loadDeployment(): Deployment {
  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Missing deployment file: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function asAddress(label: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`Invalid ${label}: ${value ?? "<undefined>"}`);
  }
  return ethers.getAddress(value);
}

function parseProviderDebts(filePath: string): ProviderDebtEntry[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const rows: Array<{ provider: string; debt: bigint }> = [];

  if (Array.isArray(raw)) {
    for (const row of raw) {
      const provider = row.provider ?? row.address;
      const debt = row.debt ?? row.rewardDebt ?? row.amount;
      if (!provider) continue;
      rows.push({
        provider: asAddress("provider", provider),
        debt: BigInt(debt ?? 0)
      });
    }
  } else if (Array.isArray(raw.providers) && Array.isArray(raw.debts)) {
    if (raw.providers.length !== raw.debts.length) {
      throw new Error("Provider debt file has mismatched providers/debts length");
    }
    for (let i = 0; i < raw.providers.length; i++) {
      rows.push({
        provider: asAddress("provider", raw.providers[i]),
        debt: BigInt(raw.debts[i] ?? 0)
      });
    }
  } else {
    throw new Error(
      "Provider debt file must be either an array of {provider,debt} rows or {providers:[], debts:[]}"
    );
  }

  return rows;
}

function nowTag(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const deployment = loadDeployment();
  const networkInfo = await ethers.provider.getNetwork();
  const chainId = Number(networkInfo.chainId);

  const multisig = asAddress(
    "MULTISIG/TREASURY",
    process.env.MULTISIG || process.env.TREASURY || process.env.ADMIN_MULTISIG
  );

  if (chainId !== deployment.chainId) {
    throw new Error(
      `Chain mismatch: provider=${chainId} deploymentFile=${deployment.chainId}. Check --network and RPC settings.`
    );
  }

  const deployNewEmissions = boolEnv("DEPLOY_NEW_EMISSIONS", false);
  const requestedNewEmissions = process.env.NEW_EMISSIONS_ADDRESS;

  let newEmissionsAddress = requestedNewEmissions ? asAddress("NEW_EMISSIONS_ADDRESS", requestedNewEmissions) : "";
  let deploymentTxHash: string | null = null;

  if (!newEmissionsAddress && !deployNewEmissions) {
    throw new Error("Set NEW_EMISSIONS_ADDRESS or enable DEPLOY_NEW_EMISSIONS=true");
  }

  if (!newEmissionsAddress && deployNewEmissions) {
    const [deployer] = await ethers.getSigners();
    if (!deployer) {
      throw new Error("No signer available for DEPLOY_NEW_EMISSIONS flow");
    }

    const factory = await ethers.getContractFactory("EmissionsContract", deployer);
    const deployed = await factory.deploy(
      deployment.myntis,
      deployment.dualPoolStaking,
      multisig
    );
    await deployed.waitForDeployment();

    newEmissionsAddress = await deployed.getAddress();
    deploymentTxHash = deployed.deploymentTransaction()?.hash ?? null;
    console.log(`Deployed new EmissionsContract: ${newEmissionsAddress}`);
    if (deploymentTxHash) {
      console.log(`Deployment tx: ${deploymentTxHash}`);
    }
  }

  const oldEmissionsAddress = asAddress("old emissions", deployment.emissionsContract);
  newEmissionsAddress = asAddress("new emissions", newEmissionsAddress);

  const oldEmissions = await ethers.getContractAt("EmissionsContract", oldEmissionsAddress);
  const newEmissions = await ethers.getContractAt("EmissionsContract", newEmissionsAddress);
  const staking = await ethers.getContractAt("DualPoolStaking", deployment.dualPoolStaking);
  const token = await ethers.getContractAt("Myntis", deployment.myntis);

  const [
    oldMinted,
    oldAccounted,
    oldAccReward,
    oldStartTime,
    oldLastRewardTime
  ] = await Promise.all([
    oldEmissions.mintedEmissions(),
    oldEmissions.accountedEmissions(),
    oldEmissions.accRewardPerShare(),
    oldEmissions.startTime(),
    oldEmissions.lastRewardTime()
  ]);

  const maxBatch = Number(await newEmissions.MAX_MIGRATION_BATCH());

  let providerRows: ProviderDebtEntry[] = [];
  const debtFile = process.env.MIGRATION_PROVIDER_DEBT_FILE;
  if (debtFile) {
    const fullPath = path.isAbsolute(debtFile) ? debtFile : path.join(__dirname, "..", debtFile);
    providerRows = parseProviderDebts(fullPath);
  }

  if (providerRows.length > maxBatch) {
    throw new Error(
      `Provider debt list exceeds MAX_MIGRATION_BATCH (${providerRows.length} > ${maxBatch}). ` +
      "Use batchInitializeProviderDebt in follow-up transactions."
    );
  }

  const providers = providerRows.map((x) => x.provider);
  const debts = providerRows.map((x) => x.debt);

  const minterRole = await token.MINTER_ROLE();
  const oldHasMinter = await token.hasRole(minterRole, oldEmissionsAddress);
  const newHasMinter = await token.hasRole(minterRole, newEmissionsAddress);

  const txs: ProposalTx[] = [];
  const pushTx = (to: string, data: string, description: string) => {
    txs.push({ to, value: "0", data, description });
  };

  const newStaking = await newEmissions.stakingContract();
  if (newStaking.toLowerCase() !== deployment.dualPoolStaking.toLowerCase()) {
    pushTx(
      newEmissionsAddress,
      newEmissions.interface.encodeFunctionData("setStakingContract", [deployment.dualPoolStaking]),
      "Emissions.setStakingContract(newStaking)"
    );
  }

  const newStakingImpl = process.env.NEW_STAKING_IMPLEMENTATION;
  const stakingUpgradeCalldata = process.env.STAKING_UPGRADE_CALLDATA || "0x";
  if (newStakingImpl && newStakingImpl.trim().length > 0) {
    const impl = asAddress("NEW_STAKING_IMPLEMENTATION", newStakingImpl);
    pushTx(
      deployment.dualPoolStaking,
      staking.interface.encodeFunctionData("upgradeToAndCall", [impl, stakingUpgradeCalldata]),
      "DualPoolStaking.upgradeToAndCall(newImplementation, data)"
    );
  }

  if (!newHasMinter) {
    pushTx(
      deployment.myntis,
      token.interface.encodeFunctionData("grantRole", [minterRole, newEmissionsAddress]),
      "Myntis.grantRole(MINTER_ROLE, newEmissions)"
    );
  }

  const migrationInitialized = await newEmissions.migrationInitialized();
  if (!migrationInitialized) {
    pushTx(
      newEmissionsAddress,
      newEmissions.interface.encodeFunctionData("initializeMigration", [
        oldMinted,
        oldAccounted,
        oldAccReward,
        oldStartTime,
        oldLastRewardTime,
        providers,
        debts
      ]),
      "Emissions.initializeMigration(snapshotFromOldEmissions)"
    );
  }

  const currentStakingEmissions = await staking.emissionsContract();
  if (currentStakingEmissions.toLowerCase() !== newEmissionsAddress.toLowerCase()) {
    pushTx(
      deployment.dualPoolStaking,
      staking.interface.encodeFunctionData("setEmissionsContract", [newEmissionsAddress]),
      "DualPoolStaking.setEmissionsContract(newEmissions)"
    );
  }

  if (oldHasMinter && oldEmissionsAddress.toLowerCase() !== newEmissionsAddress.toLowerCase()) {
    pushTx(
      deployment.myntis,
      token.interface.encodeFunctionData("revokeRole", [minterRole, oldEmissionsAddress]),
      "Myntis.revokeRole(MINTER_ROLE, oldEmissions)"
    );
  }

  const proposal = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    multisig,
    deployment,
    oldEmissionsAddress,
    newEmissionsAddress,
    deployedNewEmissionsTx: deploymentTxHash,
    migrationSnapshot: {
      mintedEmissions: oldMinted.toString(),
      accountedEmissions: oldAccounted.toString(),
      accRewardPerShare: oldAccReward.toString(),
      startTime: oldStartTime.toString(),
      lastRewardTime: oldLastRewardTime.toString(),
      providerDebtCount: providers.length
    },
    notes: [
      "Run this script immediately before creating the Safe proposal to reduce state drift.",
      "If old emissions can still be harvested before cutover, regenerate proposal data at execution time.",
      "Provider debt arrays can be empty when DualPoolStaking remains the canonical pending-reward source."
    ],
    transactions: txs
  };

  const outDir = path.join(__dirname, "..", "deployments");
  const tag = nowTag();
  const jsonOut = path.join(outDir, `multisig-proposal-${network.name}-emissions-upgrade-${tag}.json`);
  const mdOut = path.join(outDir, `multisig-proposal-${network.name}-emissions-upgrade-${tag}.md`);

  fs.writeFileSync(jsonOut, JSON.stringify(proposal, null, 2) + "\n", "utf8");

  const mdLines: string[] = [];
  mdLines.push("# Emissions/Staking Upgrade Multisig Proposal");
  mdLines.push("");
  mdLines.push(`- Generated: ${proposal.generatedAt}`);
  mdLines.push(`- Network: ${proposal.network} (${proposal.chainId})`);
  mdLines.push(`- Multisig: \`${proposal.multisig}\``);
  mdLines.push(`- Old emissions: \`${proposal.oldEmissionsAddress}\``);
  mdLines.push(`- New emissions: \`${proposal.newEmissionsAddress}\``);
  if (proposal.deployedNewEmissionsTx) {
    mdLines.push(`- New emissions deployment tx: \`${proposal.deployedNewEmissionsTx}\``);
  }
  mdLines.push("");
  mdLines.push("## Migration Snapshot");
  mdLines.push("");
  mdLines.push(`- mintedEmissions: \`${proposal.migrationSnapshot.mintedEmissions}\``);
  mdLines.push(`- accountedEmissions: \`${proposal.migrationSnapshot.accountedEmissions}\``);
  mdLines.push(`- accRewardPerShare: \`${proposal.migrationSnapshot.accRewardPerShare}\``);
  mdLines.push(`- startTime: \`${proposal.migrationSnapshot.startTime}\``);
  mdLines.push(`- lastRewardTime: \`${proposal.migrationSnapshot.lastRewardTime}\``);
  mdLines.push(`- providerDebtCount: \`${proposal.migrationSnapshot.providerDebtCount}\``);
  mdLines.push("");
  mdLines.push("## Safe Transaction Order");
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
