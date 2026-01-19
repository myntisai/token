import { ethers } from "hardhat";

async function main() {
    const ZK_DISTRIBUTOR = process.env.ZK_MERKLE_DISTRIBUTOR_ADDRESS || "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("CHECKING FUNDING FUNCTIONS IN ZKMERKLEDISTRIBUTOR");
    console.log("=".repeat(80));
    console.log(`Distributor: ${ZK_DISTRIBUTOR}`);
    console.log(`Deployer: ${deployer.address}`);
    
    const distributorAbi = [
        "function addProviderBalance(address provider, uint256 amount) external",
        "function depositBalance(uint256 amount) external",
        "function notifyRewardWithTransfer(address provider, uint256 amount) external",
        "function ADMIN_ROLE() view returns (bytes32)",
        "function PROVIDER_ROLE() view returns (bytes32)",
        "function hasRole(bytes32 role, address account) view returns (bool)",
        "function providerBalance(address) view returns (uint256)",
        "function stakingContract() view returns (address)"
    ];
    
    const distributor = await ethers.getContractAt(distributorAbi, ZK_DISTRIBUTOR);
    
    const adminRole = await distributor.ADMIN_ROLE();
    const providerRole = await distributor.PROVIDER_ROLE();
    const hasAdmin = await distributor.hasRole(adminRole, deployer.address);
    const hasProvider = await distributor.hasRole(providerRole, deployer.address);
    const stakingContract = await distributor.stakingContract();
    
    console.log(`\nRoles:`);
    console.log(`  Has ADMIN_ROLE: ${hasAdmin}`);
    console.log(`  Has PROVIDER_ROLE: ${hasProvider}`);
    console.log(`  Staking contract: ${stakingContract}`);
    
    console.log(`\nAvailable funding functions:`);
    console.log(`\n1. addProviderBalance(address provider, uint256 amount)`);
    console.log(`   - Requires: ADMIN_ROLE`);
    console.log(`   - Uses: safeTransferFrom(msg.sender, address(this), amount)`);
    console.log(`   - Status: ${hasAdmin ? "✅ Can call" : "❌ No permission"}`);
    console.log(`   - Issue: transferFrom fails with OFT token`);
    
    console.log(`\n2. depositBalance(uint256 amount)`);
    console.log(`   - Requires: PROVIDER_ROLE`);
    console.log(`   - Uses: safeTransferFrom(msg.sender, address(this), amount)`);
    console.log(`   - Status: ${hasProvider ? "✅ Can call" : "❌ No permission"}`);
    console.log(`   - Issue: transferFrom fails with OFT token`);
    
    console.log(`\n3. notifyRewardWithTransfer(address provider, uint256 amount)`);
    console.log(`   - Requires: msg.sender == stakingContract`);
    console.log(`   - Uses: safeTransferFrom(msg.sender, address(this), amount)`);
    console.log(`   - Status: ${stakingContract !== ethers.ZeroAddress ? "✅ Can call via staking" : "❌ No staking contract"}`);
    console.log(`   - Issue: transferFrom fails with OFT token`);
    
    console.log(`\n⚠️  CONCLUSION:`);
    console.log(`   All funding functions require transferFrom, which fails with OFT token.`);
    console.log(`   There is NO function to manually update provider balance without a transfer.`);
    console.log(`   \n   Workaround options:`);
    console.log(`   1. Add a new function to contract (requires deployment)`);
    console.log(`   2. Use a standard ERC20 token for testing`);
    console.log(`   3. Manually update balance via contract upgrade (complex)`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
