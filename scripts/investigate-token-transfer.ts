import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const TOKEN_ADDRESS = "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8";
    const ZK_DISTRIBUTOR = "0xebd5dd492DB4ec069698ACfCCa34FC9dc400737D";
    const fundingAmount = ethers.parseEther("200");
    
    console.log("=".repeat(80));
    console.log("INVESTIGATING TOKEN TRANSFER ISSUE");
    console.log("=".repeat(80));
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`Distributor: ${ZK_DISTRIBUTOR}`);
    
    const tokenAbi = [
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) view returns (uint256)",
        "function paused() view returns (bool)",
        "function decimals() view returns (uint8)"
    ];
    
    const token = await ethers.getContractAt(tokenAbi, TOKEN_ADDRESS);
    
    // Check token state
    console.log("\n📝 Checking token state...");
    try {
        const paused = await token.paused();
        console.log(`Token paused: ${paused}`);
        if (paused) {
            console.log("❌ Token is paused! This will prevent transfers.");
            return;
        }
    } catch (e: any) {
        console.log(`⚠️  Could not check paused state: ${e.message}`);
    }
    
    const decimals = await token.decimals();
    console.log(`Token decimals: ${decimals}`);
    
    const balance = await token.balanceOf(deployer.address);
    console.log(`Deployer balance: ${ethers.formatEther(balance)} MYNT`);
    
    // Check current allowance
    const allowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
    console.log(`Current allowance: ${ethers.formatEther(allowance)} MYNT`);
    
    // Test 1: Simple transfer (not transferFrom)
    console.log("\n📝 Test 1: Simple transfer (not transferFrom)...");
    try {
        const testAmount = ethers.parseEther("1");
        if (balance < testAmount) {
            console.log("⚠️  Insufficient balance for test transfer");
        } else {
            const tx = await token.transfer(ZK_DISTRIBUTOR, testAmount);
            const receipt = await tx.wait();
            console.log(`✅ Simple transfer works: ${receipt.hash}`);
            
            const newBalance = await token.balanceOf(deployer.address);
            const distributorBalance = await token.balanceOf(ZK_DISTRIBUTOR);
            console.log(`Deployer balance after: ${ethers.formatEther(newBalance)} MYNT`);
            console.log(`Distributor balance: ${ethers.formatEther(distributorBalance)} MYNT`);
        }
    } catch (e: any) {
        console.log(`❌ Simple transfer failed: ${e.message}`);
        if (e.data) {
            console.log(`   Error data: ${e.data.slice(0, 50)}...`);
        }
    }
    
    // Test 2: Reset allowance and set again
    console.log("\n📝 Test 2: Resetting allowance...");
    try {
        const resetTx = await token.approve(ZK_DISTRIBUTOR, 0n);
        await resetTx.wait();
        console.log("✅ Allowance reset to 0");
        
        // Wait for state sync
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const newAllowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
        console.log(`Allowance after reset: ${ethers.formatEther(newAllowance)} MYNT`);
        
        // Set allowance again
        console.log("Setting allowance again...");
        const approveTx = await token.approve(ZK_DISTRIBUTOR, fundingAmount);
        const approveReceipt = await approveTx.wait();
        console.log(`✅ Approved in block ${approveReceipt.blockNumber}`);
        
        // Wait for state sync
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const finalAllowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
        console.log(`Final allowance: ${ethers.formatEther(finalAllowance)} MYNT`);
        
        if (finalAllowance < fundingAmount) {
            console.log("❌ Allowance not set correctly!");
            return;
        }
    } catch (e: any) {
        console.log(`❌ Allowance reset/set failed: ${e.message}`);
        return;
    }
    
    // Test 3: Try transferFrom with a small amount
    console.log("\n📝 Test 3: Testing transferFrom with small amount...");
    try {
        const testAmount = ethers.parseEther("1");
        const tx = await token.transferFrom(deployer.address, ZK_DISTRIBUTOR, testAmount);
        const receipt = await tx.wait();
        console.log(`✅ transferFrom works: ${receipt.hash}`);
        
        const newAllowance = await token.allowance(deployer.address, ZK_DISTRIBUTOR);
        console.log(`Allowance after transferFrom: ${ethers.formatEther(newAllowance)} MYNT`);
    } catch (e: any) {
        console.log(`❌ transferFrom failed: ${e.message}`);
        if (e.data) {
            const errorData = e.data;
            console.log(`   Error data: ${errorData}`);
            
            // Try to decode common errors
            const commonErrors = [
                "ERC20InsufficientAllowance(address,uint256,uint256)",
                "ERC20InsufficientBalance(address,uint256,uint256)",
                "SafeERC20FailedOperation(address)"
            ];
            
            for (const errorSig of commonErrors) {
                const errorSelector = ethers.id(errorSig).slice(0, 10);
                if (errorData.startsWith(errorSelector)) {
                    console.log(`   Detected error: ${errorSig}`);
                    // Try to decode parameters
                    try {
                        const iface = new ethers.Interface([`error ${errorSig}`]);
                        const decoded = iface.parseError(errorData);
                        console.log(`   Decoded params:`, decoded.args);
                    } catch (decodeErr) {
                        // Ignore decode errors
                    }
                    break;
                }
            }
        }
    }
    
    // Test 4: Check if distributor contract can receive tokens
    console.log("\n📝 Test 4: Checking distributor contract...");
    const distributorCode = await ethers.provider.getCode(ZK_DISTRIBUTOR);
    console.log(`Distributor code length: ${distributorCode.length} bytes`);
    
    if (distributorCode.length <= 2) {
        console.log("❌ Distributor contract not deployed!");
        return;
    }
    
    // Check distributor's token balance
    const distributorBalance = await token.balanceOf(ZK_DISTRIBUTOR);
    console.log(`Distributor token balance: ${ethers.formatEther(distributorBalance)} MYNT`);
    
    console.log("\n" + "=".repeat(80));
    console.log("INVESTIGATION COMPLETE");
    console.log("=".repeat(80));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
