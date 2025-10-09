# Myntis Original Structure

This document describes the original Myntis token ecosystem structure with 5 core contracts.

## 📋 Contract Overview

### 1. **MyntisToken** (ERC20)
- **Purpose**: The main ERC20 token with minting capabilities
- **Features**: 
  - Access control with roles (ADMIN, MINTER, BURNER, BRIDGE)
  - Minting functionality for emissions
  - Standard ERC20 functionality

### 2. **StakingContract**
- **Purpose**: Manages provider staking and reward distribution
- **Features**:
  - Provider registration with minimum stake requirement
  - Stake increase/withdrawal functionality
  - Reward harvesting from emissions contract
  - Integration with MerkleDistributor for reward distribution

### 3. **EmissionsContract**
- **Purpose**: Manages token emissions with halving schedule
- **Features**:
  - 4-year halving periods
  - Initial emission rate: 350M tokens over 4 years
  - Total emission supply: 700M tokens
  - Automatic reward calculation and distribution

### 4. **MerkleDistributor**
- **Purpose**: Merkle tree-based reward distribution
- **Features**:
  - Per-provider balance tracking
  - Merkle root submission by providers
  - Claim verification using Merkle proofs
  - Bridge integration for cross-chain rewards

### 5. **MyntisBridge** (LayerZero)
- **Purpose**: Cross-chain token bridging
- **Features**:
  - LayerZero integration
  - Cross-chain reward distribution
  - Bridge role management

## 🔄 System Flow

```
1. Providers stake tokens in StakingContract
2. EmissionsContract calculates and distributes rewards
3. StakingContract harvests rewards and sends to MerkleDistributor
4. MerkleDistributor manages per-provider balances
5. Users claim rewards using Merkle proofs
6. MyntisBridge enables cross-chain operations
```

## 🚀 Deployment

### Quick Deploy
```bash
npx hardhat run scripts/deploy-original-structure.ts
```

### Manual Deployment Steps
1. Deploy MyntisToken
2. Deploy MerkleDistributor
3. Deploy StakingContract
4. Deploy EmissionsContract
5. Configure system:
   - Grant MINTER_ROLE to EmissionsContract
   - Set EmissionsContract in StakingContract
   - Set StakingContract in MerkleDistributor

## 🧪 Testing

Run the integration tests:
```bash
npx hardhat test test/OriginalStructure.test.ts
```

## 📊 Key Parameters

- **Halving Period**: 4 years
- **Initial Emission Rate**: 350M tokens over 4 years
- **Total Emission Supply**: 700M tokens
- **Minimum Stake**: 1,000 tokens (configurable)

## 🔧 Configuration

### Admin Functions
- `setMinimumStake()`: Update minimum stake requirement
- `setEmissionContract()`: Update emissions contract address
- `setMerkleDistributor()`: Update merkle distributor address
- `setStakingContract()`: Update staking contract address

### Provider Functions
- `registerProvider()`: Register as a provider with stake
- `increaseStake()`: Add more tokens to stake
- `withdrawStake()`: Withdraw staked tokens
- `harvestRewards()`: Claim accumulated rewards

## 🔒 Security Features

- Access control with role-based permissions
- Reentrancy protection
- Input validation and zero address checks
- Emergency withdrawal functions
- Rescue functions for stuck tokens

## 📈 Emission Schedule

The emission schedule follows a halving model:
- **Era 1**: 350M tokens over 4 years
- **Era 2**: 175M tokens over 4 years  
- **Era 3**: 87.5M tokens over 4 years
- And so on...

Total supply approaches 700M tokens asymptotically.

## 🌐 Cross-Chain Integration

The MyntisBridge contract enables:
- Cross-chain token transfers
- Cross-chain reward distribution
- Multi-chain provider support
- Bridge role management for security

## 📝 Events

Key events for monitoring:
- `ProviderRegistered`: New provider registration
- `StakeIncreased`: Stake amount changes
- `Harvested`: Reward harvesting
- `EmissionsUpdated`: Emission calculations
- `ProviderBalanceUpdated`: Merkle distributor updates

## 🔍 Verification

After deployment, verify contracts on block explorer:
```bash
npx hardhat verify --network <network> <contract_address> <constructor_args>
```

## 📞 Support

For technical support or questions about the Myntis ecosystem, please refer to the project documentation or contact the development team.
