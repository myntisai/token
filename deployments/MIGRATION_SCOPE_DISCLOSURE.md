# Migration Scope Disclosure

This disclosure describes what was and was not migrated into the current Base mainnet deployment.

## What Was Migrated

- Holder MYNT balances (via `migrateMint` / holder snapshot workflow).

## What Was Not Fully Migrated

- Legacy staking positions and per-user reward debt state.
- Legacy emissions internal state in earlier waves (unless explicitly migrated via `initializeMigration` in that wave).
- Legacy distributor epoch internals (open/closed epochs, locked claim states) outside explicit cutover handling.
- Legacy Merkle proof/nullifier state across old distributor instances.

## Practical Meaning

- Wallet ownership was preserved.
- Historical protocol state outside wallet balances may differ between legacy and current contracts.
- Any unresolved legacy reward/accounting differences must be handled via the documented compensation process.

## Source of Truth Artifacts

- Frozen address set: `deployments/FROZEN_MAINNET_ADDRESSES.md`
- Historical snapshots: `deployments/historical-snapshots-mainnet-core.json`
- Compensation candidates: `deployments/compensation-candidates-mainnet.json`
- Compensation runbook: `deployments/compensation-migration-plan.md`
- Base Sepolia artifact timeline: `deployments/BASE_SEPOLIA_DEPLOYMENT_HISTORY.md`
