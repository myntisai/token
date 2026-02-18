# Myntis Smart Contract Security Audit Report

**Date**: January 31, 2026  
**Auditor**: AI-Assisted Security Analysis  
**Scope**: All core contracts for Base Mainnet deployment  
**Status**: PRE-MAINNET AUDIT

---

## Executive Summary

**Total Issues Found**: 4 Critical + 6 High + 8 Medium + 7 Low = **25 Issues**

**Critical Recommendation**: Address Critical and High-priority issues before mainnet deployment.

### Risk Breakdown
- **CRITICAL (4)**: Immediate exploit risk or prevents future upgrades
- **HIGH (6)**: Significant security concerns requiring fixes
- **MEDIUM (8)**: Important improvements, recommend addressing
- **LOW (7)**: Best practices and code quality improvements

### Severity Criteria
- **CRITICAL**: Direct loss of funds possible OR prevents critical future functionality
- **HIGH**: Could lead to fund loss under specific conditions OR breaks core functionality
- **MEDIUM**: Reduces system robustness OR user experience issues
- **LOW**: Code quality, gas optimization, documentation

---

## 🔴 CRITICAL SEVERITY ISSUES (8)

### C-1: Immutable Verifier in ZKMerkleDistributor Prevents Key Upgrades

**Contract**: `ZKMerkleDistributor.sol`  
**Line**: 46  
**Severity**: CRITICAL

**Issue**:
```solidity
IGroth16Verifier public immutable batchVerifier;
```

The `batchVerifier` is immutable, preventing upgrades to MPC-generated keys post-launch. If you perform an MPC ceremony later, you **cannot upgrade** the verifier without redeploying the entire ZKMerkleDistributor and migrating all provider balances.

**Impact**:
- Cannot upgrade to MPC-secured ZK keys
- Must redeploy entire distributor to change verifier
- Breaks all existing provider balances and epochs
- Compromises long-term security model

**Recommendation**:
```solidity
// Make verifier upgradeable
IGroth16Verifier public batchVerifier;

function setBatchVerifier(address _batchVerifier) external onlyRole(ADMIN_ROLE) {
    require(_batchVerifier != address(0), "Invalid verifier");
    batchVerifier = IGroth16Verifier(_batchVerifier);
    emit BatchVerifierUpdated(_batchVerifier);
}
```

**Status**: ❌ NOT FIXED

---

### C-2: Unsafe Low-Level Call in fundProviderBalance

**Contract**: `DualPoolStaking.sol`  
**Lines**: 421-451  
**File**: `/token/contracts/DualPoolStaking.sol`

**Issue**:
The function uses a low-level call without validating return data:

```solidity
(bool success, ) = zkMerkleDistributor.call(
    abi.encodeWithSignature("notifyRewardWithTransfer(address,uint256)", provider, amount)
);
require(success, "Distributor funding failed");
```

**Impact**:
- No validation of return values from distributor
- Typos in function signature fail silently
- If distributor is malicious, could return `true` without executing correctly
- Tokens could be approved but not transferred

**Recommendation**:
```solidity
// Use typed interface
interface IZKMerkleDistributor {
    function notifyRewardWithTransfer(address provider, uint256 amount) external;
}

IZKMerkleDistributor public zkMerkleDistributor;

function fundProviderBalance(address provider, uint256 amount) external nonReentrant {
    // ... validation ...
    
    // Approve and call using interface (compile-time safety)
    token.approve(address(zkMerkleDistributor), amount);
    zkMerkleDistributor.notifyRewardWithTransfer(provider, amount);
}
```

**Status**: ❌ NOT FIXED

---

### C-3: Checks-Effects-Interactions Pattern Violation

**Contract**: `DualPoolStaking.sol`  
**Lines**: 652-678  
**File**: `/token/contracts/DualPoolStaking.sol`

**Issue**:
State updates happen AFTER external token transfer:

```solidity
function _harvestRewards(address user) internal {
    // ... calculate pending ...
    
    if (pending > 0) {
        token.safeTransfer(user, pending);  // EXTERNAL CALL FIRST
        emit RewardsHarvested(user, pending, userInfo_.poolType);
    }
    // State already updated earlier at lines 662, 668
}
```

**Impact**:
- While `nonReentrant` modifier protects most paths, violates CEI pattern
- If MYNT token ever adds hooks (ERC777-like), could enable reentrancy
- Makes future token upgrades risky

**Recommendation**:
Already correctly implemented (state updated at lines 662, 668 BEFORE transfer). This is actually **NOT** a vulnerability - the code follows CEI correctly. The transfer happens last.

**Status**: ✅ FALSE POSITIVE - Code is correct

---

### C-4: Missing Global Supply Check in Migration

**Contract**: `Myntis.sol`  
**Lines**: 336-356  
**File**: `/token/contracts/Myntis.sol`

**Issue**:
Migration minting doesn't check or update global supply registry:

```solidity
function migrateMint(
    address[] calldata recipients,
    uint256[] calldata amounts
) external onlyOwner {
    // ... per-iteration checks ...
    
    totalMintedEmissions += amounts[i];
    _mint(recipients[i], amounts[i]);
    
    // MISSING: No globalSupplyRegistry check or update
}
```

**Impact**:
- Could exceed 1B global cap if other chains have supply
- Breaks cross-chain supply accounting
- GlobalSupplyRegistry becomes inaccurate

**Recommendation**:
```solidity
for (uint256 i = 0; i < recipients.length; i++) {
    // ... existing checks ...
    
    // ADD: Check global cap
    if (address(globalSupplyRegistry) != address(0)) {
        if (!globalSupplyRegistry.canMint(amounts[i])) revert GlobalCapExceeded();
        globalSupplyRegistry.recordMint(amounts[i]);
    }
    
    totalMintedEmissions += amounts[i];
    _mint(recipients[i], amounts[i]);
}
```

**Status**: ❌ NOT FIXED

---


---

## 🟠 HIGH SEVERITY ISSUES (12)

### H-1: No Emergency Pause for EmissionsContract

**Contract**: `EmissionsContract.sol`

**Issue**: EmissionsContract lacks pausable functionality, unlike other contracts.

**Impact**: Cannot stop emissions during emergency.

**Recommendation**: Add Pausable and pause checks in `harvest()`.

---

### H-2: totalVaultDeposits Can Desync from Actual Stakes

**Contract**: `LiquidStakingVault.sol`  
**Lines**: 308, 322

**Issue**:
```solidity
totalVaultDeposits += amount;  // In _stakeInUserPool
totalVaultDeposits -= amount;  // In _unstakeFromUserPool
```

If `stakeToUserPool` or `unstakeFromUserPool` fail after approval but before state update, accounting breaks.

**Impact**: Incorrect `totalAssets()` calculation, wrong share pricing.

**Recommendation**: Use try-catch or validate actual staked amount from DualPoolStaking.

---

### H-3: Griefing Attack via RewardClaimVerifier

**Contract**: `RewardClaimVerifier.sol`  
**Lines**: 78-90

**Issue**: 
```solidity
function verifyAndUseProof(
    Proof memory proof,
    uint256[3] memory input
) external onlyRole(DISTRIBUTOR_ROLE) returns (bool) {
    verifyProof(proof, input);  // Can fail
    
    bytes32 nullifier = bytes32(input[1]);
    usedNullifiers[nullifier] = true;  // Marked even if proof invalid
    // ...
}
```

**Impact**: Attacker can burn nullifiers with invalid proofs, preventing legitimate claims.

**Recommendation**: Only mark nullifier if proof verifies successfully.

---

### H-4: Missing Rate Limiting on Batch Claims

**Contract**: `ZKMerkleDistributor.sol`  
**Lines**: 364-387

**Issue**: `batchClaim` allows up to 50 claims but no rate limiting per user.

**Impact**: Gas griefing, DOS by exhausting gas limits.

**Recommendation**: Add per-user rate limit or cooldown period.

---


---

### H-6: First Depositor Inflation Attack in LiquidStakingVault

**Contract**: `LiquidStakingVault.sol`  
**Lines**: 284-286

**Issue**:
```solidity
function _decimalsOffset() internal pure override returns (uint8) {
    return 3; // Provides protection against inflation attacks
}
```

While there's protection, it's only 1000x. A determined attacker with 1M tokens could still manipulate.

**Impact**: First depositor can manipulate share price to steal from later depositors.

**Recommendation**: Increase offset to 6 (1M protection) or add minimum first deposit requirement.

---

### H-7: No Validation of Proxy Implementation

**Contract**: `DualPoolStaking.sol`  
**Lines**: 700-704

**Issue**:
```solidity
function _authorizeUpgrade(address newImplementation) 
    internal 
    override 
    onlyRole(UPGRADER_ROLE) 
{}
```

No validation that `newImplementation` is a contract or compatible.

**Impact**: Could upgrade to EOA or incompatible contract, bricking the system.

**Recommendation**: Add contract existence and interface checks.

---

### H-8: Timestamp Dependency in Emissions

**Contract**: `EmissionsContract.sol`  
**Lines**: 252-261

**Issue**: Emission calculations use `block.timestamp` which miners can manipulate ±15 seconds.

**Impact**: Miners can game emission timing for extra rewards.

**Recommendation**: Use block number instead or accept the risk (common pattern).

---

### H-9: Missing Validation in setStakingContract

**Contract**: Multiple contracts

**Issue**: Setting staking contract doesn't verify it implements required interface.

**Impact**: Could set incompatible contract, breaking system.

**Recommendation**: Add interface checks via ERC-165 or try-catch interface calls.

---

### H-10: No Maximum Stake Limit

**Contract**: `DualPoolStaking.sol`

**Issue**: No upper limit on provider stakes.

**Impact**: Single provider could own >51% of pool, centralizing rewards.

**Recommendation**: Add maximum stake per provider or warn users.

---

### H-11: Missing Events for Critical State Changes

**Contract**: `EmissionsContract.sol`, `DualPoolStaking.sol`

**Issue**: Some state changes lack events (e.g., `correctAccountedEmissions`).

**Impact**: Difficult to track admin actions, transparency issues.

**Recommendation**: Add events for all admin functions.

---

### H-12: No Withdrawal Delay for Providers

**Contract**: `DualPoolStaking.sol`

**Issue**: Providers can unstake immediately without delay.

**Impact**: Providers can game reward periods by staking/unstaking quickly.

**Recommendation**: Add timelock (e.g., 7-day withdrawal delay) for providers.

---

## 🟡 MEDIUM SEVERITY ISSUES (15)

### M-1: Gas Griefing in Batch Operations

**Contract**: `ZKMerkleDistributor.sol`, `EmissionsContract.sol`

**Issue**: Batch operations could exceed block gas limit.

**Recommendation**: Add gas checks or reduce batch sizes.

---

### M-2: No Minimum Deposit Amount in Vault

**Contract**: `LiquidStakingVault.sol`

**Issue**: Users can deposit tiny amounts, cluttering state.

**Recommendation**: Add minimum deposit requirement (e.g., 1 MYNT).

---

### M-3: Missing Chain ID Validation

**Contract**: `ZKMerkleDistributor.sol`  
**Line**: 338

**Issue**: Merkle leaf includes `block.chainid` but no validation if contract is deployed on correct chain.

**Recommendation**: Store expected chain ID in constructor and validate.

---

### M-4: Potential DoS via Array Length

**Contract**: `EmissionsContract.sol`  
**Lines**: 139-144

**Issue**: `initializeMigration` iterates unbounded array.

**Recommendation**: Add maximum length check (e.g., 100 providers per batch).

---

### M-5: No Recovery Mechanism for Stuck Epochs

**Contract**: `ZKMerkleDistributor.sol`

**Issue**: If epoch expires and grace period passes, funds locked forever.

**Recommendation**: Add emergency recovery after extended period (e.g., 1 year).

---

### M-6: Centralization Risk - Single Admin Key

**Contracts**: ALL

**Issue**: Single admin address controls all critical functions.

**Recommendation**: Use Gnosis Safe multisig with timelock (you're planning this).

---

### M-7: No Slippage Protection on Compound

**Contract**: `LiquidStakingVault.sol`  
**Lines**: 192-208

**Issue**: `compoundRewards()` doesn't check if rewards are worth gas cost.

**Recommendation**: Add minimum reward threshold for compounding.

---

### M-8: Missing Input Validation for Arrays

**Contract**: Multiple

**Issue**: Functions accepting arrays don't validate lengths match.

**Recommendation**: Add `require(arr1.length == arr2.length)` checks.

---

### M-9: No Maximum Fee Cap in Myntis

**Contract**: `Myntis.sol`  
**Line**: 407

**Issue**:
```solidity
if (_newFee > 1000) revert FeeTooHigh(); // Max 10%
```

10% fee is very high for cross-chain transfers.

**Recommendation**: Lower max to 1% (100 basis points).

---

### M-10: Unchecked Arithmetic in View Functions

**Contracts**: Multiple

**Issue**: View functions like `pendingRewards` could overflow in calculations.

**Recommendation**: Add overflow checks even in view functions.

---


---

### M-12: Missing Zero Amount Checks

**Contracts**: Multiple

**Issue**: Some functions don't check for zero amounts before processing.

**Recommendation**: Add `require(amount > 0)` universally.

---

### M-13: No Circuit Breaker for Mass Withdrawals

**Contract**: `DualPoolStaking.sol`

**Issue**: If many providers unstake at once, could break reward distribution.

**Recommendation**: Add withdrawal rate limiting during emergencies.

---

### M-14: Potential Rounding Errors in Share Calculations

**Contract**: `LiquidStakingVault.sol`

**Issue**: ERC-4626 rounding could favor vault over users.

**Recommendation**: Use OpenZeppelin's rounding protection (check if using latest).

---

### M-15: No Versioning in Proxy Upgrades

**Contract**: `DualPoolStaking.sol`

**Issue**: No way to track which version of implementation is deployed.

**Recommendation**: Add version variable and emit in upgrade events.

---

## 🔵 LOW SEVERITY ISSUES (8)

### L-1: Missing NatSpec Documentation

**Contracts**: Most contracts

**Issue**: Many functions lack complete NatSpec comments.

**Recommendation**: Add full documentation for all public functions.

---

### L-2: Inconsistent Error Handling

**Contracts**: Multiple

**Issue**: Mix of `require`, `revert`, and custom errors.

**Recommendation**: Standardize on custom errors (gas efficient).

---

### L-3: Magic Numbers in Code

**Contracts**: Multiple

**Issue**: Hardcoded values like `1000`, `875`, `125` without constants.

**Recommendation**: Use named constants.

---

### L-4: Missing Zero Address Checks

**Contracts**: Some setters

**Issue**: Not all setter functions check for zero address.

**Recommendation**: Add universal zero address validation.

---

### L-5: Unused Imports

**Contracts**: Various

**Issue**: Some imports may be unused.

**Recommendation**: Clean up imports before deploy.

---

### L-6: Gas Optimization Opportunities

**Contracts**: Multiple

**Issue**: Could use `immutable` more, pack storage better.

**Recommendation**: Run gas optimization analysis.

---

### L-7: Missing Event Indexing

**Contracts**: Various

**Issue**: Some event parameters should be `indexed` for better filtering.

**Recommendation**: Index addresses and IDs in events.

---

### L-8: No Emergency Withdraw Function

**Contract**: `DualPoolStaking.sol`

**Issue**: If paused, users can't withdraw even in emergency.

**Recommendation**: Add emergency withdraw (forfeits rewards).

---

## Summary of Recommendations

### MUST FIX Before Mainnet (Critical):
1. ❌ Make batchVerifier upgradeable in ZKMerkleDistributor (C-1)
2. ❌ Use typed interfaces instead of low-level calls (C-2)
3. ❌ Add global supply registry checks in migration (C-4)

### SHOULD FIX Before Mainnet (High):
- Add pausable to EmissionsContract
- Fix totalVaultDeposits accounting
- Add rate limiting to batch operations
- Increase decimalsOffset in vault
- Add proxy implementation validation
- Add withdrawal delays for providers

### NICE TO HAVE (Medium/Low):
- Add minimum deposit amounts
- Improve documentation
- Optimize gas usage
- Add versioning
- Standardize error handling

---

## Testing Recommendations

1. **Fuzz Testing**: Use Echidna/Foundry for invariant testing
2. **Integration Tests**: Test full user journeys
3. **Upgrade Tests**: Verify UUPS upgrades work correctly
4. **Gas Tests**: Ensure operations stay under block gas limit
5. **Edge Cases**: Test with max values, zero values, boundary conditions

---

## Deployment Checklist

- [ ] Fix all CRITICAL issues
- [ ] Fix HIGH priority issues
- [ ] Deploy to testnet and test for 1 week minimum
- [ ] Run automated security tools (Slither, Mythril)
- [ ] Set up multisig for admin roles
- [ ] Configure timelock for critical operations
- [ ] Set up monitoring and alerts
- [ ] Prepare emergency response procedures
- [ ] Consider external audit ($20k-50k)

---

**Final Verdict**: Fix 4 critical issues before mainnet. All are code changes, no architectural redesign needed. Estimated time: **2-3 days**.

**Disclaimer**: This is an AI-assisted analysis, not a formal security audit by a certified firm. Consider engaging a professional auditor (Quantstamp, OpenZeppelin, Trail of Bits) for ~$20k-50k before mainnet launch.

---

*Report Generated: January 31, 2026*  
*Next Review: After critical fixes implemented*  
*Methodology: Manual code review + pattern analysis*
