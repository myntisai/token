# Mainnet Compensation / Migration Plan

Generated: 2026-02-14T05:12:08.002Z
Chain: Base Mainnet (8453)

## Frozen Contract Set

- Active emissions: `0x803f9694bE31D3ACe5792C21ab9F72b69838C0e0`
- Active staking: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- Active distributor: `0xfF52fdA700CaF238F9fE3bea3091E863aA00EADc`
- Legacy emissions (cutover source): `0x47386e229d3D76962f339D5e93349724858F88Ac`
- Legacy staking (cutover source): `0x48bcD6177f958C26fCc8D8e4B8088936bd20541e`
- Legacy distributor (cutover source): `0xFDF1Aa6FE61675Cab26e083f92ce9A7986bEaF6f`

## Quantified Gap (Cutover Model)

- Legacy staking reward liability: **0.0 MYNT**
- Legacy staking reward funds: **0.0 MYNT**
- Legacy staking reward gap: **0.0 MYNT**
- Legacy distributor liability (provider + locked): **0.0 MYNT**
- Legacy distributor funds: **0.0 MYNT**
- Legacy distributor gap: **0.0 MYNT**
- Combined gap (staking+distributor): **0.0 MYNT**
- Immediate candidate total (non-locked): **0.0 MYNT**
- Locked-epoch liability bucket: **0.0 MYNT**

## Single Plan (Merkle Compensation)

1. Freeze legacy addresses in app/backend config; no new user actions routed to legacy staking/distributor.
2. Export beneficiaries from `deployments/compensation-candidates-mainnet.json` (`immediate` bucket only).
3. Fund a one-time compensation Merkle distributor with `immediateTotal + safetyBuffer` MYNT.
4. Publish merkle root + proof API + claim window (recommended 90 days).
5. Keep legacy distributor online for locked epochs; after closure, reconcile and run a second tiny Merkle if needed.
6. Any deficit (`combinedGap`) is top-upped by multisig before opening claims.

## Operational Notes

- This plan treats locked epochs as a separate bucket to avoid overpaying before epoch close resolution.
- If `combinedGap` is zero, compensation can be fully funded from legacy recoverable funds.
- Re-run this script immediately before finalizing distribution to refresh numbers.

## Artifacts

- `deployments/historical-snapshots-mainnet-core.json`
- `deployments/compensation-candidates-mainnet.json`
- `deployments/FROZEN_MAINNET_ADDRESSES.md`

