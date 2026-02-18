# Mainnet Emissions + Staking Upgrade Runbook

This runbook is for Base Mainnet (`chainId=8453`) and assumes governance is on multisig.

## Current Frozen Addresses

- Myntis token: `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
- Current emissions: `0x803f9694bE31D3ACe5792C21ab9F72b69838C0e0`
- Current staking proxy: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`

## Goal

Upgrade emissions logic and optionally staking implementation, while preserving emissions state:

- `startTime`
- `lastRewardTime`
- `mintedEmissions`
- `accountedEmissions`
- `accRewardPerShare`

State migration is done through `EmissionsContract.initializeMigration(...)`.

## Preflight

1. Freeze frontends/backends to stop routing new harvest-related actions during proposal prep/execution.
2. Decide if staking implementation upgrade is required in the same batch.
3. If needed, prepare new staking implementation address (`NEW_STAKING_IMPLEMENTATION`).
4. Deploy new `EmissionsContract` with constructor admin set to multisig, or provide an already deployed address.

## Generate Safe Proposal

Use:

```bash
npx hardhat run scripts/prepare-mainnet-upgrade-proposal.ts --network base-mainnet
```

Required env:

- `MULTISIG` (or `TREASURY` / `ADMIN_MULTISIG`)
- One of:
  - `NEW_EMISSIONS_ADDRESS=0x...`
  - `DEPLOY_NEW_EMISSIONS=true` (script deploys emissions first)

Optional env:

- `NEW_STAKING_IMPLEMENTATION=0x...` (adds `upgradeToAndCall(...)`)
- `STAKING_UPGRADE_CALLDATA=0x...` (defaults to `0x`)
- `MIGRATION_PROVIDER_DEBT_FILE=path/to/file.json` (usually empty for current architecture)

Outputs:

- `deployments/multisig-proposal-base-mainnet-emissions-upgrade-*.json`
- `deployments/multisig-proposal-base-mainnet-emissions-upgrade-*.md`

## Multisig Transaction Order

Execute in this order (single Safe batch preferred):

1. Optional: `DualPoolStaking.upgradeToAndCall(newImplementation, data)`
2. `Myntis.grantRole(MINTER_ROLE, newEmissions)` (if missing)
3. `newEmissions.initializeMigration(oldSnapshot...)`
4. `DualPoolStaking.setEmissionsContract(newEmissions)`
5. `Myntis.revokeRole(MINTER_ROLE, oldEmissions)` (if still granted)

## Post-Execution Verification

1. `DualPoolStaking.emissionsContract()` equals new emissions address.
2. New emissions:
   - `startTime` migrated
   - `lastRewardTime` migrated
   - `mintedEmissions` migrated
   - `accountedEmissions` migrated
3. Myntis `MINTER_ROLE`:
   - granted to new emissions
   - revoked from old emissions
4. Run:

```bash
npx hardhat run scripts/check-hub-stack-latest.ts --network base-mainnet
```

## Important Notes

- Re-generate proposal right before submission to minimize state drift.
- If old emissions can still advance before cutover, stale migration inputs can under/over-shoot by the drift amount.
- If drift occurs, reconcile with documented compensation process (`deployments/compensation-migration-plan.md`).
