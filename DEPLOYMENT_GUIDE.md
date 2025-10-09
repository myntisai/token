# Cross-Chain Deployment Guide

## 🎯 Overview

You now have a comprehensive cross-chain deployment system ready! Your verified contracts on Base Sepolia are the **Hub**, and we'll deploy **Spoke** contracts on multiple chains.

## 🏛️ Hub Contracts (Base Sepolia) - Already Deployed ✅

- **Myntis Token**: `0x22B8FAfDc483dE0998a37d7F47c9A4Da30729773`
- **Emissions**: `0x53F6Ad26179DD689227f15924011d34469086346`
- **MerkleDistributor**: `0xbBe0A7517c0Dd93e508248AA4e1bcAd9AaB7F0FB`
- **GlobalNullifier**: `0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1`

## 🔗 Spoke Chains to Deploy

1. **Ethereum Sepolia** (Chain ID: 11155111)
2. **Arbitrum Sepolia** (Chain ID: 421614)
3. **Polygon Mumbai** (Chain ID: 80001)
4. **Optimism Sepolia** (Chain ID: 11155420)

## 🚰 Getting Testnet Tokens

### Step 1: Check Your Balance
```bash
npx hardhat run scripts/check-balance.ts --network ethereum-sepolia
npx hardhat run scripts/check-balance.ts --network arbitrum-sepolia
npx hardhat run scripts/check-balance.ts --network polygon-mumbai
npx hardhat run scripts/check-balance.ts --network optimism-sepolia
```

### Step 2: Get Testnet Tokens

#### Ethereum Sepolia
- **Primary**: https://sepoliafaucet.com/
- **Alternative**: https://faucet.quicknode.com/ethereum/sepolia
- **Alternative**: https://www.alchemy.com/faucets/ethereum-sepolia

#### Arbitrum Sepolia
- **Primary**: https://faucet.quicknode.com/arbitrum/sepolia
- **Alternative**: https://faucet.arbitrum.io/

#### Polygon Mumbai
- **Primary**: https://faucet.polygon.technology/
- **Alternative**: https://faucet.quicknode.com/polygon/mumbai

#### Optimism Sepolia
- **Primary**: https://faucet.quicknode.com/optimism/sepolia
- **Alternative**: https://faucet.optimism.io/

### Step 3: Enter Your Address
Use this address: `YOUR_WALLET_ADDRESS` (replace with your actual address)

## 🚀 Deployment Commands

### Deploy on Each Spoke Chain

```bash
# Ethereum Sepolia
npx hardhat run scripts/deploy-and-test-spoke.ts --network ethereum-sepolia

# Arbitrum Sepolia  
npx hardhat run scripts/deploy-and-test-spoke.ts --network arbitrum-sepolia

# Polygon Mumbai
npx hardhat run scripts/deploy-and-test-spoke.ts --network polygon-mumbai

# Optimism Sepolia
npx hardhat run scripts/deploy-and-test-spoke.ts --network optimism-sepolia
```

## 📋 What Each Deployment Does

1. **Deploys 3 Contracts**:
   - `MyntisSpoke` - Lightweight token for the spoke chain
   - `SpokeDistributor` - Handles cross-chain claims with nullifier prevention
   - `HubSpokeBridge` - Bridge contract for cross-chain operations

2. **Configures Roles**:
   - Grants minting/burning roles to bridge
   - Sets up cross-chain permissions
   - Grants provider role for testing

3. **Tests Functionality**:
   - Token minting and burning
   - Nullifier generation
   - Merkle root submission
   - Cross-chain compatibility

## 🧪 Testing Results

Each deployment will show:
- ✅ Contract addresses
- ✅ Role configuration
- ✅ Token minting test
- ✅ Nullifier generation test
- ✅ Merkle root submission test
- ✅ Token burning test

## 📄 Deployment Summary

After each deployment, you'll get a JSON summary with:
- Network information
- Contract addresses
- Hub contract references
- Test results

## 🔄 Next Steps After Deployment

1. **Configure Cross-Chain Connections**:
   - Set up LayerZero peers between hub and spokes
   - Register spoke contracts in GlobalNullifier
   - Test cross-chain messaging

2. **Test Cross-Chain Functionality**:
   - Test reward distribution from hub to spokes
   - Test nullifier prevention across chains
   - Test cross-chain token transfers

3. **Production Deployment**:
   - Deploy on mainnet chains
   - Configure production LayerZero endpoints
   - Set up monitoring and alerts

## 🛠️ Troubleshooting

### Insufficient Balance
If you get "Insufficient balance" error:
1. Visit the faucet URLs above
2. Enter your wallet address
3. Request testnet tokens
4. Wait for confirmation
5. Run the deployment again

### Network Connection Issues
If you get connection errors:
1. Check your internet connection
2. Try a different RPC URL
3. Wait a few minutes and retry

### Contract Deployment Fails
If deployment fails:
1. Check you have sufficient gas
2. Verify the network is working
3. Try again after a few minutes

## 📞 Support

If you encounter issues:
1. Check the error messages carefully
2. Ensure you have testnet tokens
3. Verify network connectivity
4. Try the alternative faucets if needed

## 🎉 Success!

Once all deployments are complete, you'll have:
- ✅ Hub contracts on Base Sepolia (already deployed)
- ✅ Spoke contracts on 4 different chains
- ✅ Cross-chain nullifier prevention
- ✅ Bridge functionality
- ✅ Comprehensive testing completed

Your cross-chain Myntis ecosystem will be ready for testing and production use!
