# Base Mainnet: Emissions -> Staking -> ZK Distributor (Canonical Flowchart + Variable Map)

This file documents the **current on-chain reward flow** across:

- `EmissionsContract`
- `DualPoolStaking` (canonical MasterChef accounting)
- `ZKMerkleDistributor`

It is written to eliminate ambiguity between:

- the **on-chain “user pool”** (12.5% emissions share, staked via `LiquidStakingVault`)
- the **ZK distributor** (a separate provider-funded claim mechanism)

## High-Level Diagram

```mermaid
flowchart TD
  subgraph E[EmissionsContract]
    E1[getCurrentEmissionRate]
    E2[updateEmissions: accountedEmissions += rate*dt]
    E3[harvest(provider): mintedEmissions += (accounted-minted)]
  end

  subgraph S[DualPoolStaking]
    S0[token balance lives here]
    S1[syncEmissions(): delta = emissions.minted - lastSyncedMinted]
    S2[providerPendingRewards += delta*0.875]
    S3[userPendingRewards += delta*0.125]
    S4[_updatePools(): accRewardPerShare += pending/totalStaked]
    S5[harvestRewards(user): transfer pending to user; update rewardDebt]
  end

  subgraph Z[ZKMerkleDistributor]
    Z1[depositBalance(amount): providerBalance += amount]
    Z2[submitMerkleRoot(totalClaimable): providerBalance -= total; lockedBalance += total]
    Z3[claim(user): lockedBalance -= amount; transfer to user]
    Z4[closeEpoch: return unclaimed locked -> providerBalance]
  end

  E3 -->|mint tokens to staking| S0
  E3 -->|calls| S1
  S1 --> S2 --> S4
  S1 --> S3 --> S4
  S5 -->|provider gets tokens in wallet| P[(Provider wallet)]
  P -->|Option A funding| Z1
  Z1 --> Z2 --> Z3 --> U[(User wallet)]
  Z2 --> Z4
```

## EmissionsContract (What Moves)

**Purpose:** time-based emission schedule + mint trigger. The contract mints to `DualPoolStaking` and asks staking to account/distribute.

### Key Variables

- `startTime`: emissions schedule anchor
- `lastRewardTime`: timestamp checkpoint used by `updateEmissions()`
- `mintedEmissions`: how many tokens this contract has actually minted so far (monotonic)
- `accountedEmissions`: how many tokens should have been minted based on time (monotonic, capped)
- `accRewardPerShare`: legacy informational accumulator (not canonical payout state)
- `providerRewardDebt[provider]`: legacy/migration storage (not canonical payout state)

### State Transitions

**`updateEmissions()`**

- Reads:
  - `block.timestamp`, `lastRewardTime`, `startTime`
  - `stakingContract.getTotalStaked()`
  - `stakingContract.getProviderPoolStaked()` (only for informational `accRewardPerShare`)
- Writes:
  - `accountedEmissions += tokensToAccount`
  - `accRewardPerShare += providerPortion / providerStake` (informational)
  - `lastRewardTime = now`

**`harvest(provider)`** (callable only by `DualPoolStaking`)

- Computes:
  - `pendingTotal = accountedEmissions - mintedEmissions`
- Writes:
  - `mintedEmissions += pendingTotal`
- External effects:
  - `token.mint(DualPoolStaking, pendingTotal)`
  - `DualPoolStaking.syncEmissions()` (canonical provider/user split happens here)

## DualPoolStaking (Canonical MasterChef Distribution)

**Purpose:** canonical staking + reward accounting for two pools.

- Provider pool: `87.5%`
- User pool: `12.5%` (vault is the primary staker on behalf of end users)

### Key Variables

**Wiring**

- `token`
- `emissionsContract`
- `liquidStakingVault`
- `zkMerkleDistributor` (only used by deprecated Option B methods)

**MasterChef pool state**

- `providerPool.totalStaked`, `userPool.totalStaked` (principal)
- `providerPool.accRewardPerShare`, `userPool.accRewardPerShare` (canonical distribution accumulator)
- `providerPool.emissionShare == 875`, `userPool.emissionShare == 125`
- `providerPool.totalRewards`, `userPool.totalRewards` (bookkeeping)

**Per-user state**

- `userInfo[a].amount` (stake)
- `userInfo[a].rewardDebt` (MasterChef debt baseline)
- `userInfo[a].poolType` (Provider/User)
- `userInfo[a].isProvider`

**Pending buckets (“waiting room” before being applied to accRewardPerShare)**

- `providerPendingRewards`
- `userPendingRewards`

**Treasury windfall-prevention**

- `treasury`
- `pendingTreasuryWithdrawal`

**Critical delta-sync baseline (the MasterChef fix)**

- `lastSyncedEmissionsMinted`

### Canonical Emissions Split

**`syncEmissions()`** (callable only by `EMISSIONS_ROLE`, i.e. the `EmissionsContract`)

- Reads:
  - `currentMinted = EmissionsContract.mintedEmissions()`
  - `lastSyncedEmissionsMinted`
- Computes:
  - `delta = currentMinted - lastSyncedEmissionsMinted`
  - `providerShare = delta * 875 / 1000`
  - `userShare = delta - providerShare`
- Writes:
  - `lastSyncedEmissionsMinted = currentMinted`
  - `providerPendingRewards += providerShare` (or queue to treasury if `providerPool.totalStaked == 0`)
  - `userPendingRewards += userShare` (or queue to treasury if `userPool.totalStaked == 0`)
- Calls:
  - `_updatePools()` to apply pending buckets into `accRewardPerShare`

**`_updatePools()`**

- If `providerPendingRewards > 0` and `providerPool.totalStaked > 0`:
  - `providerPool.accRewardPerShare += providerPendingRewards * PRECISION / providerPool.totalStaked`
  - `providerPool.totalRewards += providerPendingRewards`
  - `providerPendingRewards = 0`
- Same for user pool with `userPendingRewards`

### Paying Out A Staker

**`harvestRewards(user)`**

- Authorization: `msg.sender == user` OR `HARVESTER_ROLE`
- Computes:
  - `pending = amount * accRewardPerShare / PRECISION - rewardDebt` (per pool)
- Writes:
  - `rewardDebt = amount * accRewardPerShare / PRECISION`
- Transfers:
  - `token.transfer(user, pending)`
- Also:
  - `_reconcilePendingTreasuryWithdrawal(...)` may write down `pendingTreasuryWithdrawal` to keep it feasible

## ZKMerkleDistributor (Provider-Funded Claims)

**Purpose:** separate provider-funded distribution mechanism:

- Provider funds the distributor
- Provider submits Merkle roots with ZK proofs
- Users claim with Merkle proofs

### Key Variables

- `providerBalance[provider]`: **available** provider funds for new epochs
- `lockedBalance[provider]`: funds **reserved/locked** for active epochs
- `providerMerkleRoots[provider][]`: epoch records
- `claimed[provider][rootIndex][user]`: claim bitmap
- `stakingContract`: only used by Option B funding (`notifyRewardWithTransfer`)

### Funding

**Option A (production logs):** `depositBalance(amount)`

- Transfers tokens from provider wallet into distributor
- `providerBalance[msg.sender] += amount`

**Option B (supported, not used in current production path):** `notifyRewardWithTransfer(provider, amount)`

- Staking pulls tokens into distributor
- `providerBalance[provider] += amount`

### Locking To An Epoch

**`submitMerkleRoot(... totalClaimableAmount ...)`**

- Requires: `providerBalance[msg.sender] >= totalClaimableAmount`
- Moves:
  - `providerBalance -= totalClaimableAmount`
  - `lockedBalance += totalClaimableAmount`
- Persists epoch entry in `providerMerkleRoots[msg.sender]`

### User Claim

**`claim(provider, rootIndex, amount, proof)`**

- Validates proof + not claimed + within expiry/grace + epoch not closed
- Moves:
  - `lockedBalance[provider] -= amount`
  - `epoch.claimedAmount += amount`
- Transfers:
  - `token.transfer(user, amount)`

### Epoch Close

**`closeEpoch(provider, rootIndex)`** (admin-only)

- Returns unclaimed locked funds back to `providerBalance`

## Important Clarification (Common Confusion)

The staking “user pool” (12.5% emissions share) is **NOT** the ZK distributor.

- On-chain “user pool” rewards accrue to the **vault staker** (the vault is the staking address in the user pool).
- ZK distributor rewards are a **separate** mechanism funded by provider deposits (Option A) or (deprecated) staking transfers (Option B).

