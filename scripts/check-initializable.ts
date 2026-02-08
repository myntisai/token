import { ethers, network } from "hardhat";
import { getLzEndpointV2 } from "./layerzero";

const ENDPOINT = getLzEndpointV2(network.name);
const HUB_EID = 40245;
const HUB_MYNTIS = "0x599016bF00eE23d531223c6285C92aa0cAC278EF";
const SPOKE_OFT = "0xa0124FfFe64267B04C13dB330F9452Abaf7Ad6f0";

const ENDPOINT_ABI = [
  "function initializable(tuple(uint32 srcEid, bytes32 sender, uint64 nonce) origin, address receiver) view returns (bool)"
];

async function main() {
  const endpoint = new ethers.Contract(ENDPOINT, ENDPOINT_ABI, await ethers.provider.getSigner());
  const origin = {
    srcEid: HUB_EID,
    sender: ethers.zeroPadValue(HUB_MYNTIS, 32),
    nonce: 1
  };
  const ok = await endpoint.initializable(origin, SPOKE_OFT);
  console.log(`initializable: ${ok}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
