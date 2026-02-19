# Myntis Smart Contract Security Audit Report (V5)

**Date**: January 31, 2026  
**Auditor**: AI-Assisted Security Analysis (manual review)  
**Scope**: Core contracts for Base Mainnet + cross-chain components  
**Status**: PRE-MAINNET REVIEW (post‑quota + emissions fixes)

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

**Total Issues Found**: 0 Critical + 0 High + 2 Medium + 2 Low = **4 Issues**

**Recommendation**: Address Medium issues before mainnet or document operational mitigations. Low items are best‑practice hardening.

### Severity Criteria
- **CRITICAL**: Direct loss of funds or global cap bypass
- **HIGH**: Economic exploit or irreversible operational risk
- **MEDIUM**: Misconfiguration risk, trust assumptions, or operational gaps
- **LOW**: Quality issues or best‑practice improvements

---

## 🟡 MEDIUM SEVERITY ISSUES (2)

### M-1: Quota Recovery Requires Manual Reconciliation

**Contract**: `GlobalSupplyRegistry.sol`  
**Lines**: `forceSupplySync`, `reseedChainSupply`, `setChainQuota`  
**File**: `token/contracts/GlobalSupplyRegistry.sol`

**Issue**:
Admin recovery paths can alter `chainSupply` and nonce state without automatically reconciling `chainQuota`/`totalReservedQuota`.

**Impact**:
- Quota accounting can drift after emergency recovery
- Quota grants may be overly conservative or blocked

**Suggested Fix**:
Add an admin helper that **resets both supply and quota in one call**, or update recovery functions to optionally accept a quota override.

**Status**: ⚠️ NOT FIXED  
**Priority**: P2

---

### M-2: Emissions Distribution Still Requires External Sync

**Contract**: `DualPoolStaking.sol` / `EmissionsContract.sol`  
**Lines**: `syncEmissions` vs. `harvest`  
**Files**: `token/contracts/DualPoolStaking.sol`, `token/contracts/EmissionsContract.sol`

**Issue**:
`syncEmissions()` is the only path that moves minted emissions into pool accounting, but it is not called inside `EmissionsContract.harvest()`.

**Impact**:
- Provider/user pool reward distribution can lag unless an external process calls `syncEmissions()`

**Suggested Fix**:
Call `DualPoolStaking.syncEmissions()` at the end of `EmissionsContract.harvest()` or add a direct hook callable by EmissionsContract after mint.

**Status**: ⚠️ NOT FIXED  
**Priority**: P2

---

## 🔵 LOW SEVERITY ISSUES (2)

### L-1: Quota Acknowledgment Is Best‑Effort

**Contract**: `SpokeQuotaReceiver.sol` / `MyntisSpokeOFT.sol`  
**Lines**: `confirmQuotaRequest` call  
**Files**: `token/contracts/SpokeQuotaReceiver.sol`, `token/contracts/MyntisSpokeOFT.sol`

**Issue**:
Quota confirmation uses `try/catch`, so pending request state can remain set if the call fails.

**Suggested Fix**:
Add a `retryConfirmQuota(nonce)` function on the spoke token or enforce strict revert on quota update failure.

**Status**: ⚠️ BEST PRACTICE

---

### L-2: Quota Request Payload Sends Full Supply

**Contract**: `MyntisSpokeOFT.sol` / `GlobalSupplyRegistry.sol`  
**Issue**:
Requests send the full `newTotalSupply` each time, which is safe but larger than needed.

**Suggested Fix**:
Send deltas for smaller payloads if message size becomes an issue.

**Status**: ⚠️ BEST PRACTICE

---

## Testing Recommendations

1. **Quota Recovery**: Recovery + quota reconciliation path
2. **Emission Sync**: `harvest()` followed by `syncEmissions()` accounting changes
3. **Quota Ack**: Force failure in confirm path and verify retry behavior

---

## Deployment Checklist

- [ ] Add quota‑recovery helper or runbook
- [ ] Decide on emissions sync automation
- [ ] Run Slither + Foundry tests
- [ ] Deploy to Base Sepolia and test 1 week minimum
- [ ] Multisig + timelock for admin roles

---

## Summary

**Critical Issues**: 0  
**High Issues**: 0  
**Medium Issues**: 2  
**Low Issues**: 2

**Ready for Mainnet**: After addressing M‑1/M‑2 or documenting operational mitigations.

---

**Disclaimer**: This is an AI-assisted analysis, not a formal third-party audit. For high-value deployments, engage a professional auditor.

*Report Generated: January 31, 2026*  
*Methodology: Manual code review*  
*Reviewer: AI-assisted security analysis*  
*Next Review: After medium fixes are implemented*
