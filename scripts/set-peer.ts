import { ethers } from "hardhat";

async function main() {
  const oftAddress = process.env.MYNTIS_OFT_ADDRESS;
  const eidRaw = process.env.PEER_EID;
  const peerAddress = process.env.PEER_ADDRESS;

  if (!oftAddress || !ethers.isAddress(oftAddress)) {
    throw new Error("Missing or invalid MYNTIS_OFT_ADDRESS");
  }
  if (!eidRaw) {
    throw new Error("Missing PEER_EID");
  }
  const eid = Number(eidRaw);
  if (!Number.isInteger(eid) || eid <= 0) {
    throw new Error(`Invalid PEER_EID "${eidRaw}"`);
  }
  if (!peerAddress || !ethers.isAddress(peerAddress)) {
    throw new Error("Missing or invalid PEER_ADDRESS");
  }

  const token = await ethers.getContractAt("MyntisOFT", oftAddress);
  const tx = await token.setPeer(eid, ethers.zeroPadValue(peerAddress, 32));
  console.log(`Submitted setPeer tx: ${tx.hash}`);
  await tx.wait();
  console.log("Peer updated");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
