#!/usr/bin/env node
/**
 * Poseidon Hash Script
 * 
 * Computes Poseidon hash using circomlibjs for consistency with ZK circuits.
 * This script is called by the backend ZK proof generator service.
 * 
 * Usage: node poseidon_hash.js <input1> <input2> ... <inputN>
 * Output: JSON with hash value
 */

const { buildPoseidon } = require("circomlibjs");

async function main() {
    try {
        // Parse command line arguments (skip node and script name)
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.error(JSON.stringify({ error: "No inputs provided" }));
            process.exit(1);
        }
        
        // Convert arguments to BigInt
        const inputs = args.map(arg => {
            try {
                return BigInt(arg);
            } catch (e) {
                console.error(JSON.stringify({ error: `Invalid input: ${arg}` }));
                process.exit(1);
            }
        });
        
        // Build Poseidon instance
        const poseidon = await buildPoseidon();
        
        // Compute hash (returns field element)
        const hash = poseidon(inputs);
        
        // Convert field element to BigInt using F.toObject()
        // This is the correct way to extract the value from circomlibjs Poseidon
        const hashBigInt = poseidon.F.toObject(hash);
        
        // Output as JSON (as string for JSON compatibility)
        console.log(JSON.stringify({ hash: hashBigInt.toString() }));
        
    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
        process.exit(1);
    }
}

main();
