# OFT-First Architecture: Hub-and-Spoke Design

## Core Philosophy

**Base Hub**: All staking, emissions, and governance happens here
**Spoke Chains**: Simple OFT tokens for liquidity, transfers, and basic operations
**Cross-Chain Rewards**: ZK-verified claims work across all chains

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BASE HUB (Layer 2)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   MyntisOFT     │  │  DualPoolStaking│  │   Emissions     │  │
│  │   (Hub Token)   │  │   (UUPS Proxy)  │  │   (UUPS Proxy)  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ LiquidStaking   │  │ RewardWeighting │  │ ZKMerkleDist    │  │
│  │ Vault (ERC-4626)│  │   Registry      │  │   (UUPS Proxy)  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┼───────────┐
                    │           │           │
            ┌───────▼───┐ ┌─────▼─────┐ ┌───▼─────┐
            │ Ethereum  │ │ Arbitrum  │ │Polygon  │
            │  Spoke    │ │  Spoke    │ │ Spoke   │
            │           │ │           │ │         │
            │ MyntisOFT │ │ MyntisOFT │ │MyntisOFT│
            │ (Simple)  │ │ (Simple)  │ │(Simple) │
            └───────────┘ └───────────┘ └─────────┘
```

## 1. Base Hub (Base L2) - Core Operations

### MyntisOFT (Hub Token)
- **Full OFT functionality** with LayerZero integration
- **Minting/Burning** for cross-chain operations
- **Governance** and admin functions
- **UUPS upgradeable**

### DualPoolStaking (Hub Only)
- **Provider Pool**: 87.5% emissions, non-transferrable, min 100 MYNT
- **User Pool**: 12.5% emissions, transferrable via ERC-4626
- **Cross-chain reward distribution** via LayerZero messages
- **UUPS upgradeable**

### LiquidStakingVault (Hub Only)
- **ERC-4626 vault** for user pool
- **lsMYNT shares** are transferrable
- **Auto-compounds** rewards
- **Cross-chain share representation** via LayerZero

### Emissions (Hub Only)
- **Fixed tokenomics**: 400M first period, then halving
- **Distributes to staking pools** on hub
- **Cross-chain reward coordination** via LayerZero
- **UUPS upgradeable**

### RewardWeightingRegistry (Hub Only)
- **On-chain strategy management**
- **Provider-specific AI strategies**
- **Cross-chain strategy coordination**
- **UUPS upgradeable**

### ZKMerkleDistributor (Hub Only)
- **ZK-verified reward distribution**
- **Cross-chain nullifier tracking**
- **Privacy-preserving claims**
- **UUPS upgradeable**

## 2. Spoke Chains - Simple OFT Tokens

### MyntisOFT (Spoke)
- **Simple OFT implementation**
- **No staking functionality**
- **No emissions**
- **Just transfers and basic operations**
- **LayerZero integration for hub communication**

### Key Features:
- **Liquidity provision** on DEXs
- **Cross-chain transfers** via LayerZero
- **Simple token operations**
- **No complex staking logic**

## 3. Cross-Chain Operations

### Reward Distribution Flow
1. **User stakes on Base Hub** (DualPoolStaking)
2. **Rewards calculated on Hub** (Emissions + AI weighting)
3. **ZK proof generated** for privacy
4. **Cross-chain claim** via LayerZero message
5. **Spoke chain verifies** and distributes rewards

### Transfer Flow
1. **User initiates transfer** on any chain
2. **LayerZero message** sent to destination
3. **Tokens burned** on source chain
4. **Tokens minted** on destination chain
5. **Cross-chain balance** maintained

## 4. ZK Cross-Chain Claims

### Privacy-Preserving Rewards
- **ZK proofs** hide user behavior data
- **Nullifiers** prevent double-claiming across chains
- **AI scores** remain private
- **Merkle proofs** verify eligibility

### Cross-Chain Nullifier Tracking
- **Global nullifier registry** on Base Hub
- **Spoke chains** check nullifiers before claims
- **LayerZero messages** coordinate nullifier burns
- **Prevents double-claiming** across all chains

## 5. Implementation Strategy

### Phase 1: Hub Deployment
1. Deploy MyntisOFT on Base
2. Deploy DualPoolStaking on Base
3. Deploy LiquidStakingVault on Base
4. Deploy Emissions on Base
5. Deploy RewardWeightingRegistry on Base
6. Deploy ZKMerkleDistributor on Base

### Phase 2: Spoke Deployment
1. Deploy MyntisOFT on Ethereum
2. Deploy MyntisOFT on Arbitrum
3. Deploy MyntisOFT on Polygon
4. Configure LayerZero endpoints
5. Set up cross-chain messaging

### Phase 3: Integration
1. Test cross-chain transfers
2. Test cross-chain reward claims
3. Test ZK proof verification
4. Test nullifier tracking
5. Full system testing

## 6. Key Benefits

### Simplified Architecture
- **Hub handles complexity** (staking, emissions, AI)
- **Spokes handle simplicity** (transfers, liquidity)
- **Clear separation of concerns**

### Better User Experience
- **Stake once on Base** for all rewards
- **Transfer tokens** across any chain
- **Claim rewards** on any chain
- **Privacy-preserving** operations

### Scalability
- **Add new spokes** easily
- **No complex staking logic** on spokes
- **Hub handles all governance**
- **Spokes handle all liquidity**

### Security
- **ZK proofs** hide sensitive data
- **Nullifiers** prevent double-claiming
- **LayerZero** handles cross-chain security
- **Hub controls** all critical operations

## 7. File Structure

```
token/
├── contracts/
│   ├── MyntisOFT.sol                    # OFT implementation
│   ├── DualPoolStaking.sol             # Hub-only staking
│   ├── LiquidStakingVault.sol          # Hub-only vault
│   ├── Emissions.sol                   # Hub-only emissions
│   ├── RewardWeightingRegistry.sol     # Hub-only registry
│   ├── ZKMerkleDistributor.sol         # Hub-only distributor
│   └── RewardClaimVerifier.sol         # ZK verifier
├── scripts/
│   ├── deploy-hub-base.ts              # Deploy hub on Base
│   ├── deploy-spoke-ethereum.ts        # Deploy spoke on Ethereum
│   ├── deploy-spoke-arbitrum.ts        # Deploy spoke on Arbitrum
│   └── deploy-spoke-polygon.ts         # Deploy spoke on Polygon
└── test/
    ├── HubStaking.test.ts              # Hub staking tests
    ├── CrossChainTransfers.test.ts     # Cross-chain tests
    ├── ZKClaims.test.ts                 # ZK claim tests
    └── Integration.test.ts               # Full system tests
```

## 8. Deployment Order

1. **Base Hub**: Deploy all contracts with full functionality
2. **Ethereum Spoke**: Deploy simple OFT token
3. **Arbitrum Spoke**: Deploy simple OFT token
4. **Polygon Spoke**: Deploy simple OFT token
5. **Configure LayerZero**: Set up cross-chain messaging
6. **Test Integration**: Full cross-chain functionality

## 9. Success Criteria

- ✅ **Hub handles all staking** and emissions
- ✅ **Spokes handle all transfers** and liquidity
- ✅ **Cross-chain transfers** work seamlessly
- ✅ **ZK claims** work across all chains
- ✅ **Nullifiers** prevent double-claiming
- ✅ **AI weighting** works on hub only
- ✅ **Liquid staking** works on hub only
- ✅ **Simple architecture** with clear separation

This architecture is much cleaner, more scalable, and properly leverages LayerZero's OFT capabilities!
