# Myntis Smart Contract Security Audit Report (V7)

**Date**: February 7, 2026  
**Auditor**: AI‑Assisted Security Analysis (manual review)  
**Scope**: Core contracts for Base Mainnet + cross‑chain components  
**Status**: PRE‑MAINNET REVIEW (post‑quota + emissions fixes)

---

## Scope
Reviewed contracts:
- `token/contracts/Myntis.sol`
- `token/contracts/DualPoolStaking.sol`
- `token/contracts/EmissionsContract.sol`
- `token/contracts/LiquidStakingVault.sol`
- `token/contracts/ZKMerkleDistributor.sol`
- `token/contracts/SpokeDistributor.sol`
- `token/contracts/GlobalSupplyRegistry.sol`
- `token/contracts/MyntisOFTSpoke.sol`
- `token/contracts/SpokeQuotaReceiver.sol`

Not reviewed: mocks, test‑only contracts, deployment scripts, off‑chain services/keepers.

---

## Executive Summary

**Total Issues Found**: 0 Critical + 0 High + 0 Medium + 2 Low = **2 Open Issues**

**Resolved Since V7**: M‑1, M‑2, M‑3, L‑1, L‑4 (see details below)

**Recommendation**: Remaining items are low‑severity operational / policy risks. Address or explicitly accept before mainnet.

### Severity Criteria
- **CRITICAL**: Direct loss of funds or major accounting breaks
- **HIGH**: Economic exploit or irreversible operational risk
- **MEDIUM**: Trust‑assumption or configuration risk
- **LOW**: Best‑practice or informational

---

## 🔴 CRITICAL SEVERITY ISSUES (0)

No critical issues identified in the current codebase.

---

## 🟡 MEDIUM SEVERITY ISSUES (3 total; 1 open)

### M‑1: `resetPendingRewards` Can Zero Real Liabilities
**Contract**: `DualPoolStaking.sol`  
**Function**: `resetPendingRewards()`

**Issue**:
Admin can wipe `providerPendingRewards` or `userPendingRewards` without moving tokens to treasury or otherwise settling liabilities.

**Impact**:
Trusted‑admin assumption: tokens can be re‑distributed inconsistently after a reset.

**Suggested Fix**:
- Gate behind timelock or explicit “emergency recovery” process
- Emit the exact amount reset for auditability

**Status**: ✅ FIXED (reset now moves amounts to `pendingTreasuryWithdrawal` and emits `PendingRewardsReset`)

---

### M‑2: Vault Share‑Price Timing Risk
**Contract**: `LiquidStakingVault.sol`  
**Function**: `totalAssets()`

**Issue**:
`totalAssets()` includes `pendingRewards()`. Users can deposit just before a large harvest and redeem after, capturing a disproportionate share of rewards.

**Impact**:
Economic “timing” advantage for opportunistic users. This is common in ERC‑4626 vaults but should be acknowledged.

**Suggested Fix**:
- Introduce harvest/compound scheduling or deposit cooldowns
- Or accept as known behavior and document it

**Status**: ✅ FIXED (vault now harvests pending rewards before deposit/mint/withdraw/redeem)

---

### M‑3: `providerProofVerified` Not Enforced in Claims
**Contract**: `ZKMerkleDistributor.sol`  
**Function**: `_claim()`

**Issue**:
Claims do not check `providerProofVerified`. Currently it is always set to `true` in `submitMerkleRoot`, but if a new epoch creation path is added in future upgrades, an unverified epoch could become claimable.

**Impact**:
Upgrade‑time risk; not exploitable in current code but fragile to future changes.

**Suggested Fix**:
Add `require(e.providerProofVerified)` in `_claim()`.

**Status**: ✅ FIXED (claims now require `providerProofVerified`)

---

## 🔵 LOW SEVERITY ISSUES (4 total; 2 open)

### L‑1: `SupplyUpdated` Delta Sign Is Ambiguous
**Contract**: `GlobalSupplyRegistry.sol`  
**Function**: `_handleQuotaRequest()` → `_applySupplyUpdate()`

**Issue**:
`SupplyUpdated` emits `supplyDelta` as an absolute value, losing direction (mint vs burn).

**Suggested Fix**:
Emit signed delta or add a boolean flag.

**Status**: ✅ FIXED (delta is now derived from old/new supply to avoid stale or misleading values; still absolute due to `uint256`)

---

### L‑2: `registerSpoke` Grants `SPOKE_ROLE` Using `bytes32`→`address` Conversion
**Contract**: `GlobalSupplyRegistry.sol`

**Issue**:
`_grantRole(SPOKE_ROLE, address(uint160(uint256(peer))))` assumes peer is a left‑padded EVM address. If peer encoding changes, role is granted to the wrong address.

**Suggested Fix**:
Treat `SPOKE_ROLE` as informational or document assumption.

---

### L‑3: Public `harvestRewards(address)` Callable by Anyone
**Contract**: `DualPoolStaking.sol`

**Issue**:
Anyone can trigger reward harvest for any user. Not a direct loss, but may trigger unwanted tax events or contract expectations.

**Suggested Fix**:
Optional: restrict to `msg.sender == user` or allow only trusted keepers.

---

### L‑4: `resetPendingRewards` Emits `RewardsQueued(0,0)` Only
**Contract**: `DualPoolStaking.sol`

**Issue**:
No event with the amount that was reset; harder to audit.

**Suggested Fix**:
Emit a specific event with the old value.

**Status**: ✅ FIXED (`PendingRewardsReset` includes the amount and new pending treasury total)

---

## Testing Recommendations

1. **Emissions Flow Accounting**: stake → harvest → fund provider balance → pool rewards → verify total balances reconcile.
2. **Reward Accounting**: stake → harvest → sync → claim; verify total rewards minted == total rewards distributed.
3. **Vault Timing**: deposit before harvest, redeem after; verify expected vs actual shares.

---

## Verdict

**Mainnet‑readiness is improved**: no critical issues identified in current code. Remaining Low items should be addressed or explicitly accepted before mainnet.

---

## Appendix: Remaining Fix Strategy (Optional)

1. **Vault timing risk**: Consider deposit cooldowns or scheduled compounding to reduce reward‑timing advantage.
2. **Spoke role assumption**: Document `bytes32` → `address` encoding expectation in `registerSpoke`.
3. **Public harvest**: If unwanted, restrict `harvestRewards(address)` to `msg.sender == user` or a keeper role.
