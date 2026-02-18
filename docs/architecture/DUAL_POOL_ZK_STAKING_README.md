# Dual-Pool ZK Staking System with Dynamic AI Weighting

## Overview

A production-ready staking system featuring dual pools, ERC-4626 liquid staking, ZK-SNARK verification, and **pluggable provider-specific AI reward weighting**.

## Key Innovation: Dynamic AI Weighting System

Unlike hardcoded AI logic, this system allows:

- Each provider to implement custom reward weighting strategies
- Multiple strategies registered in on-chain registry
- Off-chain strategy execution with ZK proof compatibility
- Upgradeable and extensible architecture

## Architecture

### Core Components

1. **DualPoolStaking** - UUPS upgradeable staking contract with two pools:
   - Provider Pool: 700M tokens, non-transferrable, min 100 MYNT
   - User Pool: 100M tokens, transferrable via ERC-4626

2. **LiquidStakingVault** - ERC-4626 vault for user pool:
   - Mints lsMYNT shares for user pool
   - Fully transferrable (liquid staking)
   - Auto-compounds rewards

3. **RewardWeightingRegistry** - On-chain strategy management:
   - Providers register preferred strategies
   - Admin approves strategies before use
   - UUPS upgradeable for future enhancements

4. **ZKMerkleDistributor** - ZK-verified reward distribution:
   - Integrates ZK proof verification with Merkle trees
   - Prevents double-claiming through nullifier tracking
   - Supports both ZK and non-ZK epochs

5. **RewardClaimVerifier** - ZK-SNARK verifier:
   - Verifies AI legitimacy scores (0-100)
   - Verifies reward multipliers (0.1x-10x)
   - Generates nullifiers for double-claim prevention

## AI Reward Weighting System

### Pluggable Strategy Architecture

#### Base Interface
```python
class BaseRewardWeightingStrategy(ABC):
    @abstractmethod
    def analyze_user_behavior(...) -> RewardScore:
        # Returns: legitimacy_score, reward_multiplier, metadata
        pass
    
    @abstractmethod
    def get_strategy_name() -> str:
        pass
```

#### Myntis Default Strategy
- **Content Quality**: 30%
- **Behavioral Patterns**: 25%
- **Security Assessment**: 25%
- **Engagement Quality**: 20%

#### Custom Strategy Example
```python
class CustomMLStrategy(BaseRewardWeightingStrategy):
    def analyze_user_behavior(self, user_data):
        # Custom ML model
        # Custom weighting logic
        return RewardScore(
            legitimacy_score=85,
            reward_multiplier=2500,  # 2.5x
            abuse_probability=15,
            engagement_quality=80,
            metadata={'model': 'custom_v2'}
        )
```

## ZK Circuit

### reward_claim.circom

Verifies:
- AI legitimacy score (0-100)
- Reward multiplier (0.1x-10x)
- Merkle proof membership
- Generates nullifier for double-claim prevention

**Private inputs** (hidden): user address, AI scores, merkle proof
**Public inputs**: merkle root, nullifier, claim amount

## Tokenomics Fix

### Emissions Contract
Fixed halving calculation to distribute 400M tokens in first 4 years:

```solidity
// Before (bug): 800M / 4 years = 200M/year
uint256 public constant INITIAL_EMISSION_RATE = TOTAL_EMISSIONS / HALVING_PERIOD;

// After (fixed): 400M / 4 years = 100M/year
uint256 public constant INITIAL_EMISSION_RATE = (TOTAL_EMISSIONS / 2) / HALVING_PERIOD;
```

**Halving Schedule**:
- Years 0-4: 400M tokens
- Years 4-8: 200M tokens
- Years 8-12: 100M tokens
- And so on...

## Deployment

### Prerequisites
```bash
npm install
```

### Deploy Full System
```bash
npx hardhat run scripts/deploy-dual-pool-system.ts --network <network>
```

### Test Locally
```bash
npx hardhat test
```

## Usage

### 1. Provider Staking
```typescript
// Stake in provider pool (non-transferrable)
await staking.stakeToProviderPool(ethers.parseEther("1000"));

// Unstake from provider pool
await staking.unstakeFromProviderPool(ethers.parseEther("500"));
```

### 2. User Liquid Staking
```typescript
// Deposit via ERC-4626 vault
await vault.deposit(ethers.parseEther("500"), userAddress);

// Transfer shares (liquid staking)
await vault.transfer(recipient, shares);

// Redeem shares
await vault.redeem(shares, userAddress, userAddress);
```

### 3. AI Strategy Registration
```typescript
// Register provider strategy
await registry.setProviderStrategy(
  "myntis_default",
  "1.0.0",
  "https://api.myntis.com/strategy",
  configHash
);

// Approve new strategy (admin only)
await registry.approveStrategy("custom_ml_v1");
```

### 4. ZK Reward Claims
```typescript
// Generate ZK proof inputs
const zkInputs = await zkProofGenerator.createProofInputs(
  userAddress,
  aiScores,
  merkleData
);

// Generate ZK proof
const proof = await zkProofGenerator.generateRewardClaimProof(zkInputs);

// Claim with ZK proof
await distributor.claimWithZK(
  provider,
  rootIndex,
  amount,
  merkleProof,
  proof.proof,
  proof.publicSignals
);
```

## Testing

### Run All Tests
```bash
npx hardhat test
```

### Run Specific Test Suites
```bash
# Dual-pool staking tests
npx hardhat test test/DualPoolStaking.test.ts

# ZK Merkle distributor tests
npx hardhat test test/ZKMerkleDistributor.test.ts

# AI reward weighting tests
npx hardhat test test/AIRewardWeighting.test.ts

# Integration tests
npx hardhat test test/DualPoolZKIntegration.test.ts
```

## Key Benefits

1. **Provider Flexibility**: Each provider can use custom AI models
2. **Upgradeable**: UUPS proxies allow system improvements
3. **Secure**: ZK proofs hide user behavior data
4. **Extensible**: New strategies can be added without redeployment
5. **Standardized**: All strategies output compatible format for ZK proofs
6. **Liquid Staking**: User pool shares are fully transferrable
7. **Fixed Tokenomics**: Correct 400M first period emission

## File Structure

```
token/
├── contracts/
│   ├── DualPoolStaking.sol          # Dual-pool staking with UUPS
│   ├── LiquidStakingVault.sol       # ERC-4626 liquid staking
│   ├── RewardWeightingRegistry.sol  # On-chain strategy management
│   ├── ZKMerkleDistributor.sol      # ZK-verified distribution
│   ├── RewardClaimVerifier.sol      # ZK-SNARK verifier
│   └── Emissions.sol                 # Fixed tokenomics
├── zk-circuits/
│   ├── reward_claim.circom          # ZK circuit
│   └── package.json                 # Circuit dependencies
├── sdk/
│   └── zkProofGenerator.ts          # ZK proof generation SDK
├── test/
│   ├── DualPoolStaking.test.ts     # Staking tests
│   ├── ZKMerkleDistributor.test.ts # ZK distribution tests
│   ├── AIRewardWeighting.test.ts   # AI strategy tests
│   └── DualPoolZKIntegration.test.ts # Integration tests
└── scripts/
    └── deploy-dual-pool-system.ts   # Deployment script
```

## Backend Integration

### AI Strategy Development
```python
# backend/ai_reward_weighting/
├── base.py                    # Base strategy interface
├── myntis_strategy.py         # Default Myntis strategy
├── registry.py                # Off-chain strategy registry
└── zk_claim_resolver.py       # GraphQL resolvers
```

### GraphQL API
```graphql
# Generate ZK claim inputs
mutation GenerateZKClaimInputs($userId: String!, $providerAddress: String!) {
  generateZKClaimInputs(userId: $userId, providerAddress: $providerAddress) {
    success
    aiScores {
      legitimacyScore
      rewardMultiplier
      abuseProbability
      engagementQuality
    }
    zkInputs {
      merkleRoot
      nullifier
      claimAmount
      userAddress
      aiLegitimacyScore
      aiRewardMultiplier
      merkleProof
      merklePathIndices
    }
  }
}
```

## Security Considerations

1. **ZK Proofs**: Hide user behavior data while proving legitimacy
2. **Nullifiers**: Prevent double-claiming across all chains
3. **Access Control**: Role-based permissions for all operations
4. **Upgradeability**: UUPS pattern allows secure upgrades
5. **Merkle Trees**: Efficient and verifiable reward distribution

## Future Enhancements

1. **Cross-Chain Integration**: Extend to multiple chains
2. **Advanced ZK Circuits**: More sophisticated proof systems
3. **ML Model Updates**: Dynamic strategy parameter updates
4. **Governance**: Decentralized strategy approval
5. **Analytics**: Comprehensive reward distribution analytics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add comprehensive tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
