import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("SUBMITTING ZK PROOF TO FINAL DISTRIBUTOR");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xdf25bf6A6e9532A79D16C5f46aE04248ae5bC9BE";
    
    // New proof from backend
    const proofData = {
        "proof": {
            "a": ["21843729067395437276954535786721111047675774624739894383843865929287321476629", "20011263480798990405350021987498280325040981413129291546606246903429838712356"],
            "b": [["1749339628531226095772213269967766538220870116383205969753212621922405108720", "7525541475334353910988720640022194729661547539548917949041064327995393540853"], ["10639862908112680179786361466445081994661695862640046833068290147122769956051", "17607150681968677971488620989175529234080674466233000784562443667720101965834"]],
            "c": ["14654177412676958478869345098220184420566609817611242397036837125899681573548", "8602148302662338261622931729601938967539957232893281018518424563628855350464"]
        },
        "public_signals": ["15523930645614966092010330480312289387025943186142241989971870957131568628574", "1000000000000000000", "3481439718738191935112514415589520947750175814048990839390837748958871156536"],
        "merkle_root": "0xb37f2716f97ebf9b93b844a32737936cfd3bf54c4aa80ce224f068101329c361"
    };
    
    // Format proof for contract
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
    
    const distAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function submitMerkleRoot(bytes32 root, uint256 totalAmount, uint256[] calldata proof, uint256[] calldata publicSignals) external",
        "function merkleRoots(bytes32) view returns (bool)",
        "function batchVerifier() view returns (address)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    const providerBalance = await dist.providerBalance(deployer.address);
    const verifier = await dist.batchVerifier();
    console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    console.log(`   Verifier: ${verifier}`);
    
    // First verify directly with verifier
    console.log("\n📝 Testing verifier directly...");
    const verifierAbi = [
        "function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) public view returns (bool)"
    ];
    const verifierContract = await ethers.getContractAt(verifierAbi, verifier);
    
    const pA = [BigInt(proofData.proof.a[0]), BigInt(proofData.proof.a[1])];
    const pB = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const pC = [BigInt(proofData.proof.c[0]), BigInt(proofData.proof.c[1])];
    
    const verifyResult = await verifierContract.verifyProof(pA, pB, pC, publicSignals);
    console.log(`   Verifier result: ${verifyResult}`);
    
    if (!verifyResult) {
        console.log("\n❌ Proof verification failed!");
        console.log("   The proving key doesn't match the deployed verifier.");
        return;
    }
    
    console.log("\n📝 Submitting Merkle root...");
    
    try {
        const tx = await dist.submitMerkleRoot(merkleRoot, totalAmount, proof, publicSignals);
        console.log(`   Tx hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`   ✅ Submitted in block ${receipt!.blockNumber}!`);
        
        const isValid = await dist.merkleRoots(merkleRoot);
        console.log(`   Root stored: ${isValid}`);
        
        console.log("\n" + "=".repeat(80));
        console.log("✅ SUCCESS! ZK PROOF VERIFIED ON-CHAIN");
        console.log("=".repeat(80));
        console.log(`\nDistributor: ${ZK_DIST}`);
        console.log(`Merkle root: ${merkleRoot}`);
        console.log(`Test user can claim: 0x1234567890123456789012345678901234567890`);
        console.log(`Amount: 1 MYNT`);
        
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
