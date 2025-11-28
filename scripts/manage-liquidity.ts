import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Network configurations
const NETWORK_CONFIGS: { [key: string]: {
  name: string;
  chainId: number;
  isTestnet: boolean;
  targetLiquidity: string; // in MYNTS
  dexAddresses?: {
    uniswapV2?: string;
    uniswapV3?: string;
    sushiswap?: string;
  };
}} = {
  // Testnets
  "ethereum-sepolia": {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    isTestnet: true,
    targetLiquidity: "10000",
    dexAddresses: {
      uniswapV2: "0x7E0987E5b3a30e3f2828572Bb659A548460a3003" // Sepolia Uniswap V2
    }
  },
  "arbitrum-sepolia": {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    isTestnet: true,
    targetLiquidity: "10000"
  },
  "polygon-mumbai": {
    name: "Polygon Mumbai",
    chainId: 80001,
    isTestnet: true,
    targetLiquidity: "10000"
  },
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    chainId: 11155420,
    isTestnet: true,
    targetLiquidity: "10000"
  },
  "bsc-testnet": {
    name: "BSC Testnet",
    chainId: 97,
    isTestnet: true,
    targetLiquidity: "10000",
    dexAddresses: {
      uniswapV2: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" // PancakeSwap Testnet
    }
  },
  // Mainnets
  "ethereum-mainnet": {
    name: "Ethereum Mainnet",
    chainId: 1,
    isTestnet: false,
    targetLiquidity: "1000000",
    dexAddresses: {
      uniswapV2: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      uniswapV3: "0xE592427A0AEce92De3Edee1F18E0157C05861564"
    }
  },
  "arbitrum-mainnet": {
    name: "Arbitrum One",
    chainId: 42161,
    isTestnet: false,
    targetLiquidity: "500000"
  },
  "polygon-mainnet": {
    name: "Polygon Mainnet",
    chainId: 137,
    isTestnet: false,
    targetLiquidity: "500000"
  },
  "optimism-mainnet": {
    name: "Optimism Mainnet",
    chainId: 10,
    isTestnet: false,
    targetLiquidity: "500000"
  },
  "bsc-mainnet": {
    name: "BSC Mainnet",
    chainId: 56,
    isTestnet: false,
    targetLiquidity: "500000",
    dexAddresses: {
      uniswapV2: "0x10ED43C718714eb63d5aA57B78B54704E256024E" // PancakeSwap
    }
  }
};

interface LiquidityStatus {
  network: string;
  chainId: number;
  currentBalance: string;
  targetLiquidity: string;
  deficit: string;
  status: "sufficient" | "insufficient" | "excess";
}

async function getDeploymentInfo(networkName: string): Promise<any> {
  const deploymentPath = path.join(__dirname, `../deployments/${networkName}.json`);
  if (fs.existsSync(deploymentPath)) {
    return JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  }
  return null;
}

async function checkLiquidity(networkName: string): Promise<LiquidityStatus> {
  const config = NETWORK_CONFIGS[networkName];
  if (!config) {
    throw new Error(`Unknown network: ${networkName}`);
  }

  console.log(`\n📊 Checking liquidity on ${config.name}...`);

  const deployment = await getDeploymentInfo(networkName);
  if (!deployment || !deployment.contracts?.MyntisSpoke) {
    throw new Error(`Deployment not found for ${networkName}. Deploy contracts first.`);
  }

  const [deployer] = await ethers.getSigners();
  const tokenAddress = deployment.contracts.MyntisSpoke;
  const token = await ethers.getContractAt("MyntisSpoke", tokenAddress);

  const currentBalance = await token.balanceOf(deployer.address);
  const currentBalanceFormatted = ethers.formatEther(currentBalance);
  const targetLiquidity = config.targetLiquidity;
  const targetBigInt = ethers.parseEther(targetLiquidity);
  
  const deficit = currentBalance < targetBigInt 
    ? ethers.formatEther(targetBigInt - currentBalance)
    : "0";
  const excess = currentBalance > targetBigInt
    ? ethers.formatEther(currentBalance - targetBigInt)
    : "0";

  let status: "sufficient" | "insufficient" | "excess";
  if (currentBalance < targetBigInt) {
    status = "insufficient";
  } else if (currentBalance > targetBigInt * BigInt(2)) {
    status = "excess";
  } else {
    status = "sufficient";
  }

  const liquidityStatus: LiquidityStatus = {
    network: networkName,
    chainId: config.chainId,
    currentBalance: currentBalanceFormatted,
    targetLiquidity: targetLiquidity,
    deficit: deficit,
    status: status
  };

  console.log(`  Current Balance: ${currentBalanceFormatted} MYNTS`);
  console.log(`  Target Liquidity: ${targetLiquidity} MYNTS`);
  console.log(`  Status: ${status.toUpperCase()}`);
  if (deficit !== "0") {
    console.log(`  ⚠️  Deficit: ${deficit} MYNTS`);
  }
  if (excess !== "0") {
    console.log(`  ✅ Excess: ${excess} MYNTS`);
  }

  return liquidityStatus;
}

async function addLiquidity(networkName: string, amount?: string) {
  const config = NETWORK_CONFIGS[networkName];
  if (!config) {
    throw new Error(`Unknown network: ${networkName}`);
  }

  console.log(`\n💰 Adding liquidity to ${config.name}...`);

  const deployment = await getDeploymentInfo(networkName);
  if (!deployment || !deployment.contracts?.MyntisSpoke) {
    throw new Error(`Deployment not found for ${networkName}. Deploy contracts first.`);
  }

  const [deployer] = await ethers.getSigners();
  const tokenAddress = deployment.contracts.MyntisSpoke;
  const token = await ethers.getContractAt("MyntisSpoke", tokenAddress);

  // Check current balance
  const currentBalance = await token.balanceOf(deployer.address);
  const currentBalanceFormatted = ethers.formatEther(currentBalance);
  const targetLiquidity = ethers.parseEther(config.targetLiquidity);

  let mintAmount: bigint;
  if (amount) {
    mintAmount = ethers.parseEther(amount);
  } else {
    // Mint to reach target if insufficient
    if (currentBalance < targetLiquidity) {
      mintAmount = targetLiquidity - currentBalance;
    } else {
      console.log(`  ✅ Already have sufficient liquidity: ${currentBalanceFormatted} MYNTS`);
      return;
    }
  }

  console.log(`  Current Balance: ${currentBalanceFormatted} MYNTS`);
  console.log(`  Minting: ${ethers.formatEther(mintAmount)} MYNTS`);

  // Check if deployer has minter role
  const MINTER_ROLE = await token.MINTER_ROLE();
  const hasMinterRole = await token.hasRole(MINTER_ROLE, deployer.address);
  
  if (!hasMinterRole) {
    console.log(`  ⚠️  Deployer doesn't have MINTER_ROLE. Attempting to mint via bridge...`);
    // Alternative: Use bridge to mint (if available)
    throw new Error("Deployer needs MINTER_ROLE to add liquidity. Grant role first.");
  }

  // Mint tokens
  const tx = await token.mint(deployer.address, mintAmount, "liquidity-provision");
  console.log(`  📝 Transaction: ${tx.hash}`);
  await tx.wait();
  console.log(`  ✅ Successfully minted ${ethers.formatEther(mintAmount)} MYNTS`);

  // Verify new balance
  const newBalance = await token.balanceOf(deployer.address);
  console.log(`  New Balance: ${ethers.formatEther(newBalance)} MYNTS`);
}

async function checkAllNetworks() {
  console.log("🌐 Checking liquidity across all networks...\n");

  const networkName = process.env.HARDHAT_NETWORK || "hardhat";
  const allNetworks = Object.keys(NETWORK_CONFIGS);
  
  const statuses: LiquidityStatus[] = [];
  
  for (const net of allNetworks) {
    try {
      // Switch network context (would need to be done per network in real scenario)
      // For now, just check the current network
      if (net === networkName || networkName === "hardhat") {
        const status = await checkLiquidity(net);
        statuses.push(status);
      }
    } catch (error: any) {
      console.log(`  ❌ Error checking ${net}: ${error.message}`);
    }
  }

  // Summary
  console.log("\n📋 Liquidity Summary:");
  console.log("─".repeat(80));
  statuses.forEach(status => {
    const indicator = status.status === "sufficient" ? "✅" : 
                     status.status === "insufficient" ? "⚠️ " : "📊";
    console.log(`${indicator} ${status.network.padEnd(25)} | Current: ${status.currentBalance.padStart(15)} | Target: ${status.targetLiquidity.padStart(15)} | ${status.status}`);
  });
  console.log("─".repeat(80));
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const networkName = process.env.HARDHAT_NETWORK || "hardhat";

  if (command === "check") {
    const targetNetwork = args[1] || networkName;
    if (targetNetwork === "all") {
      await checkAllNetworks();
    } else {
      await checkLiquidity(targetNetwork);
    }
  } else if (command === "add") {
    const targetNetwork = args[1] || networkName;
    const amount = args[2]; // Optional amount
    await addLiquidity(targetNetwork, amount);
  } else {
    console.log("Usage:");
    console.log("  npx hardhat run scripts/manage-liquidity.ts --network <network> -- check [network|all]");
    console.log("  npx hardhat run scripts/manage-liquidity.ts --network <network> -- add [network] [amount]");
    console.log("\nExamples:");
    console.log("  npx hardhat run scripts/manage-liquidity.ts --network ethereum-sepolia -- check");
    console.log("  npx hardhat run scripts/manage-liquidity.ts --network ethereum-sepolia -- add 10000");
    console.log("  npx hardhat run scripts/manage-liquidity.ts --network ethereum-sepolia -- check all");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });

