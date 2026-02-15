# Base Mainnet Staking RewardDebt Sync Upgrade Tracker (Execution Log)

Use this file as the live checklist + audit log for the **DualPoolStaking rewardDebt sync** remediation on Base mainnet.

This upgrade is required to unblock `harvestRewards()` when `pendingRewards()` is "impossibly large" due to stale/incorrect `rewardDebt` values.

## Change Metadata

- Change ID: `base-mainnet-staking-rewarddebt-sync-2026-02-15`
- Date (UTC): `2026-02-15`
- Chain: Base Mainnet (`8453`)
- Safe (multisig): `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B`
- Staking proxy (UUPS): `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- Token: `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
- ZK distributor (hub): `0xfF52fdA700CaF238F9fE3bea3091E863aA00EADc`
- Emissions (current): `0x7086792971b623462B6C1d1263Ac73b0761ADDB9`

Current on-chain staking implementation (pre-upgrade):

- `0x4540361c613ba75DD0e394b652a6D8401EA4310F`

Source of truth:

- `token/deployments/deployment-base-mainnet-latest.json`
- `token/deployments/MAINNET_UPGRADE_TRACKER.md`

## Scope / Intent

### What This Upgrade Does

- Deploys a new `DualPoolStaking` implementation containing:
  - `reinitializeV4SyncRewardDebt(address[] accounts)` (`reinitializer(4)`, admin-only)
- Executes a single Safe transaction:
  - `DualPoolStaking.upgradeToAndCall(newImpl, reinitializeV4SyncRewardDebt(accounts))`

### What It Changes

For each listed `accounts[i]` where `userInfo[account].amount > 0`:

- Sets `userInfo[account].rewardDebt = userInfo[account].amount * accRewardPerShare(poolType) / PRECISION`
- Emits `RewardDebtSynced(account, poolType, amount, oldDebt, newDebt)`

### What It Does NOT Change

- Does not change pool emission split (87.5% provider / 12.5% user).
- Does not change `providerPool.totalStaked`, `userPool.totalStaked`, or any token balances.
- Does not transfer tokens or mint/burn anything.

### Important Consequence

This sync **sets the listed accounts' computed pending rewards to ~0 at execution time**.

If you want to compensate historical rewards from a broken accounting period, do it separately
(Merkle/manual) and document it.

## Why This Is Needed (Observed Symptom)

- `DualPoolStaking.pendingRewards(provider)` is extremely large for some stakers (millions of MYNT),
  while `Myntis.balanceOf(DualPoolStaking)` is far smaller.
- `DualPoolStaking.harvestRewards(provider)` reverts with `ERC20InsufficientBalance(...)`.

Root cause:

- `providerPool.accRewardPerShare` / `userPool.accRewardPerShare` is large, but per-user `rewardDebt`
  was never initialized/migrated correctly (stale/zero).

## Accounts To Sync (Initial List)

At minimum include any address with `userInfo.amount > 0` where `rewardDebt` is stale/zero.

Known current stakers (Base mainnet):

- `0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6` (provider/service wallet, provider pool)
- `0xca7735a6290f384c8a9394b0e3141fef89e6589d` (personal provider wallet, provider pool)
- `0x019cB2AA19465Ca1e140AbeADF13320414031C6B` (LiquidStakingVault, user pool staker)

Final list used (fill at execution time):

- [x] `0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6`
- [x] `0xca7735a6290f384c8a9394b0e3141fef89e6589d`
- [x] `0x019cB2AA19465Ca1e140AbeADF13320414031C6B`

## Phase 0: Preflight (Do Not Skip)

- [ ] Confirm you are on Base mainnet (`chainId=8453`).
- [ ] Confirm current staking proxy and current implementation:
  - `DualPoolStaking` proxy: `0x3CBA95...`
  - current impl: `0x454036...`
- [ ] Confirm Safe has `UPGRADER_ROLE` and `DEFAULT_ADMIN_ROLE` on `DualPoolStaking`.
- [ ] Confirm staking-service is not spamming `harvestFromEmissions()` retries:
  - If needed, temporarily stop/restart container: `myntis-staking-service-prod`.
- [ ] Snapshot current state for records (copy into **Evidence** section):
  - `providerPool` / `userPool`
  - `pendingRewards(account)` for each sync account
  - `userInfo(account)` for each sync account
  - `Myntis.balanceOf(stakingProxy)`

## Phase 1: Deploy New Staking Implementation

From `token/`:

```bash
npx hardhat test
npx hardhat run scripts/deploy-dual-pool-staking-impl.ts --network base-mainnet
```

Record:

- New implementation: `0x086D76393A089286AFfcc690f95129d3235EFeaC`
- Deployment tx hash: `0x2133e8d2c03b6e5f218a40c4d4baa77bb937f92c8670f05eeae6817f11abc877`

## Phase 2: Prepare Safe Transaction (Upgrade + Sync)

Use the helper to generate the Safe payload file:

```bash
MULTISIG=0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B \
NEW_STAKING_IMPLEMENTATION=<NEW_IMPL> \
SYNC_ACCOUNTS=0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6,0xca7735a6290f384c8a9394b0e3141fef89e6589d,0x019cB2AA19465Ca1e140AbeADF13320414031C6B \
npx hardhat run scripts/prepare-mainnet-staking-rewarddebt-sync-proposal.ts --network base-mainnet
```

Artifacts (fill in after generation):

- Proposal JSON: `deployments/multisig-proposal-base-mainnet-staking-rewarddebt-sync-2026-02-15T03-09-14-256Z.json`
- Proposal MD: `deployments/multisig-proposal-base-mainnet-staking-rewarddebt-sync-2026-02-15T03-09-14-256Z.md`

If entering manually in Safe UI, the one and only transaction is:

- `to`: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- `value`: `0`
- `data`: `TBD` (this is `upgradeToAndCall(newImpl, reinitCalldata)`)

## Phase 2.5: Propose Transaction To Safe (So It Appears In UI)

From `token/`:

```bash
PROPOSAL_FILE=deployments/multisig-proposal-base-mainnet-staking-rewarddebt-sync-2026-02-15T03-09-14-256Z.json \
SAFE_ADDRESS=0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B \
npx hardhat run scripts/propose-safe-upgrade.ts --network base-mainnet
```

Recorded proposal submission:

- Safe nonce used: `9`
- SafeTxHash: `0x6965863ad2fd0757d85920691907b438c18b9e63ac902a8c225850f64386865f`
- Submission output JSON: `deployments/safe-proposal-submit-base-mainnet-2026-02-15T03-16-27-253Z.json`

## Phase 3: Safe Execution

Record the Safe execution details:

| Step | Contract Call | Safe Tx Hash | Exec Tx Hash | Block | Status | Notes |
|---|---|---|---:|---:|---|---|
| 1 | `DualPoolStaking.upgradeToAndCall(newImpl,reinitV4SyncRewardDebt(accounts))` | `0x6965863ad2fd0757d85920691907b438c18b9e63ac902a8c225850f64386865f` | `0x322c98ec8feba2d6d334efc5bde3972aa03c1a3a7be8ca26b333cc7f958f9630` | 42168127 | Executed | nonce=9, new impl `0x086D76393A089286AFfcc690f95129d3235EFeaC` |

## Phase 4: Post-Upgrade Verification (Must Pass)

On-chain checks:

- [x] `erc1967` implementation == `<NEW_IMPL>`
- [x] `pendingRewards(0x26A942...)` is near `0` (should no longer be millions)
- [x] `pendingRewards(0xca7735...)` is near `0`
- [x] `pendingRewards(0x019cB2AA...)` is near `0`
- [ ] `harvestRewards(0x26A942...)` no longer reverts (test with a small pending window after some emissions accrue)

Operational checks:

- [ ] Restart staking-service so it resumes normal harvest/fund cycle:
  - `docker-compose -f docker-compose.prod.yml up -d --build --force-recreate staking-service`
- [ ] Confirm staking-service no longer retries `harvestFromEmissions()` in a loop.
- [ ] Confirm normal funding path:
  - `harvestRewards(providerWallet)` succeeds
  - `depositBalance(amount)` succeeds
  - Merkle root submission succeeds

## Evidence / Notes

- Pre-upgrade snapshot:
  - `TBD`
- Post-upgrade snapshot:
  - Safe execution date (Safe TX service): `2026-02-15T03:20:01Z`
  - Staking proxy implementation (EIP-1967): `0x086D76393A089286AFfcc690f95129d3235EFeaC`
  - `DualPoolStaking.getTotalStaked()`: `12100` MYNT
  - `providerPool.totalStaked`: `7100` MYNT
  - `userPool.totalStaked`: `5000` MYNT
  - `pendingRewards(0x26A942...325B6)`: `0`
  - `pendingRewards(0xca7735...589d)`: `0`
  - `pendingRewards(0x019cB2...31C6B)`: `0`
- Any manual interventions:
  - `TBD`

## Rollback / Contingency

If the new implementation introduces unexpected behavior, rollback is a Safe `upgradeToAndCall`
back to the previous implementation address `0x4540361c613ba75DD0e394b652a6D8401EA4310F`
(note: the `reinitializer(4)` cannot be undone; rollback only changes code, not state).
