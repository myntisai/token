# Contract Deployment History (Canonical)

**Last Updated:** February 18, 2026  
**Scope:** Base Sepolia history, Base mainnet cutover, and current core addresses.

## Source Of Truth

- `deployments/deployment-base-mainnet-latest.json`
- `deployments/FROZEN_MAINNET_ADDRESSES.md`
- `deployments/MAINNET_UPGRADE_TRACKER.md`
- `deployments/MAINNET_STAKING_REWARDDEBT_SYNC_UPGRADE_TRACKER.md`
- `deployments/MAINNET_STAKING_MASTERCHEF_DELTA_SYNC_UPGRADE_TRACKER.md`
- `deployments/base-sepolia-blockscout-deployer-scan-0904-89.json`

## Current Base Mainnet Core Addresses

| Component | Address |
|---|---|
| Myntis (token) | `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47` |
| DualPoolStaking (proxy) | `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d` |
| EmissionsContract | `0x7086792971b623462B6C1d1263Ac73b0761ADDB9` |
| LiquidStakingVault | `0x019cB2AA19465Ca1e140AbeADF13320414031C6B` |
| ZKMerkleDistributor | `0xfF52fdA700CaF238F9fE3bea3091E863aA00EADc` |
| GlobalSupplyRegistry | `0xdFb3b8107B33d54BAe402a76BbA1432668B2D896` |
| Multisig (Safe) | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` |

## Mainnet Timeline

### 2026-02-08: Mainnet Token Activation And Holder Migration

- Mainnet MYNT token in use: `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
- Migration batch tx (92 recipients):  
  `0xbef2847a5c3100c92e8b841626064c62a9a8c19cdb92580bf247baa5828c37f7`
- Follow-up correction txs:  
  `0x4ec6c454dba249c6633b32f062767ab81f412b17e3be488095cf1b70a3442007`  
  `0xebda138f7f4ef092fbd7b0c5fcc33cb4dae89d0cdf62fc8ca982a1d3207d1a91`

### 2026-02-12: Migration Completion Marker

- `MigrationCompleted` tx:  
  `0x4dabbb9690fef9c860bf00e035b3a83e9b6d61537078c4c3662fde47b4fd2368`

### 2026-02-14: Emissions Migration + Staking Rewire

- Tracked in `deployments/MAINNET_UPGRADE_TRACKER.md`.
- Old emissions contract replaced and staking rewired to new emissions flow.

### 2026-02-15: Two Staking Accounting Remediations

- RewardDebt sync upgrade: `deployments/MAINNET_STAKING_REWARDDEBT_SYNC_UPGRADE_TRACKER.md`
- MasterChef delta-sync upgrade: `deployments/MAINNET_STAKING_MASTERCHEF_DELTA_SYNC_UPGRADE_TRACKER.md`

## MYNT Contract Lineage

### Base Sepolia (Created By `0x0904...` / `0x89...`)

| UTC Created | Block | Creator | Token | Status |
|---|---:|---|---|---|
| 2025-11-28T03:31:24Z | 34266198 | `0x0904192498effF59e0502aE1700ecAa9B1708543` | `0xE1eFd4598Cb371035F78dD3eb4151A7498F9dEa4` | Early low-supply test wave (10k mint, 100 burn). |
| 2025-12-03T10:35:48Z | 34494930 | `0x0904192498effF59e0502aE1700ecAa9B1708543` | `0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55` | Major Sepolia migration wave (34 migrated holders). |
| 2026-02-03T19:25:22Z | 37189217 | `0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627` | `0x599016bF00eE23d531223c6285C92aa0cAC278EF` | Snapshot source used for mainnet holder migration. |
| 2026-02-07T20:24:08Z | 37363780 | `0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627` | `0xC5aA7e0992EEDf67f5096Cb629152267cEDf2875` | Later Sepolia wave with small supply/volume. |

Reference tx hashes are in `deployments/base-sepolia-blockscout-deployer-scan-0904-89.json`.

### Base Mainnet

| First Code Seen Block | Token | Status |
|---:|---|---|
| 41867816 | `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47` | Active mainnet MYNT used in migration + emissions minting. |
| 41866687 | `0x0314e1274b9860E77d90E894D784cD24EeCbE479` | Legacy/unused mainnet MYNT contract (no transfer/mint activity observed). |

## Deployer-Account Coverage

- Base Sepolia full scan for `0x0904...` + `0x89...` currently shows:
  - **360 unique created contracts**
  - **360 tracked in repository**
  - **0 untracked**

See `docs/deployment/BASE_SEPOLIA_DEPLOYER_SCAN_BLOCKSCOUT.md` for full counts and timeline.

## Related Reading

1. `docs/deployment/MIGRATION_AND_ACCOUNTING_STORY.md`
2. `docs/deployment/FORENSIC_MIGRATION_TRANSFER_ANALYSIS.md`
3. `deployments/MIGRATION_SCOPE_DISCLOSURE.md`
