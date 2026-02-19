# Rewards Flow Audit (Emissions -> Staking -> Vault -> Distributor)

Date: 2026-02-15

This document describes the intended accounting and data flow across:

- `token/contracts/EmissionsContract.sol`
- `token/contracts/DualPoolStaking.sol`
- `token/contracts/LiquidStakingVault.sol`
- (Option B) `token/contracts/ZKMerkleDistributor.sol`

It is written to answer:

- Which variables belong to Provider vs User pool.
- What changes on `harvest` / `syncEmissions` / vault harvest/compound.
- Why some UI values can show "no change" even when a harvest happened.

## High-Level Architecture

There are two separate reward distribution paths:

1. **Pool rewards (MasterChef-style, accRewardPerShare)**
   - Stored + accounted inside `DualPoolStaking` as `providerPool.accRewardPerShare` and `userPool.accRewardPerShare`.
   - Claimed by `DualPoolStaking.harvestRewards(user)` which transfers tokens from staking contract to the user.

2. **Provider emissions (Option B, provider accrued emissions -> distributor)**
   - Accrued per provider in `DualPoolStaking.providerAccruedEmissions[provider]`.
   - Moved out of staking into `ZKMerkleDistributor` by `DualPoolStaking.fundProviderBalance(provider, amount)`.
   - This is not paid out via `harvestRewards()`.

## Mermaid Flowchart

```mermaid
flowchart TD
  E[EmissionsContract] -->|mint tokens to staking| S[DualPoolStaking]
  E -->|syncEmissions: delta minted| S

  S -->|accRewardPerShare updates| P[Provider Pool]
  S -->|accRewardPerShare updates| U[User Pool]

  S -->|harvestRewards(user): transfer| W[User Wallet]

  V[LiquidStakingVault (ERC4626)] -->|stakeToUserPool(amount, vault)| S
  S -->|harvestRewards(vault): transfer| V

  S -->|fundProviderBalance(provider): notifyRewardWithTransfer| D[ZKMerkleDistributor]
  D -->|claim via merkle+zk| W
```

## Contract-by-Contract State & Meaning

### `EmissionsContract.sol`

**Core state**

- `startTime`: emission schedule anchor (set at deployment).
- `lastRewardTime`: last time global emission accounting was updated.
- `mintedEmissions`: total tokens minted by this contract so far.
- `accountedEmissions`: total emission amount that has been "accounted" into reward math (can be >= minted).
- `accRewardPerShare`: provider-side accumulator (only for provider portion, scaled by `PRECISION`).
- `providerRewardDebt[provider]`: provider-specific debt used by *EmissionsContract* `pendingRewards()` to prevent double-claiming *within this contract’s view logic*.

**What changes**

- `updateEmissions()`:
  - Advances `accountedEmissions` based on time and emission rate.
  - Updates `accRewardPerShare` (provider-side only) using `getProviderPoolStaked()`.
  - Does not mint.
- `harvest(provider)` (called by staking):
  - Calls `updateEmissions()`.
  - Computes `pendingTotal = accountedEmissions - mintedEmissions`.
  - Mints `pendingTotal` to the staking contract.
  - Updates `mintedEmissions += pendingTotal`.
  - Calls staking `notifyReward(provider, providerPortion)` then `syncEmissions()`.

**Important observation**

`harvest(provider)` mints **the global delta** since last mint and pushes it to staking. That means distribution to end-users must happen in `DualPoolStaking.syncEmissions()` (or equivalent), not in EmissionsContract itself.

### `DualPoolStaking.sol`

**Pool state (MasterChef pattern)**

- `providerPool` (`PoolInfo`):
  - `totalStaked`
  - `accRewardPerShare`
  - `lastRewardTime` (present but not used as a timestamp driver in the current pattern)
  - `emissionShare` (`875` for 87.5%)
  - `totalRewards`
- `userPool` (`PoolInfo`):
  - same fields, `emissionShare` (`125` for 12.5%)

**User state**

- `userInfo[account]` (`UserInfo`):
  - `amount`: staked amount for that account *in exactly one pool*
  - `rewardDebt`: MasterChef debt for that pool accumulator
  - `poolType`: `Provider` (0) or `User` (1)
  - `isProvider`: bookkeeping flag
  - `lastStakeTime`

**Pending buckets (not yet reflected in `accRewardPerShare`)**

- `providerPendingRewards`: rewards queued for provider pool distribution.
- `userPendingRewards`: rewards queued for user pool distribution.
- `pendingTreasuryWithdrawal`: rewards that were queued to treasury (pull pattern), or used as an accounting sink in remediation.

**Provider emissions (Option B)**

- `providerAccruedEmissions[provider]`: emissions accrued for provider to later fund distributor.
- `totalProviderAccruedEmissions`: sum of all provider accrued emissions.
- `lastSyncedEmissionsMinted`: baseline for `EmissionsContract.mintedEmissions()` so sync only applies deltas.

**Key mechanics**

- `_updatePools()`:
  - Converts `providerPendingRewards` into `providerPool.accRewardPerShare` (if stakers exist).
  - Converts `userPendingRewards` into `userPool.accRewardPerShare` (if stakers exist).
  - If no stakers, optionally queues to `pendingTreasuryWithdrawal`.
- `pendingRewards(user)`:
  - View: `pending = amount * accRewardPerShare / PRECISION - rewardDebt`.
- `_harvestRewards(user)` / `harvestRewards(user)`:
  - Calculates pending for user’s poolType.
  - Updates `rewardDebt = amount * accRewardPerShare / PRECISION`.
  - Transfers `pending` tokens to `user`.
  - Also reconciles `pendingTreasuryWithdrawal` downward if needed (write-down) so accounting stays solvent.

**Why a harvest can revert**

If `rewardDebt` is stale (e.g. zero) while `accRewardPerShare` is huge, `pendingRewards(user)` becomes enormous and `harvestRewards()` can fail on:

- `insufficient balance for harvest`, or
- `DualPoolStaking: accounted exceeds balance` (in reconciliation paths).

This is why a one-time debt sync (reinitializer) exists.

### `LiquidStakingVault.sol` (ERC-4626 user pool wrapper)

The vault is designed so that **the vault contract** (not each user) is the staker in the user pool, enabling share transferability.

**Core state**

- `dualPoolStaking`: address of staking contract used by the vault.
- `totalVaultDeposits`: principal tracking for assets staked by the vault in staking.

**Key mechanics**

- `deposit()/mint()`:
  - `_harvestPendingRewards()` (harvest to vault first).
  - `super.deposit/mint` (mints shares).
  - `_stakeInUserPool(assets)` (stakes under `address(this)` in staking).
  - `totalVaultDeposits += assets`.
- `withdraw()/redeem()`:
  - `_harvestPendingRewards()` first (harvest to vault).
  - `_unstakeFromUserPool(assets)` (unstakes from staking under `address(this)`).
  - `super.withdraw/redeem` (burn shares, transfer assets).
  - `totalVaultDeposits -= assets`.
- `pendingVaultRewards()`:
  - returns `DualPoolStaking.pendingRewards(address(this))`.
- `harvestVaultRewards()`:
  - calls `DualPoolStaking.harvestRewards(address(this))`.
  - returns delta of vault’s **idle token balance**.
- `totalAssets()`:
  - returns `idle + totalVaultDeposits + pending`.

**Why the UI can show “no change” after vault harvest**

Because `totalAssets()` already includes `pending`, and harvest moves `pending -> idle`:

- Before harvest: `totalAssets = idle + principal + pending`
- After harvest: `totalAssets = (idle + harvested) + principal + (pending - harvested)`
- Net: `totalAssets` unchanged

So `convertToAssets(shares)` may not change on harvest even though rewards were harvested.

The best UI signal is:

- show `pendingVaultRewards` (should go down to ~0 after harvest)
- show vault **idle balance** (should go up after harvest)

### `ZKMerkleDistributor.sol` (Option B)

This contract holds provider-funded balances and manages claim batches/merkle roots.

Key point: it is funded via `DualPoolStaking.fundProviderBalance(...)`, not via `harvestRewards()`.

## Audit Notes (Logic Checks)

These checks should hold for “perfect” MasterChef-style accounting inside `DualPoolStaking`:

- `pendingRewards(user)` only depends on:
  - `userInfo[user].amount`
  - the correct pool’s `accRewardPerShare`
  - `userInfo[user].rewardDebt`
- After a successful `harvestRewards(user)`:
  - `pendingRewards(user)` should drop close to `0` (modulo rounding)
  - `rewardDebt` should equal `amount * accRewardPerShare / PRECISION`
- Pool total staked should match sum of user amounts for that pool (subject to vault being a single large staker for the user pool).

**Non-atomicity / fairness**

In a correct MasterChef implementation, a user cannot steal rewards by harvesting “first” as long as:

- pool accumulators are updated consistently, and
- each user’s `rewardDebt` is set correctly on stake/unstake/harvest.

If `rewardDebt` is not initialized for existing stakers after a bugfix/upgrade, the first harvest can attempt to claim an impossible backlog (leading to reverts) or can over-claim (if balance is present).

## What To Fix If UI Still Shows 0 / “No Change”

- If pool totals show `—`:
  - front-end is failing to read the staking contract; verify addresses + chainId.
- If vault pending is always 0:
  - verify `LiquidStakingVault.dualPoolStaking()` equals your active staking proxy address.
- If vault harvest appears to do nothing:
  - verify `pendingVaultRewards` goes down and `Vault Idle Balance` goes up; do not rely on `Your Vault Assets` changing.

