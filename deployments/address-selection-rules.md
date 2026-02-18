# Address Selection Rules

## Canonical Sources

- Active mainnet source: `deployments/active-contracts-mainnet.json`
- Legacy source: `deployments/legacy-contracts.json`
- Historical evidence: `deployments/forensic-contract-history-latest.json`
- Frozen core set: `deployments/FROZEN_MAINNET_ADDRESSES.md`
- Compensation/migration plan: `deployments/compensation-migration-plan.md`

## Rules

1. On Base mainnet (`chainId=8453`), only use addresses listed in `active-contracts-mainnet.json`.
2. Never auto-select an address from `legacy-contracts.json` for production transactions.
3. If an active address changes, update `deployment-base-mainnet-latest.json` first, then regenerate these files.
4. Any address with `hasCode=false` must be treated as non-contract and blocked in backend/frontend config.
5. Keep testnet and unknown-network addresses isolated from production config.

## Regeneration

```bash
cd token
node scripts/generate-active-contract-sets.js
```

## Notes

- These files represent current policy, not immutable chain history.
- Chain history remains in the forensic file.
