# Myntis Token Contracts

Solidity contracts and Hardhat tooling for the Myntis token ecosystem, including:
- Hub token (`Myntis`) and OFT spoke/hub cross-chain components
- Staking contracts (`DualPoolStaking`, `LiquidStakingVault`)
- ZK-based reward distribution (`ZKMerkleDistributor`, verifier wiring)
- Deployment, migration, and operational scripts

## Repository Scope

This repository focuses on on-chain contracts and contract-adjacent scripts.  
Application services and frontend code live in separate repositories.

## Tech Stack

- Solidity `0.8.22`
- Hardhat + TypeScript
- OpenZeppelin (upgradeable and non-upgradeable contracts)
- LayerZero OFT/OApp packages
- Optional ZK tooling (`snarkjs`, circuit artifacts in `zk-circuits/`)

## Quick Start

1. Install dependencies:

```bash
npm ci
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Compile:

```bash
npx hardhat compile
```

4. Run tests:

```bash
npx hardhat test
```

## Environment and Secrets

- Do not commit real keys or API credentials.
- `.env*` files are ignored by default (except `*.example` templates).
- Use `.env.example` as the source-of-truth template.

## Project Layout

- `contracts/`: core contracts and mocks
- `scripts/`: deployment, migration, verification, and diagnostics
- `test/`: Hardhat test suites
- `deployments/`: deployment snapshots and records
- `zk-circuits/`: circuits and related setup artifacts
- `sdk/`: proof-generation SDK utilities

## Security

- See `SECURITY.md` for vulnerability reporting.
- Audit snapshots and notes are tracked in `SECURITY_AUDIT_REPORT*.md`.

## Mainnet Freeze and Migration Records

- Frozen active/legacy core addresses: `deployments/FROZEN_MAINNET_ADDRESSES.md`
- Historical creation-block snapshots and gap model: `deployments/historical-snapshots-mainnet-core.json`
- Compensation candidate export: `deployments/compensation-candidates-mainnet.json`
- Migration plan: `deployments/compensation-migration-plan.md`
- Mainnet upgrade runbook (emissions + staking): `deployments/MAINNET_EMISSIONS_STAKING_UPGRADE_RUNBOOK.md`
- Mainnet upgrade execution tracker: `deployments/MAINNET_UPGRADE_TRACKER.md`
- Migration scope disclosure (holders migrated vs. protocol state): `deployments/MIGRATION_SCOPE_DISCLOSURE.md`
- Base Sepolia deployment artifact history: `deployments/BASE_SEPOLIA_DEPLOYMENT_HISTORY.md`

## Contributing

See `CONTRIBUTING.md` for development workflow and PR standards.

## License

MIT. See `LICENSE`.
