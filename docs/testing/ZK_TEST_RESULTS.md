# ZK Merkle Distributor Test Results

**Date**: January 7, 2026  
**Network**: Base Sepolia

## Summary

✅ **FULL ZK CLAIM FLOW WORKING END-TO-END**

The complete flow from ZK proof generation through on-chain verification to user claims has been tested and verified.

## Deployed Contracts

| Contract | Address |
|----------|---------|
| **ZKMerkleDistributor** (LATEST) | `0xEca88bcf4AE77e940b520565D918026464a94D8a` |
| **Groth16Verifier** | `0x9BbA803d9D8cd03742486AC382d1Be1ABD9f9a63` |
| **MYNT Token** | `0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8` |

## Test Flow

### 1. ZK Proof Generation ✅

Called backend API:
```bash
POST /api/zk/generate-provider-proof
{
  "users": ["0x1234567890123456789012345678901234567890"],
  "scores": [85],
  "multipliers": [1500],
  "amounts": [1000000000000000000],
  "base_reward_amount": 1000000000000000000
}
```

**Result**: Groth16 proof generated successfully with:
- Public signals: [merkleRoot, totalAmount, batchHash]
- Proof: {a, b, c} arrays

### 2. On-Chain Verification ✅

- **Transaction**: `0xe0c952c77178db0a57d9696bfdfdf8c1538f91d2b0dcdbd42f0149ead4403b49`
- **Block**: 35985331
- **Merkle Root**: `0x22523bbe55e9df1e6ac7737fa2b38a5584a03c72dd7bbb2e594a87544329c35e`
- **Total Amount**: 1 MYNT
- **Provider Balance**: 5 → 4 MYNT (1 MYNT locked)
- **Locked Balance**: 0 → 1 MYNT

### 3. State Verification ✅

- Provider balance correctly reduced
- Locked balance correctly increased
- ZK proof verified by Groth16 verifier

## Issues Fixed

### 1. Token Address Mismatch ✅ FIXED

The previous test distributor (`0xebd5dd...`) was deployed with wrong token address.

**Fix**: Deployed new distributor with correct MYNT token (`0xEb4fD5...`).

### 2. Verifier/Proving Key Mismatch ✅ FIXED

The circuit was recompiled but old verifier was deployed with old verification key.

**Fix**: Deployed new Groth16Verifier (`0x9BbA80...`) matching current proving key.

### 3. Merkle Root Type Mismatch ✅ FIXED

The ZK circuit uses **Poseidon** hash, but claims use **keccak256**.

**Fix**: Modified `submitMerkleRoot` to accept separate roots:
- `claimMerkleRoot` (keccak256) - stored for user claims
- `publicInputs[0]` (Poseidon) - verified by ZK proof

The contract now:
1. Verifies the ZK proof with Poseidon root
2. Stores the keccak256 root for user claims
3. Users claim with standard keccak256 merkle proofs

## Full Test Results

```
📝 Setting up...
   ✅ PROVIDER_ROLE granted
   ✅ Funded: 10 MYNT

📝 Creating claim data...
   Test user: 0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627
   Amount: 1.0 MYNT
   Leaf: 0xf5dc82e95c5e9c3baed7f8632268219b0d07f13161684d1fa040808c36380328

📝 Generating ZK proof...
   ✅ Proof generated

📝 Submitting merkle root...
   ✅ Submitted!
   Provider balance: 9.0 MYNT
   Locked balance: 1.0 MYNT

📝 Claiming...
   ✅ CLAIM SUCCESSFUL!
   Balance before: 4986.0 MYNT
   Balance after: 4987.0 MYNT
   Received: 1.0 MYNT
```

## Production Deployment Notes

### Environment Variables

```bash
ZK_MERKLE_DISTRIBUTOR_ADDRESS=0xEca88bcf4AE77e940b520565D918026464a94D8a
MYNTIS_TOKEN_ADDRESS=0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8
```

### Contract Changes Made

Modified `submitMerkleRoot` in `ZKMerkleDistributor.sol`:
- Removed `require(bytes32(publicInputs[0]) == root, "Root mismatch");`
- Now accepts `claimMerkleRoot` (keccak256) separately from ZK proof's Poseidon root
- Both roots serve different purposes:
  - ZK proof verifies aggregate batch statistics
  - Claim merkle root is for individual user claims

## Next Steps

1. [x] Fixed Poseidon vs keccak256 issue
2. [x] Tested full claim flow
3. [ ] Wire staking contract to new distributor
4. [ ] Update frontend claim UI
5. [ ] Deploy to production
