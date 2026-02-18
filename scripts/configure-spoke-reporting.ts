import { ethers } from "hardhat";

async function main() {
  const spokeAddress = process.env.SPOKE_ADDRESS;
  if (!spokeAddress || !ethers.isAddress(spokeAddress)) {
    throw new Error("Missing or invalid SPOKE_ADDRESS");
  }

  const autoReport = (process.env.AUTO_REPORT || "true").toLowerCase() === "true";
  const enforce = (process.env.ENFORCE_REPORTING || "true").toLowerCase() === "true";
  const options = process.env.SUPPLY_UPDATE_OPTIONS || "0x0003";
  const refundAddress = process.env.SUPPLY_UPDATE_REFUND;
  const fundAmount = process.env.FUND_AMOUNT ? ethers.parseEther(process.env.FUND_AMOUNT) : 0n;

  const [signer] = await ethers.getSigners();
  const spoke = await ethers.getContractAt("MyntisOFTSpoke", spokeAddress);

  console.log("Configuring spoke supply reporting...");
  console.log("Signer:", signer.address);
  console.log("Spoke:", spokeAddress);
  console.log("Auto report:", autoReport);
  console.log("Enforce reporting:", enforce);
  console.log("Options:", options);
  console.log("Refund:", refundAddress || "<not set>");
  console.log("Fund amount:", fundAmount > 0n ? ethers.formatEther(fundAmount) + " ETH" : "0");

  if (refundAddress && !ethers.isAddress(refundAddress)) {
    throw new Error("Invalid SUPPLY_UPDATE_REFUND");
  }

  const tx1 = await spoke.setEnforceSupplyReporting(enforce);
  await tx1.wait();
  console.log("✅ setEnforceSupplyReporting tx:", tx1.hash);

  if (refundAddress) {
    const tx2 = await spoke.setSupplyUpdateOptions(options, refundAddress);
    await tx2.wait();
    console.log("✅ setSupplyUpdateOptions tx:", tx2.hash);
  }

  const tx3 = await spoke.setAutoReportSupply(autoReport);
  await tx3.wait();
  console.log("✅ setAutoReportSupply tx:", tx3.hash);

  if (fundAmount > 0n) {
    const sendTx = await signer.sendTransaction({ to: spokeAddress, value: fundAmount });
    console.log("Funding tx:", sendTx.hash);
    await sendTx.wait();
    console.log("✅ Spoke funded");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
