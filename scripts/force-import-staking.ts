import { ethers, upgrades } from "hardhat";

async function main() {
    const STAKING_PROXY = process.env.STAKING_CONTRACT_ADDRESS || "0x8D7817B77692Ad0B1D0D399F889A3158104291a5";
    
    console.log("Force importing proxy:", STAKING_PROXY);
    
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    await upgrades.forceImport(STAKING_PROXY, DualPoolStaking);
    
    console.log("✅ Proxy imported successfully");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
