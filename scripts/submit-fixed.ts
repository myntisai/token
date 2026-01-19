import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("SUBMITTING WITH POSEIDON ROOT FROM PUBLIC SIGNALS");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xdf25bf6A6e9532A79D16C5f46aE04248ae5bC9BE";
    
    const proofData = {
        "proof": {
            "a": ["21843729067395437276954535786721111047675774624739894383843865929287321476629", "20011263480798990405350021987498280325040981413129291546606246903429838712356"],
            "b": [["1749339628531226095772213269967766538220870116383205969753212621922405108720", "7525541475334353910988720640022194729661547539548917949041064327995393540853"], ["10639862908112680179786361466445081994661695862640046833068290147122769956051", "17607150681968677971488620989175529234080674466233000784562443667720101965834"]],
            "c": ["14654177412676958478869345098220184420566609817611242397036837125899681573548", "8602148302662338261622931729601938967539957232893281018518424563628855350464"]
        },
        "public_signals": ["15523930645614966092010330480312289387025943186142241989971870957131568628574", "1000000000000000000", "3481439718738191935112514415589520947750175814048990839390837748958871156536"]
    };
    
    // Use public_signals[0] as the merkle root (it's a uint256)
    const merkleRootUint = BigInt(proofData.public_signals[0]);
    const merkleRoot = "0x" + merkleRootUint.toString(16).padStart(64, '0');
    
    const proofA: [bigint, bigint] = [
        BigInt(proofData.proof.a[0]),
        BigInt(proofData.proof.a[1])
    ];
    const proofB: [[bigint, bigint], [bigint, bigint]] = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const proofC: [bigint, bigint] = [
        BigInt(proofData.proof.c[0]),
        BigInt(proofData.proof.c[1])
    ];
    const publicInputs: [bigint, bigint, bigint] = [
        BigInt(proofData.public_signals[0]),
        BigInt(proofData.public_signals[1]),
        BigInt(proofData.public_signals[2])
    ];
    
    const totalAmount = BigInt(proofData.public_signals[1]);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
    
    console.log(`\n📝 Submission data:`);
    console.log(`   Root (from public signals): ${merkleRoot}`);
    console.log(`   Expiry: ${new Date(Number(expiry) * 1000).toISOString()}`);
    console.log(`   Total amount: ${ethers.formatEther(totalAmount)} MYNT`);
    
    const distAbi = [
        "function providerBalance(address) view returns (uint256)",
        "function submitMerkleRoot(bytes32 root, uint256 expiry, uint256 totalClaimableAmount, uint256[2] calldata proofA, uint256[2][2] calldata proofB, uint256[2] calldata proofC, uint256[3] calldata publicInputs) external",
        "function providerMerkleRoots(address, uint256) view returns (bytes32 root, uint256 expiry, bool closed, uint256 totalClaimable, uint256 claimedAmount, bool providerProofVerified, bytes32 batchHash)"
    ];
    
    const dist = await ethers.getContractAt(distAbi, ZK_DIST);
    
    const providerBalance = await dist.providerBalance(deployer.address);
    console.log(`   Provider balance: ${ethers.formatEther(providerBalance)} MYNT`);
    
    console.log("\n📝 Submitting...");
    
    try {
        const tx = await dist.submitMerkleRoot(
            merkleRoot,
            expiry,
            totalAmount,
            proofA,
            proofB,
            proofC,
            publicInputs
        );
        console.log(`   Tx hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`   ✅ Submitted in block ${receipt!.blockNumber}!`);
        
        const root = await dist.providerMerkleRoots(deployer.address, 0);
        console.log(`\n📝 Stored root:`);
        console.log(`   Root: ${root.root}`);
        console.log(`   Total claimable: ${ethers.formatEther(root.totalClaimable)} MYNT`);
        console.log(`   Provider proof verified: ${root.providerProofVerified}`);
        
        console.log("\n" + "=".repeat(80));
        console.log("✅ SUCCESS! ZK PROOF VERIFIED ON-CHAIN");
        console.log("=".repeat(80));
        
    } catch (e: any) {
        console.log(`   ❌ Failed: ${e.message}`);
        if (e.data) {
            console.log(`   Error data: ${e.data}`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
