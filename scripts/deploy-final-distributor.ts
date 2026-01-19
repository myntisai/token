import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DEPLOYING FINAL ZK MERKLE DISTRIBUTOR");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    
    const CORRECT_TOKEN = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const NEW_VERIFIER = "0x9BbA803d9D8cd03742486AC382d1Be1ABD9f9a63";
    
    console.log(`\n📝 Configuration:`);
    console.log(`   Token: ${CORRECT_TOKEN}`);
    console.log(`   Verifier: ${NEW_VERIFIER}`);
    console.log(`   Admin: ${deployer.address}`);
    
    // Deploy
    console.log("\n📝 Deploying ZKMerkleDistributor...");
    const ZKMerkleDistributor = await ethers.getContractFactory("ZKMerkleDistributor");
    const distributor = await ZKMerkleDistributor.deploy(CORRECT_TOKEN, NEW_VERIFIER, deployer.address);
    await distributor.waitForDeployment();
    const distributorAddress = await distributor.getAddress();
    console.log(`   ✅ Deployed to: ${distributorAddress}`);
    
    // Setup
    const distAbi = [
        "function token() view returns (address)",
        "function batchVerifier() view returns (address)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function grantRole(bytes32 role, address account)",
        "function providerBalance(address) view returns (uint256)",
        "function depositBalance(uint256) external"
    ];
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) external returns (bool)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, distributorAddress);
    const token = await ethers.getContractAt(tokenAbi, CORRECT_TOKEN);
    
    console.log("\n📝 Verifying...");
    console.log(`   Token: ${await dist.token()}`);
    console.log(`   Verifier: ${await dist.batchVerifier()}`);
    
    // Grant PROVIDER_ROLE
    const PROVIDER_ROLE = await dist.PROVIDER_ROLE();
    const hasRole = await dist.hasRole(PROVIDER_ROLE, deployer.address);
    if (!hasRole) {
        console.log("\n📝 Granting PROVIDER_ROLE...");
        await (await dist.grantRole(PROVIDER_ROLE, deployer.address)).wait();
        console.log("   ✅ Granted");
    }
    
    // Fund
    const balance = await token.balanceOf(deployer.address);
    console.log(`\n📝 Deployer balance: ${ethers.formatEther(balance)} MYNT`);
    
    if (balance > ethers.parseEther("10")) {
        const fundAmount = ethers.parseEther("10");
        console.log(`   Funding with ${ethers.formatEther(fundAmount)} MYNT...`);
        await (await token.approve(distributorAddress, fundAmount)).wait();
        await (await dist.depositBalance(fundAmount)).wait();
        const provBal = await dist.providerBalance(deployer.address);
        console.log(`   ✅ Provider balance: ${ethers.formatEther(provBal)} MYNT`);
    } else if (balance > 0n) {
        const fundAmount = balance - ethers.parseEther("0.1");
        if (fundAmount > 0n) {
            console.log(`   Funding with ${ethers.formatEther(fundAmount)} MYNT...`);
            await (await token.approve(distributorAddress, fundAmount)).wait();
            await (await dist.depositBalance(fundAmount)).wait();
            const provBal = await dist.providerBalance(deployer.address);
            console.log(`   ✅ Provider balance: ${ethers.formatEther(provBal)} MYNT`);
        }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ DEPLOYMENT COMPLETE");
    console.log("=".repeat(80));
    console.log(`\n🎯 NEW ZK DISTRIBUTOR: ${distributorAddress}`);
    console.log(`\nUpdate your .env.prod with:`);
    console.log(`ZK_MERKLE_DISTRIBUTOR_ADDRESS=${distributorAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
