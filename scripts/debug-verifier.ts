import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("=".repeat(80));
    console.log("DEBUG VERIFIER");
    console.log("=".repeat(80));
    
    const ZK_DIST = "0xfc074079e921C3297Fb95DF314741B11d6e1efB3";
    const VERIFIER = "0x725bC5d5C75Dc6afB4e61A43fbC35909866e4C8e";
    
    // Check verifier contract
    const verifierAbi = [
        "function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) public view returns (bool)"
    ];
    
    const verifier = await ethers.getContractAt(verifierAbi, VERIFIER);
    
    // Real proof from backend
    const proofData = {
        "proof": {
            "a": ["10455068102064633131420971223836880839675185242177218075336729884690740219460", "9846487193757016688562661662171065109813363159258197878240990828343015356620"],
            "b": [["3743144028260337951361738152898783598666166284659966822939010323331943097144", "18681052967113552367387664454039476864028113457546558066703027394259520037280"], ["19467925390351706685631038027381406242088055505576746138707527031982422598212", "14198667199779127200454016103158358883462726806038664199355592380609914378224"]],
            "c": ["12687655495183087660953732586479512696221208585293932655702275316142986634974", "8097587356553742379374951860206864434265232681371312030340992869261854962756"]
        },
        "public_signals": ["15523930645614966092010330480312289387025943186142241989971870957131568628574", "1000000000000000000", "3481439718738191935112514415589520947750175814048990839390837748958871156536"]
    };
    
    // Format for verifier
    const pA = [BigInt(proofData.proof.a[0]), BigInt(proofData.proof.a[1])];
    const pB = [
        [BigInt(proofData.proof.b[0][0]), BigInt(proofData.proof.b[0][1])],
        [BigInt(proofData.proof.b[1][0]), BigInt(proofData.proof.b[1][1])]
    ];
    const pC = [BigInt(proofData.proof.c[0]), BigInt(proofData.proof.c[1])];
    const pubSignals = proofData.public_signals.map(s => BigInt(s));
    
    console.log("\n📝 Calling verifier directly...");
    console.log(`   pA: ${pA.map(x => x.toString().slice(0, 20) + '...')}`);
    console.log(`   pB: [[...], [...]]`);
    console.log(`   pC: ${pC.map(x => x.toString().slice(0, 20) + '...')}`);
    console.log(`   pubSignals: ${pubSignals.map(x => x.toString().slice(0, 20) + '...')}`);
    
    try {
        const result = await verifier.verifyProof(pA, pB, pC, pubSignals);
        console.log(`   ✅ Verification result: ${result}`);
    } catch (e: any) {
        console.log(`   ❌ Verification failed: ${e.message}`);
        
        // The verifier might expect a different format
        // Let's try with reversed b arrays (common issue)
        console.log("\n📝 Trying with reversed B array order...");
        const pB_reversed = [
            [BigInt(proofData.proof.b[0][1]), BigInt(proofData.proof.b[0][0])],
            [BigInt(proofData.proof.b[1][1]), BigInt(proofData.proof.b[1][0])]
        ];
        
        try {
            const result2 = await verifier.verifyProof(pA, pB_reversed, pC, pubSignals);
            console.log(`   ✅ Verification result (reversed): ${result2}`);
        } catch (e2: any) {
            console.log(`   ❌ Still failed: ${e2.message}`);
        }
    }
    
    // Check if it's a different verifier interface
    console.log("\n📝 Checking verifier bytecode...");
    const code = await ethers.provider.getCode(VERIFIER);
    console.log(`   Bytecode size: ${(code.length - 2) / 2} bytes`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
