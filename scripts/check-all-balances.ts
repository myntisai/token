import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

interface NetworkBalance {
  network: string;
  chainId: number;
  balance: string;
  balanceEth: string;
  sufficient: boolean;
  faucetUrl: string;
}

// Minimum balance needed for deployment (0.03 ETH)
const MIN_BALANCE = ethers.parseEther("0.03");

// Faucet URLs for each network
const FAUCETS: { [key: string]: string } = {
  "ethereum-sepolia": "https://www.alchemy.com/faucets/ethereum-sepolia",
  "arbitrum-sepolia": "https://www.alchemy.com/faucets/arbitrum-sepolia",
  "optimism-sepolia": "https://app.optimism.io/faucet",
  "base-sepolia": "https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet",
  "polygon-amoy": "https://www.alchemy.com/faucets/polygon-amoy",
  "bsc-testnet": "https://testnet.binance.org/faucet-smart",
  "linea-sepolia": "https://www.infura.io/faucet/linea-sepolia",
  "scroll-sepolia": "https://sepolia.scroll.io/bridge",
};

async function checkAllBalances() {
  console.log("💰 Multi-Network Balance Checker");
  console.log("================================\n");

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No signers available. Check your PRIVATE_KEY in .env");
  }
  
  const deployer = signers[0];
  console.log(`📍 Deployer Address: ${deployer.address}\n`);

  // Target networks for deployment
  const targetNetworks = [
    "base-sepolia",
    "ethereum-sepolia", 
    "arbitrum-sepolia",
    "optimism-sepolia",
    "polygon-amoy",
    "bsc-testnet",
  ];

  const results: NetworkBalance[] = [];
  let needsFunding = false;

  console.log("Checking balances across all networks...\n");
  console.log("┌─────────────────────┬────────────────┬───────────┐");
  console.log("│ Network             │ Balance (ETH)  │ Status    │");
  console.log("├─────────────────────┼────────────────┼───────────┤");

  for (const networkName of targetNetworks) {
    try {
      // Get RPC URL for network
      const rpcUrls: { [key: string]: string } = {
        "base-sepolia": "https://sepolia.base.org",
        "ethereum-sepolia": process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
        "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
        "optimism-sepolia": "https://sepolia.optimism.io",
        "polygon-amoy": process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
        "bsc-testnet": process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
        "linea-sepolia": "https://rpc.sepolia.linea.build",
        "scroll-sepolia": "https://sepolia-rpc.scroll.io",
      };

      const provider = new ethers.JsonRpcProvider(rpcUrls[networkName]);
      const balance = await provider.getBalance(deployer.address);
      const chainId = Number((await provider.getNetwork()).chainId);
      
      const balanceEth = ethers.formatEther(balance);
      const sufficient = balance >= MIN_BALANCE;
      
      if (!sufficient) needsFunding = true;

      const status = sufficient ? "✅ Ready" : "❌ Low";
      const paddedNetwork = networkName.padEnd(19);
      const paddedBalance = balanceEth.slice(0, 12).padEnd(14);
      
      console.log(`│ ${paddedNetwork} │ ${paddedBalance} │ ${status.padEnd(9)} │`);

      results.push({
        network: networkName,
        chainId,
        balance: balance.toString(),
        balanceEth,
        sufficient,
        faucetUrl: FAUCETS[networkName] || "N/A",
      });
    } catch (error: any) {
      const paddedNetwork = networkName.padEnd(19);
      console.log(`│ ${paddedNetwork} │ N/A            │ ⚠️ Error   │`);
      
      results.push({
        network: networkName,
        chainId: 0,
        balance: "0",
        balanceEth: "0",
        sufficient: false,
        faucetUrl: FAUCETS[networkName] || "N/A",
      });
    }
  }

  console.log("└─────────────────────┴────────────────┴───────────┘\n");

  // Summary
  const readyCount = results.filter(r => r.sufficient).length;
  const totalCount = results.length;
  
  console.log(`📊 Summary: ${readyCount}/${totalCount} networks ready for deployment\n`);

  if (needsFunding) {
    console.log("🚰 Faucets for networks that need funding:\n");
    
    for (const result of results) {
      if (!result.sufficient) {
        console.log(`   ${result.network}:`);
        console.log(`   └── ${result.faucetUrl}\n`);
      }
    }

    console.log("💡 Tips for getting testnet ETH:");
    console.log("   1. Create an Alchemy account for higher limits");
    console.log("   2. Bridge from Ethereum Sepolia to L2s");
    console.log("   3. Use PoW faucet: https://sepolia-faucet.pk910.de/");
    console.log("   4. Check LayerZero Discord for testnet token requests\n");
  } else {
    console.log("✅ All networks have sufficient balance for deployment!\n");
    console.log("📝 Next steps:");
    console.log("   1. Deploy spokes: npx hardhat run scripts/deploy-oft-spoke.ts --network <network>");
    console.log("   2. Configure peers: npx hardhat run scripts/configure-oft-peers.ts --network base-sepolia");
    console.log("   3. Test cross-chain: npx hardhat run scripts/test-cross-chain-comprehensive.ts --network base-sepolia\n");
  }

  return results;
}

// Export for use in other scripts
export { checkAllBalances };

// Main execution
if (require.main === module) {
  checkAllBalances()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Error:", error.message);
      process.exit(1);
    });
}

