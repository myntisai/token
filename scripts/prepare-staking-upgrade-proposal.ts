import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

type Deployment = {
  dualPoolStaking: string;
  dualPoolStakingImplementation?: string;
  chainId: number;
  network: string;
};

type ProposalTx = {
  to: string;
  value: string;
  data: string;
  description: string;
};

function loadDeployment(): Deployment {
  const file = path.join(__dirname, "..", "deployments", `deployment-${network.name}-latest.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing deployment file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function asAddress(label: string, value: string | undefined): string {
  if (!value || !ethers.isAddress(value)) throw new Error(`Invalid ${label}: ${value ?? "<undefined>"}`);
  return ethers.getAddress(value);
}

function nowTag(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const deployment = loadDeployment();
  const chain = await ethers.provider.getNetwork();
  const chainId = Number(chain.chainId);
  if (chainId !== deployment.chainId) {
    throw new Error(`Chain mismatch. Provider=${chainId}, deployment=${deployment.chainId}`);
  }

  const multisig = asAddress(
    "MULTISIG/TREASURY",
    process.env.MULTISIG || process.env.TREASURY || process.env.ADMIN_MULTISIG
  );

  const [deployer] = await ethers.getSigners();
  const StakingFactory = await ethers.getContractFactory("DualPoolStaking", deployer);
  const impl = await StakingFactory.deploy();
  await impl.waitForDeployment();

  const implAddress = await impl.getAddress();
  const implDeployTx = impl.deploymentTransaction()?.hash ?? null;

  const stakingProxy = asAddress("dualPoolStaking proxy", deployment.dualPoolStaking);
  const tx: ProposalTx = {
    to: stakingProxy,
    value: "0",
    data: StakingFactory.interface.encodeFunctionData("upgradeToAndCall", [implAddress, "0x"]),
    description: "DualPoolStaking.upgradeToAndCall(newImplementation, 0x)"
  };

  const output = {
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    multisig,
    stakingProxy,
    previousImplementation: deployment.dualPoolStakingImplementation ?? null,
    newImplementation: implAddress,
    newImplementationDeploymentTx: implDeployTx,
    transactions: [tx]
  };

  const tag = nowTag();
  const outDir = path.join(__dirname, "..", "deployments");
  const jsonOut = path.join(outDir, `multisig-proposal-${network.name}-staking-upgrade-${tag}.json`);
  const mdOut = path.join(outDir, `multisig-proposal-${network.name}-staking-upgrade-${tag}.md`);

  fs.writeFileSync(jsonOut, JSON.stringify(output, null, 2) + "\n", "utf8");

  const lines: string[] = [];
  lines.push("# Staking Upgrade Multisig Proposal");
  lines.push("");
  lines.push(`- Generated: ${output.generatedAt}`);
  lines.push(`- Network: ${output.network} (${output.chainId})`);
  lines.push(`- Multisig: \`${output.multisig}\``);
  lines.push(`- Staking proxy: \`${output.stakingProxy}\``);
  lines.push(`- Previous implementation: \`${output.previousImplementation ?? "unknown"}\``);
  lines.push(`- New implementation: \`${output.newImplementation}\``);
  if (output.newImplementationDeploymentTx) {
    lines.push(`- New implementation deployment tx: \`${output.newImplementationDeploymentTx}\``);
  }
  lines.push("");
  lines.push("## Safe Transaction");
  lines.push("");
  lines.push(`1. ${tx.description}`);
  lines.push(`   - to: \`${tx.to}\``);
  lines.push(`   - value: \`${tx.value}\``);
  lines.push(`   - data: \`${tx.data}\``);
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This upgrade is intended to enforce restricted third-party harvest behavior.");
  lines.push("- Execution requires multisig threshold signatures.");

  fs.writeFileSync(mdOut, lines.join("\n") + "\n", "utf8");

  console.log(`New implementation deployed: ${implAddress}`);
  if (implDeployTx) console.log(`Deployment tx: ${implDeployTx}`);
  console.log(`Wrote ${jsonOut}`);
  console.log(`Wrote ${mdOut}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
