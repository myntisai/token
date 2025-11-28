# Solana SPL Token Integration

## Overview

Solana integration uses a **lock-mint** bridge mechanism:
- **EVM Chains**: Lock MYNTS tokens in a bridge contract
- **Solana**: Mint equivalent SPL tokens on Solana
- **Reverse**: Burn SPL tokens, unlock on EVM

This is separate from the LayerZero OFT system used for EVM chains.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────┐
│   EVM Chain     │         │  Bridge Authority │         │   Solana      │
│                 │         │   (Multi-sig or   │         │               │
│  Lock Contract  │────────▶│    Program)       │────────▶│  SPL Token    │
│                 │  Lock   │                   │  Mint   │               │
└─────────────────┘         └──────────────────┘         └──────────────┘
```

## Components

### 1. EVM Lock Contract
- Locks MYNTS tokens when bridging to Solana
- Emits events for bridge authority to monitor
- Unlocks tokens when bridging back from Solana

### 2. Solana Program
- **SPL Token Program**: Standard Solana token
- **Bridge Authority**: Controls minting/burning
- **Lock/Burn Verification**: Verifies EVM locks before minting

### 3. Bridge Authority
- **Option 1**: Multi-sig wallet (recommended for mainnet)
- **Option 2**: Solana program with oracle verification
- Monitors EVM lock events and mints on Solana

## Setup

### Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Install Node dependencies
npm install @solana/web3.js @solana/spl-token
```

### Project Structure

```
solana/
├── programs/
│   └── myntis-bridge/
│       └── src/
│           └── lib.rs          # Solana program
├── scripts/
│   ├── deploy.ts               # Deploy program
│   ├── create-spl-token.ts     # Create SPL token
│   └── bridge-authority.ts     # Bridge authority setup
├── tests/
│   └── myntis-bridge.ts        # Program tests
├── Anchor.toml                 # Anchor configuration
└── README.md                   # This file
```

## Deployment

### Step 1: Create SPL Token

```bash
# Devnet
npx ts-node scripts/create-spl-token.ts --cluster devnet

# Mainnet
npx ts-node scripts/create-spl-token.ts --cluster mainnet-beta
```

### Step 2: Deploy Bridge Program

```bash
# Build
anchor build

# Deploy to Devnet
anchor deploy --provider.cluster devnet

# Deploy to Mainnet
anchor deploy --provider.cluster mainnet-beta
```

### Step 3: Set Bridge Authority

```bash
# Set multi-sig as bridge authority
npx ts-node scripts/bridge-authority.ts --set-authority <multisig-address>
```

## Lock-Mint Flow

### EVM → Solana

1. **User locks tokens on EVM**
   ```solidity
   bridge.lockTokens(amount, solanaRecipient);
   ```

2. **Bridge authority monitors event**
   - Detects lock event
   - Verifies transaction
   - Prepares mint instruction

3. **Mint on Solana**
   ```typescript
   await program.methods
     .mintFromBridge(amount, evmTxHash)
     .accounts({
       authority: bridgeAuthority,
       token: splTokenMint,
       recipient: solanaRecipient,
     })
     .rpc();
   ```

### Solana → EVM

1. **User burns SPL tokens**
   ```typescript
   await program.methods
     .burnForBridge(amount, evmRecipient)
     .accounts({
       token: splTokenMint,
       user: userWallet,
     })
     .rpc();
   ```

2. **Bridge authority unlocks on EVM**
   ```solidity
   bridge.unlockTokens(amount, evmRecipient, solanaTxSignature);
   ```

## Configuration

### Anchor.toml

```toml
[features]
seeds = false
skip-lint = false

[programs.devnet]
myntis_bridge = "YourProgramIdHere"

[programs.mainnet]
myntis_bridge = "YourMainnetProgramIdHere"

[cluster]
devnet = "https://api.devnet.solana.com"
mainnet = "https://api.mainnet-beta.solana.com"
```

### Environment Variables

```bash
# Solana
SOLANA_KEYPAIR_PATH=~/.config/solana/id.json
SOLANA_CLUSTER=devnet  # or mainnet-beta

# Bridge Authority
BRIDGE_AUTHORITY=YourMultisigAddress
SPL_TOKEN_MINT=YourSPLTokenMintAddress
```

## Security

### Multi-Sig Authority

For mainnet, use a multi-sig wallet:
- **Recommended**: 3-of-5 or 4-of-7
- **Threshold**: Require majority for mint/burn operations
- **Key Management**: Use hardware wallets

### Verification

Before minting on Solana:
1. Verify EVM transaction exists
2. Verify transaction is confirmed
3. Verify lock amount matches
4. Verify recipient address
5. Check for duplicate claims (nonce/replay protection)

### Rate Limiting

- Maximum lock amount per transaction
- Cooldown period between locks
- Daily limits per address

## Testing

### Local Testing

```bash
# Start local validator
solana-test-validator

# Run tests
anchor test
```

### Devnet Testing

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Run integration tests
npm run test:devnet
```

## Integration with EVM Bridge

### EVM Lock Contract Interface

```solidity
interface ISolanaBridge {
    function lockTokens(uint256 amount, bytes32 solanaRecipient) external;
    function unlockTokens(
        uint256 amount,
        address evmRecipient,
        bytes32 solanaTxSignature
    ) external;
    event TokensLocked(address indexed user, uint256 amount, bytes32 solanaRecipient);
    event TokensUnlocked(address indexed recipient, uint256 amount, bytes32 solanaTxSignature);
}
```

### Bridge Authority Service

A service (Node.js/Python) monitors EVM events and triggers Solana mints:

```typescript
// Monitor EVM lock events
const filter = bridge.filters.TokensLocked();
bridge.on(filter, async (user, amount, solanaRecipient) => {
  // Verify transaction
  const tx = await provider.getTransaction(receipt.transactionHash);
  
  // Mint on Solana
  await mintOnSolana(amount, solanaRecipient, tx.hash);
});
```

## Liquidity on Solana

### Initial Liquidity

1. **Lock tokens on EVM** (from hub or spoke)
2. **Mint equivalent on Solana**
3. **Add to DEX pools** (Raydium, Orca, etc.)

### Target Liquidity

- **Devnet**: 10,000 MYNTS (for testing)
- **Mainnet**: 1,000,000 MYNTS (initial)

### DEX Integration

```typescript
// Add liquidity to Raydium
const pool = await raydium.createPool({
  tokenA: myntsSPLToken,
  tokenB: usdcToken,
  amountA: 1000000,
  amountB: 100000,
});
```

## Monitoring

### Key Metrics
- Lock/unlock volume
- Bridge authority operations
- SPL token supply
- DEX liquidity levels
- Transaction success rate

### Tools
- Solana Explorer: https://explorer.solana.com/
- Solscan: https://solscan.io/
- Custom Dashboard: Monitor bridge operations

## Troubleshooting

### Common Issues

1. **Mint Failed**
   - Check bridge authority permissions
   - Verify EVM transaction
   - Check Solana program logs

2. **Unlock Failed**
   - Verify Solana burn transaction
   - Check signature verification
   - Verify bridge authority

3. **Liquidity Issues**
   - Monitor DEX pool balances
   - Rebalance as needed
   - Add more liquidity if needed

## Next Steps

1. ✅ Set up Solana development environment
2. ✅ Create SPL token
3. ✅ Deploy bridge program
4. ✅ Set up bridge authority
5. ✅ Test lock-mint flow
6. ⏳ Deploy to mainnet
7. ⏳ Add initial liquidity
8. ⏳ Monitor and optimize

## References

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [SPL Token Program](https://spl.solana.com/token)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)

