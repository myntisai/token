# Myntis Smart Contract Security Audit Report (V3)

**Date**: January 31, 2026  
**Auditor**: AI-Assisted Security Analysis (manual review)  
**Scope**: Core contracts for Base Mainnet + cross-chain components  
**Status**: PRE-MAINNET REVIEW (post-fix re-audit)

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

Not reviewed: mocks, test-only contracts, deployment scripts, or off-chain services/keepers.

---

## Executive Summary

**Total Issues Found**: 0 Critical + 1 High + 2 Medium + 2 Low = **5 Issues**

**Recommendation**: Address High issue before mainnet. Medium issues should be resolved before enabling cross-chain operations at scale.

### Severity Criteria
- **CRITICAL**: Direct loss of funds or global cap bypass
- **HIGH**: Economic exploit or irreversible operational risk
- **MEDIUM**: Misconfiguration risk, trust assumptions, or operational gaps
- **LOW**: Quality issues or best-practice improvements

---

## 🟠 HIGH SEVERITY ISSUES (1)

### H-1: ZK Proof Bypass Path Still Available (Admin Root Without Proof)

**Contract**: `ZKMerkleDistributor.sol`  
**Lines**: 269-307  
**File**: `token/contracts/ZKMerkleDistributor.sol`

**Issue**:
`submitMerkleRootWithoutProof()` allows an admin to publish epochs without a ZK proof.

**Impact**:
- ZK soundness guarantees are bypassed for those epochs
- If admin key is compromised or misused, users can receive arbitrarily incorrect reward distributions

**Recommendation**:
Remove the function for production builds, or hard-disable it via a permanent flag after migration. If you must keep it, gate it behind a timelock + multisig.

**Status**: ❌ NOT FIXED  
**Fix Effort**: 30 minutes  
**Priority**: P1

---

## 🟡 MEDIUM SEVERITY ISSUES (2)

### M-1: Spoke Supply Enforcement Relies on Off-Chain Reporting

**Contracts**: `MyntisSpokeOFT.sol`, `MyntisOFTSpoke.sol`  
**Lines**: 342-415 (`MyntisSpokeOFT.sol`), 91-113 (`MyntisOFTSpoke.sol`)

**Issue**:
Spoke-side supply changes only emit events; the GlobalSupplyRegistry is updated by an off-chain keeper.

**Impact**:
- Temporary cap inconsistencies if reporting is delayed
- Emergency minting can exceed global cap until reconciled

**Recommendation**:
Consider on-chain enforcement for critical mint paths or mandate immediate registry updates. At minimum, restrict emergency mint to timelock + multisig and document operational runbooks.

**Status**: ⚠️ DESIGN RISK  
**Fix Effort**: 1-2 days (design decision)  
**Priority**: P2

---

### M-2: Emergency Mint Bypasses Global Cap (Spoke)

**Contract**: `MyntisSpokeOFT.sol`  
**Lines**: 389-415  
**File**: `token/contracts/MyntisSpokeOFT.sol`

**Issue**:
`emergencyMint()` mints tokens directly on a spoke without any global cap enforcement; it only emits an event for later reconciliation.

**Impact**:
- Global cap can be exceeded if emergency mint is abused or misconfigured

**Recommendation**:
Add an optional on-chain cap check via registry (if feasible), or tightly constrain emergency mint to a multisig with explicit operational approvals.

**Status**: ⚠️ DESIGN RISK  
**Fix Effort**: 1 day  
**Priority**: P2

---

## 🔵 LOW SEVERITY ISSUES (2)

### L-1: Registry Recovery Functions Can Re-Open Replay Window

**Contract**: `GlobalSupplyRegistry.sol`  
**Lines**: 247-257  
**File**: `token/contracts/GlobalSupplyRegistry.sol`

**Issue**:
`resetChainNonce()` sets the nonce to 0, which can allow old in-flight messages to be accepted.

**Recommendation**:
Document strict operational use and consider adding a minimum nonce parameter or a pause-based workflow before reset.

**Status**: ⚠️ OPERATIONAL RISK

---

### L-2: Verifier Rotation Is Permissioned but Not Timelocked

**Contract**: `ZKMerkleDistributor.sol`  
**Line**: 122  
**File**: `token/contracts/ZKMerkleDistributor.sol`

**Issue**:
`setBatchVerifier()` is admin-controlled with no timelock or on-chain delay.

**Recommendation**:
Use a timelock or multi-sig guardian to reduce governance key risk and give users time to react.

**Status**: ⚠️ GOVERNANCE RISK

---

## Testing Recommendations

1. **ZK Controls**: Test production build with proofless submit removed/disabled
2. **Cross-Chain**: Simulate delayed supply reporting and ensure registry reconciliation
3. **Governance**: Validate timelock/multisig flows for verifier rotation and emergency mint

---

## Deployment Checklist

- [ ] Remove or permanently disable `submitMerkleRootWithoutProof()`
- [ ] Decide on on-chain cap enforcement strategy for spokes
- [ ] Finalize emergency mint governance controls
- [ ] Run Slither + Foundry tests
- [ ] Deploy to Base Sepolia and test 1 week minimum
- [ ] Multisig + timelock for admin roles

---

## Summary

**Critical Issues**: 0  
**High Issues**: 1  
**Medium Issues**: 2  
**Low Issues**: 2

**Ready for Mainnet**: After disabling proofless root submission and validating cross-chain supply governance.

---

**Disclaimer**: This is an AI-assisted analysis, not a formal third-party audit. For high-value deployments, engage a professional auditor.

*Report Generated: January 31, 2026*  
*Methodology: Manual code review*  
*Reviewer: AI-assisted security analysis*  
*Next Review: After high/medium fixes are implemented*
