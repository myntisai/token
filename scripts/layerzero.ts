import { network } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// LayerZero EndpointV2 addresses are chain-specific, but in practice the same address is
// deployed on many EVM chains. We still keep explicit mapping for safety.
export const LZ_ENDPOINT_V2_TESTNET = "0x6EDCE65403992e310A62460808c4b910D972f10f";
export const LZ_ENDPOINT_V2_MAINNET = "0x1a44076050125825900e736c501f859c50fE728c";

export function getLzEndpointV2(networkName: string = network.name): string {
  // Explicit override always wins.
  if (process.env.LZ_ENDPOINT && process.env.LZ_ENDPOINT.trim() !== "") {
    return process.env.LZ_ENDPOINT.trim();
  }

  // Safe defaults by Hardhat network name.
  if (networkName === "base-mainnet") return LZ_ENDPOINT_V2_MAINNET;

  // Default to testnet endpoint for all sepolia/amoy/etc.
  return LZ_ENDPOINT_V2_TESTNET;
}

export function assertEndpointMatchesNetwork(networkName: string, endpoint: string) {
  const ep = endpoint.toLowerCase();
  if (networkName.endsWith("mainnet") && ep === LZ_ENDPOINT_V2_TESTNET.toLowerCase()) {
    throw new Error(
      `Refusing to run on ${networkName} with TESTNET LayerZero endpoint (${endpoint}). Set LZ_ENDPOINT correctly.`
    );
  }
}

