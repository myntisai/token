import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, ".env") }); // ⬅️ load .env variables early

// Helper function to normalize private key (remove 0x prefix if present)
// Hardhat expects private keys as hex strings without 0x prefix
const getPrivateKey = (): string[] => {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) return [];
  // Remove 0x prefix and any whitespace
  let normalized = pk.trim();
  if (normalized.startsWith('0x')) {
    normalized = normalized.slice(2);
  }
  // Ensure it's exactly 64 hex characters (32 bytes)
  if (normalized.length !== 64) {
    console.warn(`Warning: Private key length is ${normalized.length}, expected 64. Using as-is.`);
  }
  // Return as array - Hardhat will handle the conversion
  return [normalized];
};

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: { chainId: 1337 },
    localhost: { url: "http://127.0.0.1:8545" },
    "base-sepolia": {
      url: "https://sepolia.base.org",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "ethereum-sepolia": {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "arbitrum-sepolia": {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    // NOTE: Mumbai is deprecated! Use Amoy instead
    "polygon-mumbai": {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "polygon-amoy": {
      url: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "linea-sepolia": {
      url: process.env.LINEA_SEPOLIA_RPC_URL || "https://rpc.sepolia.linea.build",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "scroll-sepolia": {
      url: process.env.SCROLL_SEPOLIA_RPC_URL || "https://sepolia-rpc.scroll.io",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "optimism-sepolia": {
      url: "https://sepolia.optimism.io",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "bsc-testnet": {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    // Mainnet configurations
    "base-mainnet": {
      url: process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "ethereum-mainnet": {
      url: process.env.ETHEREUM_MAINNET_RPC_URL || "https://eth.llamarpc.com",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "arbitrum-mainnet": {
      url: process.env.ARBITRUM_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "polygon-mainnet": {
      url: process.env.POLYGON_MAINNET_RPC_URL || "https://polygon-rpc.com",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "optimism-mainnet": {
      url: process.env.OPTIMISM_MAINNET_RPC_URL || "https://mainnet.optimism.io",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "bsc-mainnet": {
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
  },
  // Increase mocha timeout for tests
  mocha: {
    timeout: 100000
  },
  etherscan: {
    // V2 API - use Etherscan.io API key for ALL chains
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=84532",
          browserURL: "https://sepolia.basescan.org"
        }
      },
      {
        network: "base-mainnet",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=8453",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "arbitrum-sepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=421614",
          browserURL: "https://sepolia.arbiscan.io"
        }
      },
      {
        network: "ethereum-sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155111",
          browserURL: "https://sepolia.etherscan.io"
        }
      },
      {
        network: "optimism-sepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=11155420",
          browserURL: "https://sepolia-optimism.etherscan.io"
        }
      },
      {
        network: "polygon-amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=80002",
          browserURL: "https://amoy.polygonscan.com"
        }
      },
      {
        network: "bsc-testnet",
        chainId: 97,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=97",
          browserURL: "https://testnet.bscscan.com"
        }
      },
      {
        network: "linea-sepolia",
        chainId: 59141,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=59141",
          browserURL: "https://sepolia.lineascan.build"
        }
      },
      {
        network: "scroll-sepolia",
        chainId: 534351,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=534351",
          browserURL: "https://sepolia.scrollscan.com"
        }
      }
    ]
  },
  sourcify: {
    enabled: true
  }
};

export default config;

