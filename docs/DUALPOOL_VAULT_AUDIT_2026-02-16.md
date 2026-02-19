# Audit Notes: DualPoolStaking + LiquidStakingVault

Date: 2026-02-16

Scope:

- `token/contracts/DualPoolStaking.sol`
- `token/contracts/LiquidStakingVault.sol`

This is not a formal 3rd-party audit. It is an engineering review focused on correctness, invariants, and common Solidity failure modes.

## Executive Summary

- **No obvious unauthenticated fund-drain** was found in the reviewed contracts, assuming admin roles are controlled by your multisig.
- The biggest risks are **governance/configuration mistakes** (miswiring vault/staking/distributor/emissions) and **token accounting assumptions** (standard ERC20 approve semantics, allowance handling).
- Vault compounding is **not automatic**; it is **interaction-driven** and only compounds newly harvested rewards, not any pre-existing idle.

## High Severity

### 1. `setLiquidStakingVault()` can be pointed to an EOA; `unstakeFromUserPool()` then pays that address

File: `token/contracts/DualPoolStaking.sol`

Why it matters:

- `stakeToUserPool()` / `unstakeFromUserPool()` are gated by `require(msg.sender == liquidStakingVault, ...)`.
- `unstakeFromUserPool()` always transfers principal to `liquidStakingVault` (the caller identity), not to `user`.
- If `DEFAULT_ADMIN_ROLE` ever points `liquidStakingVault` to a wrong address (including an EOA), that address can call `unstakeFromUserPool()` for the vault-owned user position and receive the withdrawn MYNT.

Impact:

- This is a **configuration/governance footgun**: not exploitable without admin power, but catastrophic if misconfigured.

Recommendation:

- Add `require(_liquidStakingVault.code.length > 0, "Vault not a contract");` in `setLiquidStakingVault`.
- Consider also validating that the vault claims to be wired to this staking contract (e.g. a `dualPoolStaking()` check) during wiring.

## Medium Severity

### 2. `fundProviderBalance()` uses monotonically increasing allowance to the distributor

File: `token/contracts/DualPoolStaking.sol`

Code path:

- `token.safeIncreaseAllowance(zkMerkleDistributor, amount);`
- `IZKMerkleDistributor(zkMerkleDistributor).notifyRewardWithTransfer(provider, amount);`

Why it matters:

- Allowance can accumulate over time.
- If the distributor contract is upgraded/replaced with a buggy/malicious implementation, it can potentially `transferFrom` more than the intended amount.

Recommendation:

- Prefer “exact approve then reset” patterns, or `forceApprove`-style logic (OpenZeppelin) to set allowance to `amount` before the call and back to `0` after.
- Alternatively, use a distributor API that pulls no funds and instead have staking push funds via `safeTransfer`.

### 3. Vault uses raw `IERC20.approve()` (not SafeERC20 forceApprove); can break on some ERC20s

File: `token/contracts/LiquidStakingVault.sol`

Code:

- `IERC20(asset()).approve(dualPoolStaking, amount);`
- `IERC20(asset()).approve(dualPoolStaking, 0);`

Why it matters:

- Some ERC20s (e.g. older USDT patterns) require allowance to be set to 0 before changing to a non-zero value and/or return `false` instead of reverting.
- You likely control the MYNT token so this is probably fine, but it is still an ERC20-compatibility assumption.

Recommendation:

- Use `SafeERC20` and `forceApprove` semantics (or set 0 then set amount with checks) to be robust.

### 4. Vault emits `RewardsCompounded` in `harvestVaultRewards()` even though it doesn’t compound

File: `token/contracts/LiquidStakingVault.sol`

Why it matters:

- Off-chain indexers / UIs can misinterpret “compounded” as “re-staked”.

Recommendation:

- Emit a dedicated event for harvest vs compound (`RewardsHarvested`, `RewardsCompounded`).

## Low Severity / Correctness Notes

### 5. Vault is “auto-harvest on interaction”, not “auto-compound”

File: `token/contracts/LiquidStakingVault.sol`

Behavior:

- `deposit/mint/withdraw/redeem` call `_harvestPendingRewards()` first (harvest to vault idle).
- Only `compoundRewards()` re-stakes harvested rewards.
- Existing vault idle balance is not staked by `compoundRewards()`; only the freshly harvested delta is staked.

Impact:

- Shared idle can grow, reducing yield until someone calls `compoundRewards()` (or you add a keeper).

Recommendation:

- Add a permissionless `stakeIdle(uint256 amount)` or update `compoundRewards()` to stake *all* idle.

### 6. MasterChef-style accounting depends on correct reward debt initialization on upgrades

File: `token/contracts/DualPoolStaking.sol`

Observation:

- You have reinitializers (e.g. `reinitializeV4SyncRewardDebt`) to rebaseline `rewardDebt`.

Impact:

- Any upgrade that changes `accRewardPerShare` interpretation must either migrate `rewardDebt` correctly or accept that historical pending is not claimable and needs a separate compensation plan.

### 7. UI/ops must treat Provider emissions (Option B) and Pool rewards as separate flows

File: `token/contracts/DualPoolStaking.sol`

Observation:

- `harvestRewards(user)` pays pool rewards (via `accRewardPerShare`).
- `fundProviderBalance(provider, amount)` moves `providerAccruedEmissions` to the distributor.

If you pay providers by funding distributors, that is **not** the same as pool rewards harvest.

## Invariants To Monitor (Recommended)

These are the “health checks” that detect drift early:

1. Staking solvency:

- `token.balanceOf(staking) >= providerPool.totalStaked + userPool.totalStaked + providerPendingRewards + userPendingRewards + totalProviderAccruedEmissions`

2. Vault wiring correctness:

- `LiquidStakingVault.dualPoolStaking() == DualPoolStaking proxy address`
- `DualPoolStaking.liquidStakingVault() == LiquidStakingVault address`

3. Vault accounting sanity:

- `totalAssets() == idle + totalVaultDeposits + pendingRewards(vault)`

## What I Would Change Next (Pragmatic)

1. Harden wiring setters:

- add code-length checks and cross-contract “handshake” checks on `setLiquidStakingVault`, and ideally on the vault side too.

2. Fix allowance patterns in `fundProviderBalance`:

- avoid accumulating allowances to external contracts.

3. Add “stake idle” path to the vault:

- enable permissionless compounding of idle (or keeper).

