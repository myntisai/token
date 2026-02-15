# Base Mainnet Staking MasterChef Delta-Sync Upgrade Tracker (Execution Log)

Use this file as the live checklist + audit log for the **DualPoolStaking MasterChef delta-sync** remediation on Base mainnet.

This change fixes the root cause of:

- `DualPoolStaking: accounted exceeds balance` reverts during emissions harvest
- runaway `accRewardPerShare` / impossible `pendingRewards()` caused by balance-diff double counting
- stuck `LiquidStakingVault` operations due to insolvent historical accounting

This upgrade intentionally starts a clean accounting epoch going forward. If you want to honor historical rewards from the broken period, do a separate compensation plan (Merkle/manual) and document it.

## Change Metadata

- Change ID: `base-mainnet-staking-masterchef-delta-sync-2026-02-15`
- Chain: Base Mainnet (`8453`)
- Safe (multisig): `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B`
- Staking proxy (UUPS): `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- Token (MYNT): `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
- EmissionsContract: `0x7086792971b623462B6C1d1263Ac73b0761ADDB9`
- LiquidStakingVault: `0x019cB2AA19465Ca1e140AbeADF13320414031C6B`

Related docs:

- Audit report: `deployments/MAINNET_EMISSIONS_STAKING_DISTRIBUTION_AUDIT_2026-02-15.md`
- Prior upgrades:
  - `deployments/MAINNET_UPGRADE_TRACKER.md`
  - `deployments/MAINNET_STAKING_REWARDDEBT_SYNC_UPGRADE_TRACKER.md`

## Scope / Intent

### What This Upgrade Does

- Upgrades the `DualPoolStaking` proxy implementation to a version that syncs rewards using a MasterChef-style explicit delta:
  - `delta = EmissionsContract.mintedEmissions() - lastSyncedEmissionsMinted`
- Executes a one-time reinitializer:
  - `reinitializeV5MasterchefFix(address[] accounts)` (`reinitializer(5)`, admin-only)

### What `reinitializeV5MasterchefFix(accounts)` Changes

- Sets `lastSyncedEmissionsMinted = EmissionsContract.mintedEmissions()` (baseline so first sync is not huge)
- Sets `pendingTreasuryWithdrawal = 0` (removes the historical drift bucket that bricks syncing)
- Sets `totalProviderAccruedEmissions = 0` (deprecates legacy provider-accrual path)
- For each `accounts[i]` with `userInfo.amount > 0`:
  - Sets `userInfo.rewardDebt = userInfo.amount * accRewardPerShare(poolType) / PRECISION` (pending becomes ~0)
  - Clears `providerAccruedEmissions[account]` if present

### What This Upgrade Does NOT Change

- Does not change pool split (87.5% provider / 12.5% user).
- Does not change token address or staking proxy address.
- Does not change principal stakes (`providerPool.totalStaked`, `userPool.totalStaked`).

### Consequence (Non-Negotiable)

For the listed accounts, this upgrade intentionally resets their computed pending rewards at execution time to ~0.

If you intend to compensate users/providers for historical accounting drift, do that as a separate plan and make it explicit.

## Accounts To Include

At minimum:

- Provider/service wallet: `0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6`
- Provider/personal wallet: `0xca7735a6290f384c8a9394b0e3141fef89e6589d`
- Vault (user pool staker): `0x019cB2AA19465Ca1e140AbeADF13320414031C6B`

Also include any other addresses with `userInfo.amount > 0` at the time of execution.

## Phase 0: Preflight (Do Not Skip)

- [ ] Stop `staking-service` (or disable on-chain ops) so it does not spam `harvestFromEmissions()` during the upgrade.
- [ ] Confirm Safe has `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` on `DualPoolStaking`.
- [ ] Snapshot current on-chain state (paste into **Evidence**):
  - `Myntis.balanceOf(DualPoolStaking)`
  - `DualPoolStaking.getTotalStaked()`
  - `DualPoolStaking.pendingTreasuryWithdrawal()`
  - `DualPoolStaking.pendingRewards(account)` for each account in the fix list
  - `DualPoolStaking.userInfo(account)` for each account in the fix list
  - `EmissionsContract.mintedEmissions()`

## Phase 1: Deploy New Staking Implementation

From `token/`:

```bash
npx hardhat test
npx hardhat run scripts/deploy-dual-pool-staking-impl.ts --network base-mainnet
```

Record:

- New implementation: `0xAB62e9dD23f77a6ceEbCd386AC7ed6869115c755`
- Deployment tx hash: `0x5ca2f762d07d4b04e2cde4d57581e4f7377b5b3b25caeaa57274148e51e91abb`

## Phase 2: Prepare Safe Transaction (Upgrade + Reinitialize V5)

Generate the Safe payload file:

```bash
MULTISIG=0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B \
NEW_STAKING_IMPLEMENTATION=<NEW_IMPL> \
FIX_ACCOUNTS=0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6,0xca7735a6290f384c8a9394b0e3141fef89e6589d,0x019cB2AA19465Ca1e140AbeADF13320414031C6B \
npx hardhat run scripts/prepare-mainnet-staking-masterchef-fix-proposal.ts --network base-mainnet
```

Artifacts (fill in after generation):

- Proposal JSON: `deployments/multisig-proposal-base-mainnet-staking-masterchef-fix-2026-02-15T21-57-03-108Z.json`
- Proposal MD: `deployments/multisig-proposal-base-mainnet-staking-masterchef-fix-2026-02-15T21-57-03-108Z.md`

## Phase 2.5: Propose Transaction To Safe

```bash
PROPOSAL_FILE=<proposal-json-path> \
SAFE_ADDRESS=0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B \
npx hardhat run scripts/propose-safe-upgrade.ts --network base-mainnet
```

Record:

- Safe nonce: `10`
- SafeTxHash: `0x6d80fe0722a439a3783648c5c224226f3bb8ade365f7f04e3f4df78041fd0c3c`
- Submission output JSON: `deployments/safe-proposal-submit-base-mainnet-2026-02-15T21-57-47-043Z.json`

## Phase 3: Safe Execution

Record the Safe execution:

| Step | Contract Call | Safe Tx Hash | Exec Tx Hash | Block | Status | Notes |
|---|---|---|---:|---:|---|---|
| 1 | `DualPoolStaking.upgradeToAndCall(newImpl, reinitializeV5MasterchefFix(accounts))` | `0x6d80fe0722a439a3783648c5c224226f3bb8ade365f7f04e3f4df78041fd0c3c` | `0x31ad0d48dc1156da01068bdaa28deb9d19e505180ca110ee5e89c2640c606b80` | 42201908 | ✅ executed | executed 2026-02-15T22:06:03Z |

## Phase 4: Post-Upgrade Verification (Must Pass)

- [ ] `erc1967` implementation == `<NEW_IMPL>`
- [ ] `DualPoolStaking.pendingTreasuryWithdrawal() == 0`
- [ ] `DualPoolStaking.pendingRewards(vault)` is near `0`
- [ ] `LiquidStakingVault.withdraw()` and `redeem()` are unblocked (test small amounts)
- [ ] `staking-service` can successfully:
  - `harvestFromEmissions(provider)`
  - `harvestRewards(provider)`
  - `depositBalance(amount)`
  - submit Merkle root

## Evidence / Notes

- Pre-upgrade snapshot:
  - See `deployments/MAINNET_EMISSIONS_STAKING_DISTRIBUTION_AUDIT_2026-02-15.md` (snapshot at 2026-02-15T20:34:11Z)
- Post-upgrade snapshot:
  - Verified 2026-02-15 (after execution)
  - ERC1967 implementation: `0xAB62e9dD23f77a6ceEbCd386AC7ed6869115c755`
  - `pendingTreasuryWithdrawal == 0`
  - `lastSyncedEmissionsMinted == EmissionsContract.mintedEmissions == 1,947,025.6215119228815211`
  - `Myntis.balanceOf(staking) == 70,184.155187977781225707`
  - `pendingRewards(vault) == 6,184.20218163` (no longer > staking balance)
  - `harvestFromEmissions(provider) staticCall ok` (no `accounted exceeds balance` revert)
