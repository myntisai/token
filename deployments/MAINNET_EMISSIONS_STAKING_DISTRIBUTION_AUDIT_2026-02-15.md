# Base Mainnet Emissions/Staking/Distributor Audit (2026-02-15)

This document is a technical audit + remediation plan for the **Base mainnet** reward accounting stack:

- `EmissionsContract` (emission schedule + mint trigger)
- `DualPoolStaking` (provider pool + user pool, MasterChef-style accounting)
- `ZKMerkleDistributor` (provider-funded user claims distribution)
- `LiquidStakingVault` (ERC-4626 wrapper around the user pool)

It explains:

- Why the protocol is currently failing (`DualPoolStaking: accounted exceeds balance`)
- Why the prior upgrades were necessary but insufficient
- What the **root fix** is to make it MasterChef-correct going forward
- What state must be reset on mainnet because historical accounting is irreparably corrupted

## Current Mainnet Addresses (Base, chainId=8453)

- Token (MYNT): `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
- DualPoolStaking (proxy): `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- EmissionsContract (current): `0x7086792971b623462B6C1d1263Ac73b0761ADDB9`
- LiquidStakingVault: `0x019cB2AA19465Ca1e140AbeADF13320414031C6B`
- ZKMerkleDistributor (hub): `0xfF52fdA700CaF238F9fE3bea3091E863aA00EADc`
- Treasury/Safe: `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B`

## Snapshot (On-Chain) At 2026-02-15T20:34:11Z

Numbers in MYNT (18 decimals).

Staking balances and buckets:

- `Myntis.balanceOf(DualPoolStaking)` = `51,196.041447183273368407`
- Principal staked (`providerPool.totalStaked + userPool.totalStaked`) = `12,100`
- `providerPendingRewards` = `0`
- `userPendingRewards` = `0`
- `pendingTreasuryWithdrawal` = `161,268.074581430745792463`
- `totalProviderAccruedEmissions` = `0.000000013631928565` (legacy)

Pools:

- Provider pool total staked = `7,100`
- User pool total staked = `5,000`

Per-account (stakers):

- Provider (service) `0x26A942...325B6` stake = `5,000`, `pendingRewards = 0`
- Provider (personal) `0xca7735...589d` stake = `2,100`, `pendingRewards = 0`
- Vault `0x019cB2...31C6B` stake = `5,000`, `pendingRewards = 59,581.0784812`

EmissionsContract:

- `mintedEmissions == accountedEmissions` = `1,897,552.004058853373663800`
- Emission rate (current): `~3.170979198... MYNT / sec`

## What Is Broken Right Now

### 1) Emissions Harvest Is Bricked

The production harvester calls:

1. `DualPoolStaking.harvestFromEmissions(provider)`
2. Which calls `EmissionsContract.harvest(provider)`
3. Which mints to staking then calls `DualPoolStaking.syncEmissions()`

`syncEmissions()` currently (on mainnet) infers "new rewards" using:

- `rewards = token.balanceOf(staking) - accounted`

Where `accounted` includes:

- principal
- pending buckets
- `pendingTreasuryWithdrawal`
- `totalProviderAccruedEmissions`

Because `pendingTreasuryWithdrawal` is **unbacked**, `accounted > balance`, and `syncEmissions()` reverts:

- `DualPoolStaking: accounted exceeds balance`

Concrete math from snapshot:

- `accounted = 12,100 + 161,268.074581444... = 173,368.074581444...`
- `balance = 51,196.041447...`
- gap = `122,172.033134...`

So any attempt to mint+sync emissions reverts.

### 2) User Pool (LiquidStakingVault) Is Functionally Stuck

The vault calls `DualPoolStaking.harvestRewards(vault)` on:

- `deposit()`
- `withdraw()`
- `redeem()`
- `compoundRewards()`
- `harvestVaultRewards()`

But `pendingRewards(vault) = 59,581.078...` while the staking contract balance is only `51,196.041...`.

That means:

- `harvestRewards(vault)` reverts (`insufficient balance for harvest`)
- Vault withdraw/redeem paths that call harvest will revert too

This is catastrophic for any user pool participants.

## Why This Happened (Root Cause)

There are two root problems:

### A) "Balance-Diff Sync" Is Not MasterChef-Correct

Using `balance - accounted` to infer new rewards is only safe if `accounted` includes **every** already-allocated-but-unclaimed reward amount.

This system does not track total "unclaimed allocated rewards" anywhere, so previous rewards that were already applied to `accRewardPerShare` remain in `balance` and get re-counted as "new rewards" again on later `syncEmissions()` calls.

This creates:

- runaway `accRewardPerShare`
- runaway computed `pendingRewards()`
- eventual insolvency (pending > balance)

### B) `pendingTreasuryWithdrawal` Was Used As An Accounting "Sponge"

`reinitializeV3()` set `pendingTreasuryWithdrawal` to whatever value made:

- `balance == accounted`

This allowed the system to continue temporarily, but it turns `pendingTreasuryWithdrawal` into a giant "drift bucket".

When real token outflows happened (providers harvesting rewards), `balance` fell but `pendingTreasuryWithdrawal` did not, eventually making:

- `accounted > balance` and bricking the protocol.

## What The Previous Upgrades Were For (And Why They Didn’t Fix This)

See:

- `token/deployments/MAINNET_UPGRADE_TRACKER.md`
- `token/deployments/MAINNET_STAKING_REWARDDEBT_SYNC_UPGRADE_TRACKER.md`

### Upgrade 2026-02-14: Emissions Migration + Rewire

Purpose:

- Deploy new `EmissionsContract`
- Migrate emission state (`initializeMigration`) so `startTime`, `mintedEmissions`, etc are not reset
- Grant/revoke `MINTER_ROLE` correctly
- Point staking to the new emissions
- Optionally upgrade staking implementation for earlier fixes

This solved:

- "new emissions contract starting from scratch" errors
- wrong minter wiring
- some access control hardening

It did not solve the fundamental sync model (`balance - accounted`).

### Upgrade 2026-02-15: RewardDebt Sync (Reinitializer(4))

Purpose:

- Fix stakers with stale `rewardDebt` vs huge `accRewardPerShare` so `pendingRewards()` is not "millions"
- Unblock provider harvesting (at that moment)

This solved:

- immediate impossibility of harvesting for the listed accounts at execution time

It did not solve:

- `syncEmissions()` balance-diff double counting
- the drift bucket (`pendingTreasuryWithdrawal`) becoming unbacked again over time

## What "Option B" Was (Fund Provider Reward)

In `ZKMerkleDistributor`:

- **Option A**: provider calls `depositBalance(amount)` from their wallet (after `harvestRewards()`).
- **Option B**: staking calls `notifyRewardWithTransfer(provider, amount)` to transfer tokens from staking into the distributor (staking must be set via `setStakingContract`).

Current production code uses **Option A** (harvest provider staking rewards, then `depositBalance()`).

## The Fix That Actually Makes This MasterChef-Correct

There is no config-only switch. The fix is an **on-chain code change** to the staking proxy.

### Required Design Change

`DualPoolStaking.syncEmissions()` must stop using `balance - accounted` and instead sync **only the emissions delta**:

- `delta = EmissionsContract.mintedEmissions() - lastSyncedEmissionsMinted`

Then split `delta` into provider/user pools using `emissionShare`.

This is the actual MasterChef model: add rewards by explicit delta, not by trying to infer from raw token balances.

### Required One-Time Mainnet State Reset

Historical accounting is already corrupted, so you must reset state so the protocol is not stuck:

- Write down `pendingTreasuryWithdrawal` (remove the drift bucket)
- Resync `rewardDebt` for all known stakers (provider wallets + vault, and any other stakers)
- Deprecate legacy `notifyReward()` side effects (do not create per-provider accrual obligations)
- Baseline `lastSyncedEmissionsMinted` to the current `mintedEmissions` so the first sync after upgrade is not huge

If you want to honor historical rewards from the broken period, do it via a separate compensation plan (Merkle/manual) based on event forensics.

## Recommended Remediation (Single Safe Transaction)

Deploy a new `DualPoolStaking` implementation (UUPS) that includes:

- `lastSyncedEmissionsMinted` storage
- `syncEmissions()` = minted-delta sync
- `reinitializeV5MasterchefFix(address[] accounts)` (one-time)

Then execute 1 Safe transaction:

- `DualPoolStaking.upgradeToAndCall(newImpl, reinitializeV5MasterchefFix(accounts))`

`accounts` must include:

- provider/service wallet
- any other provider wallets with stake
- the `LiquidStakingVault` address
- any other staker addresses discovered from `Staked(...)` logs

## What Changes (And What Does Not)

Does change:

- `pendingTreasuryWithdrawal` is set to `0`
- `rewardDebt` for listed accounts is set to current baseline (pending becomes ~0)
- emissions syncing becomes delta-based and cannot double count unclaimed rewards

Does not change:

- token address
- staking proxy address
- pool split values (87.5% / 12.5%)
- user principal stake (`totalStaked`)

## Status In This Repo

The MasterChef-correct fix is implemented in:

- `token/contracts/DualPoolStaking.sol`

And is unit-tested (`npx hardhat test` passes).

