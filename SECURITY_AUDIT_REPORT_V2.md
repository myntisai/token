# Myntis Smart Contract Security Audit Report (V2)

**Date**: January 31, 2026  
**Auditor**: AI-Assisted Security Analysis (manual review)  
**Scope**: Core contracts for Base Mainnet + cross-chain components  
**Status**: PRE-MAINNET REVIEW

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
- `token/contracts/MyntisSpokeOFT.sol`

Not reviewed: mocks, test-only contracts, deployment scripts, or off-chain services/keepers.

---

## Executive Summary

**Total Issues Found**: 1 Critical + 2 High + 4 Medium + 3 Low = **10 Issues**

**Recommendation**: Fix Critical and High issues before mainnet. Medium issues should be addressed before enabling cross-chain functionality.

### Risk Breakdown
- **CRITICAL (1)**: Direct cap bypass / supply integrity failure
- **HIGH (2)**: Economic exploit or long-term security risk
- **MEDIUM (4)**: Misconfiguration risk, trust assumptions, or operational gaps
- **LOW (3)**: Code quality, clarity, or minor hardening

### Severity Criteria
- **CRITICAL**: Direct loss of funds or global cap bypass
- **HIGH**: Economic exploit or irreversible operational risk
- **MEDIUM**: Misconfiguration risk, trust/operational assumptions, or partial hardening
- **LOW**: Quality issues or best-practice improvements

---

## 🔴 CRITICAL SEVERITY ISSUES (1)

### C-1: Migration Bypasses Global Supply Registry (Global Cap Can Be Exceeded)

**Contract**: `Myntis.sol`  
**Lines**: 337-355  
**File**: `token/contracts/Myntis.sol`

**Issue**:
`migrateMint()` mints tokens without calling `globalSupplyRegistry.recordMint()` or `canMint()`.

**Impact**:
- Global supply registry becomes inconsistent with actual supply
- Cross-chain cap enforcement can be bypassed during migration
- If registry is used for cap enforcement, this is a direct cap violation

**Recommendation**:
Add the same registry checks used in `mint()` / `mintImmediate()`:
```solidity
if (address(globalSupplyRegistry) != address(0)) {
    if (!globalSupplyRegistry.canMint(amounts[i])) revert GlobalCapExceeded();
    globalSupplyRegistry.recordMint(amounts[i]);
}
```

**Status**: ✅ FIXED  
**Fix Effort**: 30 minutes  
**Priority**: P0 - Must fix before any cross-chain launch

---

## 🟠 HIGH SEVERITY ISSUES (2)

### H-1: Vault Share Price Dilution (Pending Rewards Excluded from totalAssets)

**Contract**: `LiquidStakingVault.sol`  
**Lines**: 210-222  
**File**: `token/contracts/LiquidStakingVault.sol`

**Issue**:
`totalAssets()` excludes pending staking rewards, even though these rewards are attributable to existing share holders.

**Impact**:
- New depositors can mint shares at an artificially low price
- Existing share holders are diluted (economic loss)

**Example**:
If there are large pending rewards and an attacker deposits before harvesting, they receive too many shares, then harvest/compound increases share value at others’ expense.

**Recommendation**:
Include pending rewards in `totalAssets()` or enforce harvest before mint/deposit:
```solidity
uint256 pending = IDualPoolStaking(dualPoolStaking).pendingRewards(address(this));
return idle + totalVaultDeposits + pending;
```

**Status**: ✅ FIXED  
**Fix Effort**: 30-60 minutes  
**Priority**: P0 - Must fix before mainnet

---

### H-2: Immutable ZK Verifier Prevents Key Rotation

**Contract**: `ZKMerkleDistributor.sol`  
**Line**: 46  
**File**: `token/contracts/ZKMerkleDistributor.sol`

**Issue**:
`batchVerifier` is immutable, so a new verification key (e.g., after an MPC ceremony) requires redeploying the contract and migrating balances.

**Impact**:
- No safe path to rotate verifier keys post-launch
- Long-term security risk if keys are compromised or updated

**Recommendation**:
Make the verifier upgradeable (admin setter or upgradeable proxy pattern).

**Status**: ✅ FIXED  
**Fix Effort**: 1-2 hours  
**Priority**: P1 - Strongly recommended

---

## 🟡 MEDIUM SEVERITY ISSUES (4)

### M-1: Unsafe Low-Level Call for Distributor Funding

**Contract**: `DualPoolStaking.sol`  
**Lines**: 421-448  
**File**: `token/contracts/DualPoolStaking.sol`

**Issue**:
`fundProviderBalance()` uses a low-level call and ignores return data.

**Impact**:
- Misconfigured distributor address or signature mismatch can silently succeed
- Caller may believe funds were credited when they were not

**Recommendation**:
Use a typed interface and revert on failure:
```solidity
IZKMerkleDistributor(zkMerkleDistributor).notifyRewardWithTransfer(provider, amount);
```

**Status**: ✅ FIXED  
**Fix Effort**: 1-2 hours  
**Priority**: P2

---

### M-2: Missing Contract Validation on Critical Addresses

**Contracts / Locations**:
- `DualPoolStaking.initialize()` (token/emissions not validated as contracts)  
  `token/contracts/DualPoolStaking.sol:119-134`
- `EmissionsContract.setStakingContract()` (no contract/interface check)  
  `token/contracts/EmissionsContract.sol:103-107`
- `LiquidStakingVault` constructor + `setDualPoolStaking()` (no zero/contract checks)  
  `token/contracts/LiquidStakingVault.sol:47-63`
- `Myntis.setGlobalSupplyRegistry()` (no contract check)  
  `token/contracts/Myntis.sol:420-423`

**Issue**:
Critical addresses can be set to EOAs or zero, which can brick functionality or disable cap checks.

**Impact**:
- Hard-to-recover misconfiguration in production
- Silent bypass of global cap enforcement if registry is set to EOA

**Recommendation**:
Add `code.length > 0` checks on all critical contract addresses and enforce non-zero on setters.

**Status**: ✅ FIXED  
**Fix Effort**: 1 hour  
**Priority**: P2

---

### M-3: Spoke Supply Enforcement Relies on Off-Chain Reporting

**Contracts**: `MyntisSpokeOFT.sol`, `MyntisOFTSpoke.sol`  
**Lines**: 342-415 (`MyntisSpokeOFT.sol`), 91-113 (`MyntisOFTSpoke.sol`)

**Issue**:
Spoke-side minting (including emergency mint) only emits events for supply reporting; the GlobalSupplyRegistry is updated off-chain via a keeper.

**Impact**:
- Temporary or permanent cap inconsistencies if reporting is missed
- Emergency minting can exceed global cap until reconciled

**Recommendation**:
Consider on-chain enforcement or mandatory registry update calls for supply-changing operations, or lock emergency mint behind pause + multisig.

**Status**: ⚠️ DESIGN RISK  
**Fix Effort**: 1-2 days (design decision)  
**Priority**: P2

---

### M-4: Unbounded Arrays in Emissions Migration

**Contract**: `EmissionsContract.sol`  
**Lines**: 120-147, 174-187  
**File**: `token/contracts/EmissionsContract.sol`

**Issue**:
Migration helper functions accept unbounded arrays, which can exceed block gas limits.

**Impact**:
- Migration can fail for large provider sets
- Operational risk during upgrades/migrations

**Recommendation**:
Add max batch limits or implement pagination.

**Status**: ✅ FIXED  
**Fix Effort**: 30-60 minutes  
**Priority**: P3

---

## 🔵 LOW SEVERITY ISSUES (3)

### L-1: Unused Role Constant

**Contract**: `LiquidStakingVault.sol`  
**Lines**: 32-55  
**Issue**: `STAKING_ROLE` is defined and granted but never used.

**Recommendation**: Remove unused role or enforce it for staking-only calls.

**Status**: ✅ FIXED

---

### L-2: Nullifier Not Bound to Merkle Leaf (Redundant State)

**Contract**: `SpokeDistributor.sol`  
**Lines**: 120-204  
**Issue**: `nullifier` is not derived from the Merkle leaf; `claimed` already prevents replay per user/root. Nullifier adds state without security value unless bound to the leaf.

**Recommendation**: Either bind nullifier to leaf (e.g., hash(claimant, amount, chainId)) or remove nullifier tracking to reduce state and complexity.

**Status**: ✅ FIXED

---

### L-3: Approval Pattern May Fail with Non-Standard ERC20s

**Contract**: `DualPoolStaking.sol`  
**Lines**: 440-448  
**Issue**: `approve` is called without zeroing allowance first. Some tokens (e.g., USDT) require reset to 0 before re-approval.

**Recommendation**: Use SafeERC20’s `safeIncreaseAllowance` or reset to 0 before setting a new allowance.

**Status**: ✅ FIXED

---

## Testing Recommendations

1. **Unit Tests**: Add tests for `migrateMint()` registry integration
2. **Economic Tests**: Vault share pricing with pending rewards (deposit/harvest/dilution scenario)
3. **Integration Tests**: Full staking lifecycle (stake → harvest → fund distributor → claim)
4. **Cross-Chain Tests**: Supply registry updates with nonces and out-of-order messages
5. **Upgrade Tests**: ZK verifier rotation / upgrade path if adopted

---

## Deployment Checklist

- [x] Fix C-1 (global supply registry in migration)
- [x] Fix H-1 (vault totalAssets accounting)
- [x] Decide mitigation for H-2 (verifier rotation strategy)
- [x] Add contract validation on setters/initializers (M-2)
- [ ] Review off-chain supply reporting guarantees for spokes (M-3)
- [ ] Run Slither + Foundry tests
- [ ] Deploy to Base Sepolia and test 1 week minimum
- [ ] Multisig + timelock for admin roles

---

## Summary

**Critical Issues**: 1 (fixed)  
**Fix Effort**: Completed for Critical + High items  
**Ready for Mainnet**: After confirming M-3 design decision and completing testnet validation

**Note on Cross-Chain**: If cross-chain supply caps are enforced, C-1 and M-3 are required before enabling spokes.

---

**Disclaimer**: This is an AI-assisted analysis, not a formal third-party audit. For high-value deployments, engage a professional auditor (e.g., Quantstamp, OpenZeppelin, Trail of Bits).

*Report Generated: January 31, 2026*  
*Methodology: Manual code review*  
*Reviewer: AI-assisted security analysis*  
*Next Review: After critical fixes are implemented*
