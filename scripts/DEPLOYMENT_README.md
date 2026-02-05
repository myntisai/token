# Final Testnet Deployment Scripts

## Overview

This directory contains comprehensive deployment scripts for the Myntis token ecosystem with all security fixes applied.

## Scripts

### 1. `deploy-final-testnet-fresh.ts`

**Complete fresh deployment** of all core contracts with security fixes.

**What it does:**
- ✅ Deploys 7 core hub contracts (Myntis, Staking, Emissions, Distributor, etc.)
- ✅ Initializes all UUPS proxies
- ✅ Grants all necessary roles (MINTER_ROLE, ADMIN_ROLE, PROVIDER_ROLE)
- ✅ Wires contracts together (emissions ↔ staking ↔ distributor)
- ✅ Optionally migrates balances from old contract
- ✅ Verifies all contracts on Basescan
- ✅ Generates updated `.env.prod` with all addresses
- ✅ Saves deployment summary JSON

**Usage:**
```bash
# Basic deployment (no migration)
npx hardhat run scripts/deploy-final-testnet-fresh.ts --network base-sepolia

# With balance migration
MIGRATE_BALANCES=true OLD_TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy-final-testnet-fresh.ts --network base-sepolia

# Skip verification (faster for testing)
VERIFY_CONTRACTS=false npx hardhat run scripts/deploy-final-testnet-fresh.ts --network base-sepolia
```

**Environment Variables:**
```bash
# Required
PRIVATE_KEY=0x...                    # Deployer private key
LZ_ENDPOINT=0x...                    # LayerZero V2 endpoint

# Optional (for migration)
MIGRATE_BALANCES=true                # Enable balance migration
OLD_TOKEN_ADDRESS=0x...              # Old Myntis contract
OLD_STAKING_ADDRESS=0x...            # Old staking contract

# Optional (for verification)
VERIFY_CONTRACTS=true                # Verify on Basescan (default: true)
BASESCAN_API_KEY=...                 # Basescan API key
```

**Outputs:**
1. `./deployments/deployment-base-sepolia-latest.json` - Deployment summary
2. `./deployments/deployment-base-sepolia-TIMESTAMP.json` - Timestamped backup
3. `../../.env.prod` - Updated environment variables
4. `../../.env.prod.backup` - Backup of old environment file

---

### 2. `snapshot-balances-for-migration.ts`

**Snapshot token holder balances** from an existing contract for migration.

**What it does:**
- ✅ Fetches all Transfer events from old contract
- ✅ Identifies all unique holders
- ✅ Queries current balances for all holders
- ✅ Optionally fetches staking stats
- ✅ Saves snapshot JSON for migration script
- ✅ Verifies total supply matches

**Usage:**
```bash
# Basic snapshot
OLD_TOKEN_ADDRESS=0x... npx hardhat run scripts/snapshot-balances-for-migration.ts --network base-sepolia

# With staking data
OLD_TOKEN_ADDRESS=0x... OLD_STAKING_ADDRESS=0x... npx hardhat run scripts/snapshot-balances-for-migration.ts --network base-sepolia
```

**Environment Variables:**
```bash
# Required
OLD_TOKEN_ADDRESS=0x...              # Old Myntis contract to snapshot

# Optional
OLD_STAKING_ADDRESS=0x...            # Old staking contract (for staking stats)
```

**Outputs:**
1. `./deployments/migration-snapshot-latest.json` - Latest snapshot
2. `./deployments/migration-snapshot-TIMESTAMP.json` - Timestamped backup

**Snapshot Format:**
```json
{
  "timestamp": "2026-02-04T00:00:00.000Z",
  "blockNumber": 12345678,
  "oldTokenAddress": "0x...",
  "holders": [
    {
      "address": "0x...",
      "balance": "1000.0",
      "balanceWei": "1000000000000000000000"
    }
  ],
  "totalHolders": 150,
  "totalSupply": "10000000.0",
  "totalSupplyWei": "10000000000000000000000000",
  "stakingStats": {
    "totalStaked": "500000.0",
    "totalStakedWei": "500000000000000000000000",
    "stakerCount": 75
  }
}
```

---

## Deployment Flow

### Option A: Fresh Deployment (No Migration)

**Step 1:** Deploy contracts
```bash
npx hardhat run scripts/deploy-final-testnet-fresh.ts --network base-sepolia
```

**Step 2:** Update claim-generation-service
```bash
# Copy addresses from .env.prod to claim-generation-service/.env
cp .env.prod claim-generation-service/.env.prod
```

**Step 3:** Update frontend
```bash
# Update frontend/.env with new distributor address
echo "NEXT_PUBLIC_ZK_MERKLE_DISTRIBUTOR_V2_ADDRESS=0x..." >> frontend/.env.prod
```

**Step 4:** Test
```bash
# Test staking flow
npx hardhat run scripts/test-staking-flow.ts --network base-sepolia

# Test distribution flow
npx hardhat run scripts/test-distribution-flow.ts --network base-sepolia
```

---

### Option B: Fresh Deployment with Migration

**Step 1:** Snapshot old contract balances
```bash
OLD_TOKEN_ADDRESS=0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55 \
npx hardhat run scripts/snapshot-balances-for-migration.ts --network base-sepolia
```

**Step 2:** Review snapshot
```bash
cat deployments/migration-snapshot-latest.json | jq '.totalHolders, .totalSupply'
```

**Step 3:** Deploy with migration
```bash
MIGRATE_BALANCES=true \
OLD_TOKEN_ADDRESS=0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55 \
npx hardhat run scripts/deploy-final-testnet-fresh.ts --network base-sepolia
```

**Step 4:** Verify migration
```bash
# Check new contract supply matches old supply
npx hardhat run scripts/verify-migration.ts --network base-sepolia
```

**Step 5:** Update services (same as Option A)

---

## Deployed Contracts

After deployment, you'll have these contracts:

### Hub Contracts (Base Sepolia)

| Contract | Type | Purpose |
|----------|------|---------|
| **Myntis** | UUPS Proxy | Hub token contract |
| **DualPoolStaking** | UUPS Proxy | Staking with 80/20 reward split |
| **EmissionsContract** | Standard | Token emissions management |
| **ZKMerkleDistributor** | UUPS Proxy | Hub distributor with ZK proofs |
| **GlobalSupplyRegistry** | Standard | Cross-chain supply tracking |
| **LiquidStakingVault** | UUPS Proxy | ERC-4626 liquid staking vault |
| **Groth16Verifier** | Standard | ZK proof verifier |

### Configuration

All contracts are automatically configured with:
- ✅ Proper role assignments (MINTER, ADMIN, PROVIDER)
- ✅ Cross-contract references (emissions → staking → distributor)
- ✅ LayerZero endpoints
- ✅ GlobalSupplyRegistry integration

---

## Verification

Contracts are automatically verified on Basescan during deployment. If verification fails:

**Manual Verification:**
```bash
npx hardhat verify --network base-sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

**For Proxies:**
```bash
# Implementation contracts are auto-verified
# Proxy contracts are auto-verified by Hardhat upgrades plugin
```

---

## Troubleshooting

### Issue: "Insufficient funds for deployment"

**Solution:** Fund deployer address with more ETH
```bash
# Check balance
npx hardhat run scripts/check-balance.ts --network base-sepolia

# Fund address
# Send ETH from faucet or another wallet
```

### Issue: "Contract verification failed"

**Solution:** Verify manually
```bash
# Get deployment addresses
cat deployments/deployment-base-sepolia-latest.json | jq '.myntis, .dualPoolStaking'

# Verify each contract
npx hardhat verify --network base-sepolia <ADDRESS>
```

### Issue: "Migration snapshot shows incorrect supply"

**Solution:** Re-snapshot at specific block
```bash
# Check current supply on old contract
npx hardhat console --network base-sepolia
> const token = await ethers.getContractAt("Myntis", "0x...")
> await token.totalSupply()

# Re-snapshot
OLD_TOKEN_ADDRESS=0x... npx hardhat run scripts/snapshot-balances-for-migration.ts --network base-sepolia
```

### Issue: "Deployment interrupted"

**Solution:** Script is idempotent, but if you need to clean up:
```bash
# Check what was deployed
ls -la deployments/

# If needed, start fresh (will deploy new contracts)
npx hardhat run scripts/deploy-final-testnet-fresh.ts --network base-sepolia
```

---

## Post-Deployment Checklist

After successful deployment:

- [ ] ✅ All contracts deployed and verified on Basescan
- [ ] ✅ `.env.prod` updated with new addresses
- [ ] ✅ `claim-generation-service` updated with new addresses
- [ ] ✅ `frontend` updated with new distributor address
- [ ] ✅ Test staking flow on testnet
- [ ] ✅ Test distribution flow on testnet
- [ ] ✅ Test claim flow on frontend
- [ ] ✅ Monitor `staking.js` cron service logs
- [ ] ✅ Verify 80/20 split is working correctly
- [ ] ✅ Update `CONTRACT_DEPLOYMENT_HISTORY.md`

---

## Security Notes

⚠️ **Important:**
- All deployed contracts include security fixes from `SECURITY_AUDIT_REPORT_V6.md`
- Deployer address receives all admin roles initially
- Consider transferring admin roles to multisig for mainnet
- Private keys should NEVER be committed to git

🔒 **Best Practices:**
- Use hardware wallet for mainnet deployments
- Test thoroughly on testnet before mainnet
- Keep backups of all deployment files
- Document all deployed addresses in `CONTRACT_DEPLOYMENT_HISTORY.md`

---

## Support

For issues or questions:
1. Check `SECURITY_AUDIT_REPORT_V6.md` for known issues
2. Review `CONTRACTS_CLEANUP_SUMMARY.md` for architecture changes
3. Check `REWARD_DISTRIBUTION_FLOW.md` for flow documentation
4. Refer to `MAINNET_READINESS_CHECKLIST.md` for deployment requirements

---

**Last Updated:** February 4, 2026  
**Script Version:** 1.0.0  
**Compatible with:** Hardhat 2.x, Solidity 0.8.22
