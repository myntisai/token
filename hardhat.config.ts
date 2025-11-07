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
    "polygon-mumbai": {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
    "optimism-sepolia": {
      url: "https://sepolia.optimism.io",
      accounts: getPrivateKey(),
      timeout: 60000,
    },
  },
  // Increase mocha timeout for tests
  mocha: {
    timeout: 100000
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  }
};

export default config;

