# Emissions/Staking Upgrade Multisig Proposal

> Dry-run artifact only. This was generated with `NEW_EMISSIONS_ADDRESS` set to the current emissions address and is **not executable** as an upgrade proposal.

- Generated: 2026-02-14T20:30:34.504Z
- Network: base-mainnet (8453)
- Multisig: `0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6`
- Old emissions: `0x803f9694bE31D3ACe5792C21ab9F72b69838C0e0`
- New emissions: `0x803f9694bE31D3ACe5792C21ab9F72b69838C0e0`

## Migration Snapshot

- mintedEmissions: `1652054794520547944980800`
- accountedEmissions: `1652054794520547944980800`
- accRewardPerShare: `255263700117051`
- startTime: `1770524987`
- lastRewardTime: `1771100487`
- providerDebtCount: `0`

## Safe Transaction Order

1. Emissions.initializeMigration(snapshotFromOldEmissions)
   - to: `0x803f9694bE31D3ACe5792C21ab9F72b69838C0e0`
   - value: `0`
   - data: `0x2d72f4ef000000000000000000000000000000000000000000015dd611e29f00829a6140000000000000000000000000000000000000000000015dd611e29f00829a61400000000000000000000000000000000000000000000000000000e829362b663b000000000000000000000000000000000000000000000000000000006988113b000000000000000000000000000000000000000000000000000000006990d94700000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`

## Notes

- Run this script immediately before creating the Safe proposal to reduce state drift.
- If old emissions can still be harvested before cutover, regenerate proposal data at execution time.
- Provider debt arrays can be empty when DualPoolStaking remains the canonical pending-reward source.
