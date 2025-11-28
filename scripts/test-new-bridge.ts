import { ethers } from "hardhat";

const HUB_NEW = "0xE1eFd4598Cb371035F78dD3eb4151A7498F9dEa4";
const ETH_SEPOLIA_EID = 40161;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🌉 Testing NEW OFT Bridge\n");
  
  const hub = await ethers.getContractAt("MyntisOFT", HUB_NEW);
  
  const balance = await hub.balanceOf(deployer.address);
  console.log("MYNT balance:", ethers.formatEther(balance));
  console.log("Is Hub:", await hub.isHub());
  
  const sendParam = {
    dstEid: ETH_SEPOLIA_EID,
    to: ethers.zeroPadValue(deployer.address, 32),
    amountLD: ethers.parseEther("100"),
    minAmountLD: ethers.parseEther("100"),
    extraOptions: "0x0003",
    composeMsg: "0x",
    oftCmd: "0x"
  };
  
  console.log("\nQuoting fee...");
  const fee = await hub.quoteSend.staticCall(sendParam, false);
  console.log("Fee:", ethers.formatEther(fee[0]), "ETH");
  
  console.log("\n🚀 Sending bridge...");
  const tx = await hub.send(
    sendParam,
    { nativeFee: fee[0], lzTokenFee: 0n },
    deployer.address,
    { value: fee[0] }
  );
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("✅ Confirmed!");
  
  const newBalance = await hub.balanceOf(deployer.address);
  console.log("New balance:", ethers.formatEther(newBalance), "MYNT");
  console.log("\n📡 https://testnet.layerzeroscan.com/tx/" + tx.hash);
}

main().catch(console.error);
