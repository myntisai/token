import { ethers } from "hardhat";

/**
 * Upgrade proxy to new implementation
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    
    const PROXY_ADDRESS = "0x8D7817B77692Ad0B1D0D399F889A3158104291a5";
    const NEW_IMPL = "0x22e4001b354C98abF7e692Eca5F3bF5cC56773Ca";
    
    console.log("Upgrading proxy:", PROXY_ADDRESS);
    console.log("New implementation:", NEW_IMPL);
    console.log("Caller:", deployer.address);
    
    const proxy = await ethers.getContractAt("DualPoolStaking", PROXY_ADDRESS);
    
    // Call upgradeTo
    const tx = await proxy.upgradeToAndCall(NEW_IMPL, "0x");
    console.log("Upgrade tx:", tx.hash);
    await tx.wait();
    
    console.log("✅ Upgrade complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
