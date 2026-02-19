# Migration And Accounting Story (Mainnet)

**Last Updated:** February 18, 2026  
**Audience:** integrators, auditors, contributors.

## Executive Summary

- Mainnet launch used a **holder balance migration + minting cutover**, not full protocol-state replay.
- Holder balances were migrated to Base mainnet for all `92` snapshot recipients.
- Additional top-up mints were executed after the first migration batch.
- Legacy staking/emissions/distributor internals were not fully migrated, which explains state/accounting differences.

## What Was Migrated

- Holder balances via `Myntis.migrateMint(...)` on Base mainnet.
- Base Sepolia holder snapshot used as migration baseline:
  - Snapshot file: `migrations/base-sepolia-holders-snapshot-37378124.json`
  - Recipients: `92`
  - Snapshot total: `21,760,243.737607178686863132 MYNT`

Important boundary:

- Migration copied holder balances, not protocol internals.
- If a protocol contract address appeared in the snapshot list, it was treated as a plain balance recipient only.
- That does **not** imply migration of staking/distributor internal accounting state.

## On-Chain Reconciliation (Exact)

### BalanceMigrated Totals

- Aggregate `BalanceMigrated` total on mainnet token `0x7629...`:
  - `21,943,112.600276063920356146 MYNT`
- Delta vs snapshot total:
  - `+182,868.862668885233493014 MYNT`

### Recipient-Level Match

- Snapshot recipients: `92`
- Migrated recipients: `92`
- Exact matches: `88`
- Top-ups above snapshot: `4`
- Shortfalls: `0`
- Missing recipients: `0`

Top-up recipients:

- `0xaCbe177685b442886c779F89132b85e05eCEf86D` `+67,859.169549194014965088 MYNT`
- `0x6255cFEC19A346A5b0Add66eF44F7C5740c12377` `+47,850.529261476019437626 MYNT`
- `0x807833243F1AAFD29e1B9acDB4D796987D0aa934` `+46,941.7932341749490903 MYNT`
- `0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3` `+20,217.37062404025 MYNT`

### Migration Batch Transactions

- `0xbef2847a5c3100c92e8b841626064c62a9a8c19cdb92580bf247baa5828c37f7`
  - Block `41868299` (`2026-02-08T04:45:45Z`)
  - `92` recipients
  - `21,760,243.737607178686863132 MYNT`
- `0x4ec6c454dba249c6633b32f062767ab81f412b17e3be488095cf1b70a3442007`
  - Block `41892275` (`2026-02-08T18:04:57Z`)
  - `4` recipients
  - `146,088.7557077016 MYNT`
- `0xebda138f7f4ef092fbd7b0c5fcc33cb4dae89d0cdf62fc8ca982a1d3207d1a91`
  - Block `41893247` (`2026-02-08T18:37:21Z`)
  - `2` recipients
  - `36,780.106961183633493014 MYNT`

### MigrationCompleted Difference

- `MigrationCompleted` tx:
  - `0x4dabbb9690fef9c860bf00e035b3a83e9b6d61537078c4c3662fde47b4fd2368`
  - Block `42071313` (`2026-02-12T21:32:53Z`)
  - `totalMigrated = 23,059,132.387186261789306346 MYNT`
- Difference vs aggregate `BalanceMigrated`:
  - `+1,116,019.7869101978689502 MYNT`

Interpretation: `MigrationCompleted.totalMigrated` includes accounting beyond direct holder migration event totals.

## One-Time Baseline Distribution Context

Snapshot distribution supports a broad one-time baseline allocation pattern:

- Minimum recipient amount: `42,511.120608909011494252 MYNT`
- Median: `52,975.567728180226364199 MYNT`
- Recipients in `40k-50k` band: `40`
- Floor calculation: `42,511.120608909011494252 * 92 = 3,911,023.096019629057471184 MYNT`

This aligns with the historical operator explanation that a large stuck-balance bucket was redistributed across holders as a one-time migration baseline.

## Why Accounting Diverged

The migration intentionally preserved holder balances, but **not** full legacy protocol internals.
As a result, accounting carryover was incomplete across:

- Legacy staking position internals and per-user reward debt
- Legacy emissions internal state (except explicit wave migration steps)
- Legacy distributor epoch internals and nullifier/proof state

These boundaries are the root reason post-cutover accounting remediation runbooks were required.

## What Was Not Fully Migrated

Canonical list is maintained in `deployments/MIGRATION_SCOPE_DISCLOSURE.md`.

## Evidence Files

- `deployments/forensic-migration-transfer-analysis.json`
- `deployments/forensic-mainnet-migration-reconciliation.json`
- `deployments/MIGRATION_SCOPE_DISCLOSURE.md`
- `deployments/historical-snapshots-mainnet-core.json`
- `migrations/base-sepolia-holders-snapshot-37378124.json`
