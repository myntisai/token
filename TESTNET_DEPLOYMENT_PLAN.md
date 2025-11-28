# Myntis Multi-Chain Testnet Deployment Plan

## ✅ Status: Proper LayerZero V2 OFT Implementation

**Updated**: November 2024 - Now using official LayerZero V2 OFT standard!

### Contracts
- `MyntisOFT.sol` - Hub token on Base (proper OFT with minting)
- `MyntisOFTSpoke.sol` - Spoke tokens (proper OFT, no minting)

### Key Benefits
- ✅ Standard `send()` / `quoteSend()` interface
- ✅ Compatible with LayerZero tooling
- ✅ Proper DVN/Executor configuration
- ✅ Gas estimation built-in
- ✅ Cross-chain composability

---

## Overview

This plan covers deploying Myntis OFT tokens across multiple EVM testnets supported by LayerZero V2 for cross-chain interoperability testing.

---

## 🎯 Target Testnets

### Hub Chain (All staking, emissions, governance)
| Chain | Network | Chain ID | LZ EID | Status |
|-------|---------|----------|--------|--------|
| Base Sepolia | base-sepolia | 84532 | 40245 | ✅ Already Deployed |

### Spoke Chains (Simple OFT for liquidity/transfers)
| Chain | Network | Chain ID | LZ EID | Priority |
|-------|---------|----------|--------|----------|
| Ethereum Sepolia | ethereum-sepolia | 11155111 | 40161 | P0 - Essential |
| Arbitrum Sepolia | arbitrum-sepolia | 421614 | 40231 | P0 - Essential |
| Optimism Sepolia | optimism-sepolia | 11155420 | 40232 | P1 - High |
| Polygon Amoy | polygon-amoy | 80002 | 40267 | P1 - High |
| BSC Testnet | bsc-testnet | 97 | 40102 | P2 - Optional |
| Linea Sepolia | linea-sepolia | 59141 | 40287 | P2 - Optional |
| Scroll Sepolia | scroll-sepolia | 534351 | 40214 | P2 - Optional |
| zkSync Era Sepolia | zksync-sepolia | 300 | 40305 | P3 - Future |

> **Note**: Mumbai is deprecated. Polygon uses Amoy now. Update your config!

---

## 🪙 Step 1: Get Testnet ETH

### Estimated ETH Needed Per Chain
- **Deployment**: ~0.01-0.05 ETH
- **Cross-chain testing**: ~0.01-0.02 ETH  
- **Buffer for failed txs**: ~0.01 ETH
- **Total per chain**: ~0.05-0.1 ETH

### Faucet Links (Bookmark These!)

#### Ethereum Sepolia (0.5 ETH/day)
- **Alchemy**: https://www.alchemy.com/faucets/ethereum-sepolia ⭐ Best
- **QuickNode**: https://faucet.quicknode.com/ethereum/sepolia
- **Google Cloud**: https://cloud.google.com/application/web3/faucet/ethereum/sepolia
- **Infura**: https://www.infura.io/faucet/sepolia

#### Arbitrum Sepolia
- **Alchemy**: https://www.alchemy.com/faucets/arbitrum-sepolia ⭐ Best
- **QuickNode**: https://faucet.quicknode.com/arbitrum/sepolia
- **Official**: https://faucet.arbitrum.io/

#### Optimism Sepolia
- **Superchain**: https://app.optimism.io/faucet ⭐ Best
- **QuickNode**: https://faucet.quicknode.com/optimism/sepolia
- **Alchemy**: https://www.alchemy.com/faucets/optimism-sepolia

#### Base Sepolia
- **Coinbase**: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet ⭐ Best
- **Alchemy**: https://www.alchemy.com/faucets/base-sepolia
- **QuickNode**: https://faucet.quicknode.com/base/sepolia

#### Polygon Amoy (Replaces Mumbai!)
- **Alchemy**: https://www.alchemy.com/faucets/polygon-amoy ⭐ Best
- **Polygon**: https://faucet.polygon.technology/

#### BSC Testnet
- **Binance**: https://testnet.binance.org/faucet-smart
- **QuickNode**: https://faucet.quicknode.com/binance/testnet

#### Linea Sepolia
- **Infura**: https://www.infura.io/faucet/linea-sepolia

#### Scroll Sepolia
- **Scroll**: https://sepolia.scroll.io/bridge (bridge from Sepolia)

### Pro Tips for Getting Testnet ETH 💡
1. **Alchemy accounts** - Create free account for higher limits
2. **Bridge strategy** - Get Sepolia ETH, then bridge to L2s
3. **Multiple wallets** - If limits are hit, use alternate addresses
4. **Time your requests** - Daily limits reset at midnight UTC

---

## 📋 Step 2: Environment Setup

### Update your `.env` file in `/token/`:

```bash
# Private Key (NO 0x prefix)
PRIVATE_KEY=your_private_key_here

# LayerZero V2 Endpoints (same address across testnets)
LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f

# LayerZero V2 Endpoint IDs (EIDs)
LZ_EID_BASE_SEPOLIA=40245
LZ_EID_ETHEREUM_SEPOLIA=40161
LZ_EID_ARBITRUM_SEPOLIA=40231
LZ_EID_OPTIMISM_SEPOLIA=40232
LZ_EID_POLYGON_AMOY=40267
LZ_EID_BSC_TESTNET=40102

# RPC URLs (public, but consider Alchemy/Infura for reliability)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
OPTIMISM_SEPOLIA_RPC_URL=https://sepolia.optimism.io
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Block Explorer API Keys (for verification)
ETHERSCAN_API_KEY=
BASESCAN_API_KEY=
ARBISCAN_API_KEY=
POLYGONSCAN_API_KEY=
OPTIMISM_API_KEY=
BSCSCAN_API_KEY=
```

---

## 🚀 Step 3: Deployment Commands (OFT V2)

### Pre-Deployment Checks

```bash
cd /Users/yashchaudhary/Desktop/Myntis-FullStack/token

# Check balances on all networks at once
npx hardhat run scripts/check-all-balances.ts

# Or check individual networks
npx hardhat run scripts/check-balance.ts --network ethereum-sepolia
npx hardhat run scripts/check-balance.ts --network arbitrum-sepolia
npx hardhat run scripts/check-balance.ts --network optimism-sepolia
npx hardhat run scripts/check-balance.ts --network base-sepolia
```

### Deployment Order (OFT V2)

**Phase 1: Deploy Hub on Base Sepolia**

```bash
# Deploy the hub (MyntisOFT with minting capabilities)
npx hardhat run scripts/deploy-oft-v2-hub.ts --network base-sepolia
```

**Phase 2: Deploy Spokes**

```bash
# P0: Essential chains
npx hardhat run scripts/deploy-oft-v2-spoke.ts --network ethereum-sepolia
npx hardhat run scripts/deploy-oft-v2-spoke.ts --network arbitrum-sepolia

# P1: High priority
npx hardhat run scripts/deploy-oft-v2-spoke.ts --network optimism-sepolia
```

**Phase 3: Configure Cross-Chain Peers**

After all spokes are deployed, configure peers from EACH chain:

```bash
# From hub - configure hub to know about spokes
npx hardhat run scripts/configure-oft-v2-peers.ts --network base-sepolia

# From each spoke - configure spoke to know about hub
npx hardhat run scripts/configure-oft-v2-peers.ts --network ethereum-sepolia
npx hardhat run scripts/configure-oft-v2-peers.ts --network arbitrum-sepolia
npx hardhat run scripts/configure-oft-v2-peers.ts --network optimism-sepolia
```

**Phase 4: Test Cross-Chain Transfers**

```bash
# Test using the standard OFT send() function
npx hardhat run scripts/test-oft-v2-transfer.ts --network base-sepolia
```

---

## 📝 Step 4: Detailed Deployment Workflow

### For Each Spoke Chain:

```bash
# 1. Check balance
npx hardhat run scripts/check-balance.ts --network <network-name>

# 2. Deploy spoke contracts (MyntisSpokeOFT, SpokeDistributor, GlobalNullifier)
npx hardhat run scripts/deploy-oft-spoke.ts --network <network-name>

# 3. Verify contracts on block explorer
npx hardhat verify --network <network-name> <contract-address> <constructor-args>

# 4. Save deployment info (script does this automatically)
```

### After All Spokes Deployed:

```bash
# 1. Configure hub to know about all spokes
npx hardhat run scripts/configure-oft-peers.ts --network base-sepolia

# 2. Configure each spoke to know about hub
# (This may need to be run on each spoke network)
npx hardhat run scripts/set-peer.ts --network ethereum-sepolia
npx hardhat run scripts/set-peer.ts --network arbitrum-sepolia
npx hardhat run scripts/set-peer.ts --network optimism-sepolia
```

---

## 🔧 Step 5: Update Hardhat Config

Add Polygon Amoy (Mumbai replacement) to your `hardhat.config.ts`:

```typescript
// Add to networks section
"polygon-amoy": {
  url: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
  accounts: getPrivateKey(),
  timeout: 60000,
},

// Add to etherscan customChains
{
  network: "polygon-amoy",
  chainId: 80002,
  urls: {
    apiURL: "https://api-amoy.polygonscan.com/api",
    browserURL: "https://amoy.polygonscan.com"
  }
}
```

---

## 🌉 Step 6: Bridging Strategy (If Low on Testnet ETH)

### Option A: Bridge from Sepolia (Recommended)

1. Get Sepolia ETH from Alchemy faucet
2. Bridge to L2s:
   - **Arbitrum**: https://bridge.arbitrum.io/?l2ChainId=421614
   - **Optimism**: https://app.optimism.io/bridge
   - **Base**: https://bridge.base.org/deposit

### Option B: Multi-Faucet Strategy

| Day 1 | Day 2 | Day 3 |
|-------|-------|-------|
| Alchemy Sepolia | QuickNode Sepolia | Bridge to Arbitrum |
| Alchemy Arbitrum | Coinbase Base | Bridge to Optimism |
| Superchain OP | Google Sepolia | Deploy all |

### Option C: Request from Project Faucets

Some projects have higher limits:
- **LayerZero**: They sometimes provide testnet tokens in Discord
- **Alchemy Growth Plan**: Higher faucet limits

---

## ✅ Step 7: Verification Checklist

### Pre-Deployment
- [ ] All networks configured in hardhat.config.ts
- [ ] PRIVATE_KEY set in .env
- [ ] LZ_ENDPOINT address set in .env
- [ ] At least 0.05 ETH on each target chain
- [ ] Block explorer API keys set (for verification)

### Hub (Base Sepolia)
- [x] Myntis Token deployed
- [x] Emissions deployed
- [x] MerkleDistributor deployed
- [x] GlobalNullifier deployed
- [ ] Peers configured for all spokes

### Ethereum Sepolia Spoke
- [ ] MyntisSpokeOFT deployed
- [ ] SpokeDistributor deployed
- [ ] GlobalNullifier deployed
- [ ] Peer configured to Hub
- [ ] Contracts verified

### Arbitrum Sepolia Spoke
- [ ] MyntisSpokeOFT deployed
- [ ] SpokeDistributor deployed
- [ ] GlobalNullifier deployed
- [ ] Peer configured to Hub
- [ ] Contracts verified

### Optimism Sepolia Spoke
- [ ] MyntisSpokeOFT deployed
- [ ] SpokeDistributor deployed
- [ ] GlobalNullifier deployed
- [ ] Peer configured to Hub
- [ ] Contracts verified

### Cross-Chain Testing
- [ ] Hub → Ethereum transfer works
- [ ] Ethereum → Hub transfer works
- [ ] Hub → Arbitrum transfer works
- [ ] Arbitrum → Hub transfer works
- [ ] Ethereum → Arbitrum (spoke-to-spoke) works

---

## 🔍 Step 8: Monitoring & Debugging

### LayerZero Scan
Monitor cross-chain messages: https://layerzeroscan.com/

### Block Explorers
- Base Sepolia: https://sepolia.basescan.org
- Ethereum Sepolia: https://sepolia.etherscan.io
- Arbitrum Sepolia: https://sepolia.arbiscan.io
- Optimism Sepolia: https://sepolia-optimism.etherscan.io
- Polygon Amoy: https://amoy.polygonscan.com

### Common Issues

| Issue | Solution |
|-------|----------|
| "Insufficient gas" | Get more testnet ETH |
| "Peer not set" | Run configure-oft-peers.ts |
| "Invalid endpoint" | Check LZ_ENDPOINT in .env |
| "Message stuck" | Check LayerZero Scan for status |
| "Nonce too low" | Wait or reset wallet nonce |

---

## 📊 Step 9: Deployment Tracking

### Create a deployment tracking sheet:

| Chain | Contract | Address | Verified | Peer Set | Tested |
|-------|----------|---------|----------|----------|--------|
| Base Sepolia | Myntis | 0x22B8... | ✅ | ✅ | ✅ |
| Base Sepolia | Emissions | 0x53F6... | ✅ | N/A | ✅ |
| Eth Sepolia | MyntisSpokeOFT | TBD | ⏳ | ⏳ | ⏳ |
| Arb Sepolia | MyntisSpokeOFT | TBD | ⏳ | ⏳ | ⏳ |
| OP Sepolia | MyntisSpokeOFT | TBD | ⏳ | ⏳ | ⏳ |

---

## 🚀 Quick Start Commands (OFT V2)

```bash
cd /Users/yashchaudhary/Desktop/Myntis-FullStack/token

# 1. Check all balances
npx hardhat run scripts/check-all-balances.ts

# 2. Deploy hub on Base Sepolia
npx hardhat run scripts/deploy-oft-v2-hub.ts --network base-sepolia

# 3. Deploy spokes (after getting ETH on each chain)
npx hardhat run scripts/deploy-oft-v2-spoke.ts --network ethereum-sepolia
npx hardhat run scripts/deploy-oft-v2-spoke.ts --network arbitrum-sepolia
npx hardhat run scripts/deploy-oft-v2-spoke.ts --network optimism-sepolia

# 4. Configure peers (from EACH chain)
npx hardhat run scripts/configure-oft-v2-peers.ts --network base-sepolia
npx hardhat run scripts/configure-oft-v2-peers.ts --network ethereum-sepolia
npx hardhat run scripts/configure-oft-v2-peers.ts --network arbitrum-sepolia
npx hardhat run scripts/configure-oft-v2-peers.ts --network optimism-sepolia

# 5. Test cross-chain transfer
npx hardhat run scripts/test-oft-v2-transfer.ts --network base-sepolia
```

---

## 📅 Recommended Timeline

| Day | Tasks |
|-----|-------|
| Day 1 | Get testnet ETH from all faucets, bridge if needed |
| Day 2 | Deploy Ethereum Sepolia + Arbitrum Sepolia spokes |
| Day 3 | Deploy Optimism Sepolia, configure all peers |
| Day 4 | Test all cross-chain transfers |
| Day 5 | Fix any issues, verify contracts |

---

## 🔗 Quick Links

- **LayerZero Docs**: https://docs.layerzero.network/
- **LayerZero Scan**: https://layerzeroscan.com/
- **Hardhat Docs**: https://hardhat.org/docs
- **OFT Standard**: https://docs.layerzero.network/v2/developers/evm/oft/quickstart

---

## Need More Testnet ETH?

If faucets aren't giving enough:

1. **Alchemy Pro Account** - Higher faucet limits
2. **LayerZero Discord** - They sometimes help with testnet tokens
3. **Mining** - Some Sepolia faucets reward for solving captchas
4. **Sepolia PoW Faucet**: https://sepolia-faucet.pk910.de/ (slow but no limits)

---

*Last Updated: November 2024*
*For Myntis OFT Hub-and-Spoke Architecture*

