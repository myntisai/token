# Myntis Smart Contract Security Audit Report (V4)

**Date**: January 31, 2026  
**Auditor**: AI-Assisted Security Analysis (manual review)  
**Scope**: Core contracts for Base Mainnet + cross-chain components  
**Status**: PRE-MAINNET REVIEW (post‑quota implementation)

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
- `token/contracts/MyntisSpokeOFT.sol`
- `token/contracts/MyntisOFTSpoke.sol`
- `token/contracts/SpokeQuotaReceiver.sol`

Not reviewed: mocks, test-only contracts, deployment scripts, or off-chain services/keepers.

---

## Executive Summary

**Total Issues Found**: 2 Critical + 0 High + 1 Medium + 1 Low = **4 Issues**

**Recommendation**: Address Critical emissions/staking issues before mainnet. Medium/Low items are best-practice hardening.

### Severity Criteria
- **CRITICAL**: Direct loss of funds or global cap bypass
- **HIGH**: Economic exploit or irreversible operational risk
- **MEDIUM**: Misconfiguration risk, trust assumptions, or operational gaps
- **LOW**: Quality issues or best-practice improvements

---

## 🔴 CRITICAL SEVERITY ISSUES (2)

### C-1: New Provider Debt Initialized Before Stake Is Recorded

**Contracts**: `DualPoolStaking.sol`, `EmissionsContract.sol`  
**Lines**: `DualPoolStaking.sol:252-268`, `EmissionsContract.sol:198-226`

**Issue**:
`initializeNewProvider()` is called **before** the provider’s stake is recorded. The emissions contract reads stake=0 and initializes debt to `1`, which allows a new provider to later harvest historical emissions.

**Impact**:
- New providers can claim historical emissions they did not earn

**Recommendation**:
Move `initializeNewProvider()` **after** the stake is recorded (post-transfer, post `user.amount += amount`) or pass the staked amount as a parameter.

**Status**: ✅ FIXED  
**Priority**: P0

---

### C-2: Emissions Minted to Staking Are Not Attributed Per Provider

**Contracts**: `EmissionsContract.sol`, `DualPoolStaking.sol`  
**Lines**: `EmissionsContract.sol:349-355`, `DualPoolStaking.sol:429-446`

**Issue**:
Emissions are minted to the staking contract, but `fundProviderBalance()` only checks global available balance. Any provider can drain all minted emissions to their distributor balance.

**Impact**:
- Emissions can be misallocated to a single provider

**Recommendation**:
Track per‑provider accrued emissions (e.g., `providerAccrued[provider]`) and enforce `amount <= providerAccrued[provider]`.

**Status**: ✅ FIXED  
**Priority**: P0

---

## 🟡 MEDIUM SEVERITY ISSUES (1)

### M-1: Quota Updates Require Hub Registry to Be Pre‑Funded

**Contract**: `GlobalSupplyRegistry.sol`  
**Lines**: `_sendQuotaUpdate` (around the new quota logic)  
**File**: `token/contracts/GlobalSupplyRegistry.sol`

**Issue**:
Quota requests trigger a registry‑to‑spoke message. If the registry lacks native funds for LZ fees, the quota request reverts and **supply updates in that message are not applied**.

**Impact**:
- Quota requests can fail unexpectedly
- Registry supply can go stale if requests are rejected

**Recommendation**:
1) Always fund the hub registry with native gas, and  
2) Consider decoupling supply updates from quota updates so a quota send failure does not revert supply accounting.

**Status**: ✅ FIXED  
**Priority**: P2

---

### M-2: Admin Recovery Functions Do Not Reconcile Quota Accounting

**Contract**: `GlobalSupplyRegistry.sol`  
**Lines**: `forceSupplySync`, `reseedChainSupply`, `resetChainNonce`  
**File**: `token/contracts/GlobalSupplyRegistry.sol`

**Issue**:
Admin recovery paths can alter `chainSupply` and nonces but **do not adjust** `chainQuota` or `totalReservedQuota`.

**Impact**:
- Quota accounting can desync after emergency recovery
- Future quota grants may be blocked or overly conservative

**Recommendation**:
Add admin helpers to reset or reconcile quotas during emergency recovery.

**Status**: ✅ FIXED  
**Priority**: P2

---

## 🔵 LOW SEVERITY ISSUES (1)

### L-1: Quota Consumption Reporting Is Optimistic

**Contract**: `MyntisSpokeOFT.sol`  
**Lines**: `requestMintQuota`, `_consumeQuota`  
**File**: `token/contracts/MyntisSpokeOFT.sol`

**Issue**:
`quotaConsumedSinceLastRequest` resets after sending the LZ message, even if the message fails or is delayed.

**Impact**:
- Registry may not reflect consumption immediately (conservative, not unsafe)

**Recommendation**:
Optionally reset only after receiving a quota update, or persist a pending‑request flag for retries.

**Status**: ✅ FIXED

---

### L-1: Quota Request Payload Uses Total Supply (Not Delta)

**Contract**: `MyntisSpokeOFT.sol` / `GlobalSupplyRegistry.sol`  
**Lines**: quota request handling  
**Issue**:
Requests send the full `newTotalSupply` each time. This is fine, but can be large and repeated. Consider sending deltas to reduce payload size if needed.

**Status**: ⚠️ BEST PRACTICE

---

## Testing Recommendations

1. **Emissions**: new provider staking → initialize debt after stake recording
2. **Emissions**: provider‑specific accrual vs. fundProviderBalance limits
3. **Quota Flow**: request → registry grant → receiver update → mint consumes quota

---

## Deployment Checklist

- [x] Fund hub registry with native token for outbound LZ fees
- [x] Add quota reconciliation helper for emergency recovery
- [ ] Fix emissions initialization order (C‑1)
- [ ] Add per‑provider emission accrual checks (C‑2)
- [ ] Run Slither + Foundry tests
- [ ] Deploy to Base Sepolia and test 1 week minimum
- [ ] Multisig + timelock for admin roles

---

## Summary

**Critical Issues**: 2  
**High Issues**: 0  
**Medium Issues**: 1  
**Low Issues**: 1

**Ready for Mainnet**: After testnet validation of emissions + staking flows.

---

**Disclaimer**: This is an AI-assisted analysis, not a formal third-party audit. For high-value deployments, engage a professional auditor.

*Report Generated: January 31, 2026*  
*Methodology: Manual code review*  
*Reviewer: AI-assisted security analysis*  
*Next Review: After medium fixes are implemented*
