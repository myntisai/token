import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config(); // ⬅️ load .env variables early

const config: HardhatUserConfig = {
  solidity: "0.8.20", // Match your contract version
  networks: {
    hardhat: { chainId: 1337 },
    localhost: { url: "http://127.0.0.1:8545" },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      timeout: 60000, // Increase timeout to 60 seconds
    },
    base: {
      url: "https://sepolia.base.org",
      accounts: [`0x${process.env.PRIVATE_KEY}`],
    },
  },
  // Increase mocha timeout for tests
  mocha: {
    timeout: 100000
  }
};

export default config;
