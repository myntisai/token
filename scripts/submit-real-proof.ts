import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("SUBMITTING REAL ZK PROOF");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    
    // Real proof from backend
    const proofData = {
        "proof": {
            "a": ["10455068102064633131420971223836880839675185242177218075336729884690740219460", "9846487193757016688562661662171065109813363159258197878240990828343015356620"],
            "b": [["3743144028260337951361738152898783598666166284659966822939010323331943097144", "18681052967113552367387664454039476864028113457546558066703027394259520037280"], ["19467925390351706685631038027381406242088055505576746138707527031982422598212", "14198667199779127200454016103158358883462726806038664199355592380609914378224"]],
            "c": ["12687655495183087660953732586479512696221208585293932655702275316142986634974", "8097587356553742379374951860206864434265232681371312030340992869261854962756"]
        },
        "public_signals": ["15523930645614966092010330480312289387025943186142241989971870957131568628574", "1000000000000000000", "3481439718738191935112514415589520947750175814048990839390837748958871156536"],
        "merkle_root": "0xb37f2716f97ebf9b93b844a32737936cfd3bf54c4aa80ce224f068101329c361"
    };
    
    // Format proof for contract (Groth16 format)
    // Contract expects: [a[0], a[1], b[0][0], b[0][1], b[1][0], b[1][1], c[0], c[1]]
    const proof = [
        BigInt(proofData.proof.a[0]),
        BigInt(proofData.proof.a[1]),
        BigInt(proofData.proof.b[0][0]),
        BigInt(proofData.proof.b[0][1]),
        BigInt(proofData.proof.b[1][0]),
        BigInt(proofData.proof.b[1][1]),
        BigInt(proofData.proof.c[0]),
        BigInt(proofData.proof.c[1])
    ];
    
    const publicSignals = proofData.public_signals.map(s => BigInt(s));
    const merkleRoot = proofData.merkle_root;
    const totalAmount = BigInt(proofData.public_signals[1]);
    
    console.log(`\n📝 Proof data:`);
    console.log(`   Merkle root: ${merkleRoot}`);
    console.log(`   Total amount: ${ethers.formatEther(totalAmount)} MYNT`);
    console.log(`   Proof elements: ${proof.length}`);
    console.log(`   Public signals: ${publicSignals.length}`);
    
    const distAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function submitMerkleRoot(bytes32 root, uint256 totalAmount, uint256[] calldata proof, uint256[] calldata publicSignals) external",
        "function merkleRoots(bytes32) view returns (bool)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    const providerBalance = await dist.providerBalance(deployer.address);
    console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    
    console.log("\n📝 Submitting Merkle root...");
    
    try {
        // First try static call to see error
        await dist.submitMerkleRoot.staticCall(merkleRoot, totalAmount, proof, publicSignals);
        console.log("   Static call passed!");
        
        const tx = await dist.submitMerkleRoot(merkleRoot, totalAmount, proof, publicSignals);
        console.log(`   Tx hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`   ✅ Submitted in block ${receipt!.blockNumber}!`);
        
        // Verify root is stored
        const isValid = await dist.merkleRoots(merkleRoot);
        console.log(`   Root stored: ${isValid}`);
        
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
        
        if (e.data) {
            console.log(`\n📝 Error data: ${e.data}`);
        }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("CLAIM INFO");
    console.log("=".repeat(80));
    console.log(`\nDistributor: ${ZK_DIST}`);
    console.log(`Merkle root: ${merkleRoot}`);
    console.log(`Test user: 0x1234567890123456789012345678901234567890`);
    console.log(`Claim amount: 1 MYNT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
