# Myntis Smart Contract Security Audit Report (V6)

**Date**: January 31, 2026  
**Auditor**: AI-Assisted Security Analysis (manual review)  
**Scope**: Emissions + DualPoolStaking + LiquidStakingVault (accounting & logic)  
**Status**: PRE-MAINNET REVIEW

---

## Scope
Reviewed contracts:
- `token/contracts/EmissionsContract.sol`
- `token/contracts/DualPoolStaking.sol`
- `token/contracts/LiquidStakingVault.sol`

Not reviewed: other contracts, deployment scripts, or off-chain services/keepers.

---

## Executive Summary

**Total Issues Found**: 0 Critical + 0 High + 2 Medium + 2 Low = **4 Issues**

**Recommendation**: Address Medium issues or document operational/economic intent. Low items are best‑practice hardening.

### Severity Criteria
- **CRITICAL**: Direct loss of funds or global cap bypass
- **HIGH**: Economic exploit or irreversible operational risk
- **MEDIUM**: Misconfiguration risk, trust assumptions, or operational gaps
- **LOW**: Quality issues or best‑practice improvements

---

## 🟡 MEDIUM SEVERITY ISSUES (2)

### M-1: First‑Staker Windfall When Treasury Is Unset (Intentional)

**Contracts**: `DualPoolStaking.sol`, `EmissionsContract.sol`  
**Lines**: `syncEmissions`, `_updatePools`  
**Files**: `token/contracts/DualPoolStaking.sol`, `token/contracts/EmissionsContract.sol`

**Issue**:
If emissions are minted when no stakers exist and `treasury` is unset, rewards accumulate in pending pools. The first staker can capture these queued rewards.

**Impact**:
- First staker receives historical emissions

**Suggested Fix**:
Document as intended economics (owner confirmed), or divert to treasury when set.

**Status**: ⚠️ ACCEPTED BY DESIGN  
**Priority**: P2

---

### M-2: Emissions Distribution Depends on Harvest Activity

**Contracts**: `EmissionsContract.sol`, `DualPoolStaking.sol`  
**Issue**:
Pool accounting updates only when `harvest()` is called (it now calls `syncEmissions()`). If no one harvests, pool rewards remain stale.

**Impact**:
- Pending rewards and vault share price may lag real emissions

**Suggested Fix**:
Operationally accept the drift and rely on regular `harvest()` calls (which trigger `syncEmissions()`) to refresh pool accounting.

**Status**: ⚠️ ACCEPTED OPERATIONAL RISK  
**Priority**: P2

---

## 🔵 LOW SEVERITY ISSUES (2)

### L-1: Provider Accrued Emissions Can Drift If Additional Outflows Are Added Later

**Contract**: `DualPoolStaking.sol`  
**Issue**:
`providerAccruedEmissions` is decremented only by `fundProviderBalance()`. If future admin or emergency flows move rewards out, this counter will drift.

**Suggested Fix**:
Keep reward outflows confined to `fundProviderBalance()` or update the counter in any future outflow logic.

**Status**: ⚠️ BEST PRACTICE

---

### L-2: Vault totalAssets Depends on PendingRewards Accuracy

**Contracts**: `LiquidStakingVault.sol`, `DualPoolStaking.sol`  
**Issue**:
`totalAssets()` includes `pendingRewards(address(this))`; if rewards aren’t synced, share price may be stale.

**Suggested Fix**:
Document “harvest/sync required for up‑to‑date share pricing” or add periodic sync.

**Status**: ⚠️ BEST PRACTICE

---

## Testing Recommendations

1. **First‑Staker Flow**: Mint emissions before any stake, then stake and verify queued rewards
2. **Harvest‑Driven Sync**: Ensure `harvest()` triggers `syncEmissions()` and updates pools
3. **Vault Accounting**: Verify `totalAssets()` reflects pending rewards after harvest

---

## Deployment Checklist

- [ ] Confirm acceptance of first‑staker windfall behavior
- [x] Accept harvest-driven sync (no permissionless backup)
- [ ] Run Hardhat tests for emissions + staking flows

---

## Summary

**Critical Issues**: 0  
**High Issues**: 0  
**Medium Issues**: 2  
**Low Issues**: 2

**Ready for Mainnet**: After documenting M‑1 and accepting M‑2 policy.

---

**Disclaimer**: This is an AI-assisted analysis, not a formal third-party audit.

*Report Generated: January 31, 2026*  
*Methodology: Manual code review*  
*Reviewer: AI-assisted security analysis*  
*Next Review: After emissions/staking policy decisions*
