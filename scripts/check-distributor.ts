import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const TOKEN_ADDRESS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    
    console.log("Checking distributor state...");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`Distributor: ${ZK_DISTRIBUTOR}`);
    
    const tokenAbi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address, address) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)"
    ];
    
    const distributorAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function PROVIDER_ROLE() view returns (bytes32)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    const balance = await token.balanceOf(deployer.address);
    const allowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
    const providerBalance = await distributor.providerBalance(deployer.address);
    const providerRole = await distributor.PROVIDER_ROLE();
    const hasRole = await distributor.hasRole(providerRole, deployer.address);
    
    console.log(`\nDeployer balance: ${ethers.formatEther(balance)} MYNT`);
    console.log(`Allowance: ${ethers.formatEther(allowance)} MYNT`);
    console.log(`Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`Has PROVIDER_ROLE: ${hasRole}`);
    
    // Check if distributor contract exists
    const code = await ethers.provider.getCode(ZK_DISTRIBUTOR);
    console.log(`\nDistributor code length: ${code.length} bytes`);
    if (code.length <= 2) {
        console.log("❌ Distributor contract not deployed at this address!");
    } else {
        console.log("✅ Distributor contract exists");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
