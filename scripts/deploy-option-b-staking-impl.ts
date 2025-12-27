import { ethers } from "hardhat";

/**
 * Deploy new DualPoolStaking implementation (Option B)
 * Then manually upgrade proxy via execute-proxy-upgrade.ts
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("=".repeat(80));
    console.log("DEPLOY DUAL POOL STAKING IMPLEMENTATION (OPTION B)");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
    console.log(`Network: ${network.name} (chainId: ${network.chainId})`);
    
    // Deploy new implementation
    console.log("\n📝 Deploying new DualPoolStaking implementation...");
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const implementation = await DualPoolStaking.deploy();
    await implementation.waitForDeployment();
    const implAddress = await implementation.getAddress();
    
    console.log(`✅ New implementation deployed to: ${implAddress}`);
    
    const PROXY_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || "0x8D7817B77692Ad0B1D0D399F889A3158104291a5";
    
    console.log("\n📝 Next steps:");
    console.log(`1. Verify implementation contract: ${implAddress}`);
    console.log(`2. Call upgradeTo on proxy: ${PROXY_ADDRESS}`);
    console.log(`3. Verify new functions exist on proxy`);
    
    console.log(`\nManual upgrade command:`);
    console.log(`  cast send ${PROXY_ADDRESS} "upgradeTo(address)" ${implAddress} --rpc-url $RPC_URL --private-key $PRIVATE_KEY`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
