# Multi-Chain Network Configuration Guide

## Overview

Myntis supports a hub-and-spoke architecture with **Base** as the hub (staking/emissions) and multiple spoke chains for liquidity and transfers.

## Supported Networks

### Hub Chain (Base)
- **Testnet**: Base Sepolia (Chain ID: 84532)
- **Mainnet**: Base Mainnet (Chain ID: 8453)
- **Features**: Full staking, emissions, governance, ZK proofs

### Spoke Chains (EVM-Compatible)

#### Testnets
1. **Ethereum Sepolia** (Chain ID: 11155111)
2. **Arbitrum Sepolia** (Chain ID: 421614)
3. **Polygon Mumbai** (Chain ID: 80001)
4. **Optimism Sepolia** (Chain ID: 11155420)
5. **BSC Testnet** (Chain ID: 97)

#### Mainnets
1. **Ethereum Mainnet** (Chain ID: 1)
2. **Arbitrum One** (Chain ID: 42161)
3. **Polygon Mainnet** (Chain ID: 137)
4. **Optimism Mainnet** (Chain ID: 10)
5. **BSC Mainnet** (Chain ID: 56)

### Non-EVM Chain
- **Solana** (Separate SPL token, lock-mint mechanism)
  - **Testnet**: Devnet
  - **Mainnet**: Mainnet-Beta

## Network Configuration Details

### LayerZero Endpoint IDs (EID)

| Network | Testnet EID | Mainnet EID | Testnet Endpoint | Mainnet Endpoint |
|---------|-------------|-------------|------------------|------------------|
| Base | 40245 | 30184 | `0x6EDCE65403992e310A62460808c4b910D972f10f` | TBD |
| Ethereum | 40161 | 30101 | `0x6EDCE65403992e310A62460808c4b910D972f10f` | TBD |
| Arbitrum | 40245 | 30110 | `0x6EDCE65403992e310A62460808c4b910D972f10f` | TBD |
| Polygon | 40109 | 30109 | `0x6EDCE65403992e310A62460808c4b910D972f10f` | TBD |
| Optimism | 40232 | 30111 | `0x6EDCE65403992e310A62460808c4b910D972f10f` | TBD |
| BSC | 40102 | 30102 | `0x6EDCE65403992e310A62460808c4b910D972f10f` | TBD |

**Note**: Mainnet LayerZero endpoints need to be updated with actual addresses before mainnet deployment.

### RPC URLs

#### Testnets
```typescript
const TESTNET_RPC_URLS = {
  "base-sepolia": "https://sepolia.base.org",
  "ethereum-sepolia": "https://ethereum-sepolia.publicnode.com",
  "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
  "polygon-mumbai": "https://rpc-mumbai.maticvigil.com",
  "optimism-sepolia": "https://sepolia.optimism.io",
  "bsc-testnet": "https://data-seed-prebsc-1-s1.binance.org:8545"
};
```

#### Mainnets
```typescript
const MAINNET_RPC_URLS = {
  "base-mainnet": "https://mainnet.base.org",
  "ethereum-mainnet": "https://eth.llamarpc.com",
  "arbitrum-mainnet": "https://arb1.arbitrum.io/rpc",
  "polygon-mainnet": "https://polygon-rpc.com",
  "optimism-mainnet": "https://mainnet.optimism.io",
  "bsc-mainnet": "https://bsc-dataseed.binance.org"
};
```

### Block Explorers

#### Testnets
- Base Sepolia: https://sepolia.basescan.org
- Ethereum Sepolia: https://sepolia.etherscan.io
- Arbitrum Sepolia: https://sepolia.arbiscan.io
- Polygon Mumbai: https://mumbai.polygonscan.com
- Optimism Sepolia: https://sepolia-optimism.etherscan.io
- BSC Testnet: https://testnet.bscscan.com

#### Mainnets
- Base: https://basescan.org
- Ethereum: https://etherscan.io
- Arbitrum: https://arbiscan.io
- Polygon: https://polygonscan.com
- Optimism: https://optimistic.etherscan.io
- BSC: https://bscscan.com

## Deployment Architecture

### Hub (Base)
- **MyntisOFT**: Full OFT token with staking capabilities
- **DualPoolStaking**: Provider pool (87.5%) + User pool (12.5%)
- **LiquidStakingVault**: ERC-4626 vault for user pool
- **Emissions**: Token emission schedule
- **RewardWeightingRegistry**: AI strategy weighting
- **ZKMerkleDistributor**: Privacy-preserving reward distribution
- **GlobalNullifier**: Cross-chain nullifier tracking

### Spoke Chains (EVM)
- **MyntisSpoke**: Simple OFT token (no staking)
- **SpokeDistributor**: Reward distribution on spoke
- **HubSpokeBridge**: Cross-chain bridge integration

### Solana (Non-EVM)
- **Myntis SPL Token**: Solana Program Library token
- **Lock-Mint Bridge**: Lock tokens on EVM, mint on Solana
- **Bridge Authority**: Controls minting/burning

## Deployment Workflow

### Phase 1: Testnet Deployment

1. **Deploy Hub on Base Sepolia** (already done)
   ```bash
   npx hardhat run scripts/deploy-hub-base.ts --network base-sepolia
   ```

2. **Deploy Spokes on Testnets**
   ```bash
   # Ethereum Sepolia
   npx hardhat run scripts/deploy-multi-spoke.ts --network ethereum-sepolia
   
   # Arbitrum Sepolia
   npx hardhat run scripts/deploy-multi-spoke.ts --network arbitrum-sepolia
   
   # Polygon Mumbai
   npx hardhat run scripts/deploy-multi-spoke.ts --network polygon-mumbai
   
   # Optimism Sepolia
   npx hardhat run scripts/deploy-multi-spoke.ts --network optimism-sepolia
   
   # BSC Testnet
   npx hardhat run scripts/deploy-multi-spoke.ts --network bsc-testnet
   ```

3. **Configure Cross-Chain Peers**
   ```bash
   npx hardhat run scripts/configure-oft-peers.ts --network base-sepolia
   ```

4. **Deploy Solana SPL Token** (separate process)
   ```bash
   cd solana
   anchor build
   anchor deploy --provider.cluster devnet
   ```

### Phase 2: Mainnet Deployment

1. **Deploy Hub on Base Mainnet**
   ```bash
   npx hardhat run scripts/deploy-hub-base.ts --network base-mainnet
   ```

2. **Deploy Spokes on Mainnets**
   ```bash
   # Repeat for each mainnet chain
   npx hardhat run scripts/deploy-multi-spoke.ts --network ethereum-mainnet
   npx hardhat run scripts/deploy-multi-spoke.ts --network arbitrum-mainnet
   npx hardhat run scripts/deploy-multi-spoke.ts --network polygon-mainnet
   npx hardhat run scripts/deploy-multi-spoke.ts --network optimism-mainnet
   npx hardhat run scripts/deploy-multi-spoke.ts --network bsc-mainnet
   ```

3. **Configure Mainnet Cross-Chain Peers**
   ```bash
   npx hardhat run scripts/configure-oft-peers.ts --network base-mainnet
   ```

4. **Deploy Solana Mainnet**
   ```bash
   anchor deploy --provider.cluster mainnet-beta
   ```

## Liquidity Management

### Initial Liquidity Provision

Each spoke chain requires initial liquidity for:
- DEX trading pairs (e.g., MYNTS/ETH, MYNTS/USDC)
- Cross-chain bridge operations
- User transfers

### Liquidity Targets

| Network | Testnet Target | Mainnet Target |
|---------|----------------|----------------|
| Ethereum | 10,000 MYNTS | 1,000,000 MYNTS |
| Arbitrum | 10,000 MYNTS | 500,000 MYNTS |
| Polygon | 10,000 MYNTS | 500,000 MYNTS |
| Optimism | 10,000 MYNTS | 500,000 MYNTS |
| BSC | 10,000 MYNTS | 500,000 MYNTS |
| Solana | 10,000 MYNTS | 1,000,000 MYNTS |

### Liquidity Provision Scripts

Use `scripts/manage-liquidity.ts` to:
- Mint initial tokens on each spoke
- Add liquidity to DEX pools
- Monitor liquidity levels
- Rebalance as needed

```bash
# Add liquidity to testnet
npx hardhat run scripts/manage-liquidity.ts --network ethereum-sepolia --amount 10000

# Add liquidity to mainnet
npx hardhat run scripts/manage-liquidity.ts --network ethereum-mainnet --amount 1000000
```

## Testnet Faucets

### Getting Testnet Tokens

#### Ethereum Sepolia
- https://sepoliafaucet.com/
- https://faucet.quicknode.com/ethereum/sepolia
- https://www.alchemy.com/faucets/ethereum-sepolia

#### Arbitrum Sepolia
- https://faucet.quicknode.com/arbitrum/sepolia
- https://faucet.arbitrum.io/

#### Polygon Mumbai
- https://faucet.polygon.technology/
- https://faucet.quicknode.com/polygon/mumbai

#### Optimism Sepolia
- https://faucet.quicknode.com/optimism/sepolia
- https://faucet.optimism.io/

#### BSC Testnet
- https://testnet.binance.org/faucet-smart
- https://faucet.quicknode.com/binance/testnet

#### Base Sepolia
- https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

#### Solana Devnet
- https://faucet.solana.com/

## Environment Variables

Create `.env` file in `token/` directory:

```bash
# Private Key (NO 0x prefix)
PRIVATE_KEY=your_private_key_here

# RPC URLs (optional, defaults provided)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ETHEREUM_MAINNET_RPC_URL=https://eth.llamarpc.com
ARBITRUM_MAINNET_RPC_URL=https://arb1.arbitrum.io/rpc
POLYGON_MAINNET_RPC_URL=https://polygon-rpc.com
OPTIMISM_MAINNET_RPC_URL=https://mainnet.optimism.io
BSC_MAINNET_RPC_URL=https://bsc-dataseed.binance.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Block Explorer API Keys
ETHERSCAN_API_KEY=your_key
BASESCAN_API_KEY=your_key
ARBISCAN_API_KEY=your_key
POLYGONSCAN_API_KEY=your_key
OPTIMISM_API_KEY=your_key
BSCSCAN_API_KEY=your_key
```

## Solana Integration

Solana uses a separate architecture:
- **SPL Token**: Standard Solana token program
- **Lock-Mint Bridge**: Lock tokens on EVM chains, mint equivalent on Solana
- **Bridge Authority**: Multi-sig or program-controlled authority

See `solana/README.md` for Solana-specific deployment instructions.

## Cross-Chain Operations

### Transfer Flow
1. User initiates transfer on source chain
2. Tokens burned on source chain
3. LayerZero message sent to destination
4. Tokens minted on destination chain

### Reward Distribution Flow
1. Rewards calculated on Base Hub
2. ZK proof generated for privacy
3. Cross-chain message sent to spoke
4. Spoke verifies and distributes rewards

## Security Considerations

1. **Multi-Sig**: All admin operations require multi-sig approval
2. **Rate Limiting**: Cross-chain operations have rate limits
3. **Nullifier Tracking**: Prevents double-claiming across chains
4. **ZK Proofs**: Privacy-preserving reward claims
5. **Upgradeability**: UUPS proxy pattern for contract upgrades

## Monitoring

### Key Metrics
- Cross-chain transfer volume
- Liquidity levels per chain
- Bridge utilization
- Reward distribution success rate
- Gas costs per chain

### Tools
- LayerZero Scan: https://layerzeroscan.com/
- Block Explorers: Per-chain explorers
- Custom Dashboard: Monitor all chains in one place

## Troubleshooting

### Common Issues

1. **LayerZero Endpoint Not Found**
   - Verify endpoint address is correct
   - Check network configuration

2. **Insufficient Liquidity**
   - Use liquidity management scripts
   - Monitor liquidity levels

3. **Cross-Chain Transfer Failed**
   - Check gas limits
   - Verify peer configuration
   - Check LayerZero message status

4. **Solana Bridge Issues**
   - Verify lock-mint authority
   - Check Solana program deployment
   - Verify bridge signatures

## Next Steps

1. ✅ Update LayerZero mainnet endpoint addresses
2. ✅ Deploy all testnet spokes
3. ✅ Configure cross-chain peers
4. ✅ Deploy Solana SPL token
5. ✅ Add initial liquidity
6. ✅ Test cross-chain operations
7. ⏳ Deploy mainnet (after testing)
8. ⏳ Add mainnet liquidity
9. ⏳ Monitor and optimize

## References

- [LayerZero Documentation](https://docs.layerzero.network/)
- [Base Documentation](https://docs.base.org/)
- [Solana Documentation](https://docs.solana.com/)
- [OFT Architecture Plan](./OFT_ARCHITECTURE_PLAN.md)

