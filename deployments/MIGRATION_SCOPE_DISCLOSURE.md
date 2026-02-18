# Migration Scope Disclosure

This disclosure defines what was and was not migrated into the current Base mainnet deployment.

## What Was Migrated

- Holder MYNT balances via `migrateMint` migration flow.
- Snapshot source:
  - `migrations/base-sepolia-holders-snapshot-37378124.json`
  - Recipients: `92`
  - Snapshot total: `21,760,243.737607178686863132 MYNT`
- Mainnet `BalanceMigrated` aggregate:
  - `21,943,112.600276063920356146 MYNT`
  - Snapshot delta: `+182,868.862668885233493014 MYNT` (follow-up top-up corrections)

Migration tx sequence:

- `0xbef2847a5c3100c92e8b841626064c62a9a8c19cdb92580bf247baa5828c37f7` (primary 92-recipient migration batch)
- `0x4ec6c454dba249c6633b32f062767ab81f412b17e3be488095cf1b70a3442007` (top-up correction)
- `0xebda138f7f4ef092fbd7b0c5fcc33cb4dae89d0cdf62fc8ca982a1d3207d1a91` (top-up correction)

`MigrationCompleted` event note:

- `0x4dabbb9690fef9c860bf00e035b3a83e9b6d61537078c4c3662fde47b4fd2368`
- `totalMigrated = 23,059,132.387186261789306346 MYNT`
- This is `+1,116,019.7869101978689502 MYNT` above aggregate `BalanceMigrated`, meaning the completion total includes accounting beyond direct holder migration event totals.

## What Was Not Fully Migrated

- Legacy staking positions and per-user reward debt state.
- Legacy emissions internal state in earlier waves (unless explicitly migrated via `initializeMigration` in that wave).
- Legacy distributor epoch internals (open/closed epochs, locked claim states) outside explicit cutover handling.
- Legacy Merkle proof/nullifier state across old distributor instances.
- Protocol-internal token accounting for staking/distributor contracts as systems (unless explicitly represented as direct snapshot holder balances).

## Practical Meaning

- Wallet ownership and migrated holder balances were preserved.
- Full historical protocol internals were not replayed 1:1.
- Any unresolved legacy accounting differences are handled through explicit remediation/compensation workflows.
- A contract address appearing in the holder snapshot should be interpreted as a plain balance copy, not state migration of that contract system.

## Source Of Truth Artifacts

- `deployments/FROZEN_MAINNET_ADDRESSES.md`
- `deployments/historical-snapshots-mainnet-core.json`
- `deployments/forensic-migration-transfer-analysis.json`
- `deployments/forensic-mainnet-migration-reconciliation.json`
- `deployments/compensation-candidates-mainnet.json`
- `deployments/compensation-migration-plan.md`
- `docs/deployment/MIGRATION_AND_ACCOUNTING_STORY.md`
