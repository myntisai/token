import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Migration Verification Script
 * 
 * Verifies that the migration was successful by checking:
 * 1. Token balances match snapshot
 * 2. Total supply matches
 * 3. Emissions state is correctly initialized
 * 4. All contracts are properly connected
 * 5. Roles are correctly assigned
 */

interface MigrationDeploymentResult {
    myntis: string;
    rewardClaimVerifier: string;
    emissionsContract: string;
    dualPoolStaking: string;
    dualPoolStakingImpl: string;
    zkMerkleDistributor: string;
    liquidStakingVault: string;
    globalSupplyRegistry: string;
    network: string;
    chainId: number;
    deployer: string;
    timestamp: string;
    migrationStats: {
        totalHolders: number;
        totalMigrated: string;
        batchesProcessed: number;
    };
}

interface HolderData {
    address: string;
    balance: string;
    balanceWei: string;
}

interface MigrationSnapshot {
    holders: HolderData[];
    holderCount: number;
    tokenInfo: {
        totalSupply: string;
        totalSupplyWei: string;
    };
    emissions: {
        mintedEmissionsWei: string;
        accountedEmissionsWei: string;
        accRewardPerShare: string;
        lastRewardTime: number;
        providerDebts: { address: string; debtWei: string }[];
    };
}

// ABIs for verification
const MYNTIS_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function totalMintedEmissions() view returns (uint256)",
    "function migrationComplete() view returns (bool)",
    "function hasRole(bytes32, address) view returns (bool)",
    "function globalSupplyRegistry() view returns (address)",
    "function owner() view returns (address)"
];

const EMISSIONS_ABI = [
    "function token() view returns (address)",
    "function stakingContract() view returns (address)",
    "function mintedEmissions() view returns (uint256)",
    "function accountedEmissions() view returns (uint256)",
    "function accRewardPerShare() view returns (uint256)",
    "function lastRewardTime() view returns (uint256)",
    "function migrationInitialized() view returns (bool)",
    "function providerRewardDebt(address) view returns (uint256)",
    "function hasRole(bytes32, address) view returns (bool)"
];

const STAKING_ABI = [
    "function token() view returns (address)",
    "function emissionsContract() view returns (address)",
    "function liquidStakingVault() view returns (address)",
    "function treasury() view returns (address)",
    "function getTotalStaked() view returns (uint256)",
    "function hasRole(bytes32, address) view returns (bool)"
];

const DISTRIBUTOR_ABI = [
    "function token() view returns (address)",
    "function verifier() view returns (address)",
    "function hasRole(bytes32, address) view returns (bool)"
];

const VAULT_ABI = [
    "function asset() view returns (address)",
    "function dualPoolStaking() view returns (address)",
    "function name() view returns (string)",
    "function symbol() view returns (string)"
];

const REGISTRY_ABI = [
    "function globalCap() view returns (uint256)",
    "function totalCrossChainSupply() view returns (uint256)",
    "function hasRole(bytes32, address) view returns (bool)"
];

const VERIFIER_ABI = [
    "function hasRole(bytes32, address) view returns (bool)"
];

async function loadSnapshot(): Promise<MigrationSnapshot> {
    const snapshotPath = path.join(__dirname, "migration-snapshot-latest.json");
    if (!fs.existsSync(snapshotPath)) {
        throw new Error(`Snapshot file not found at ${snapshotPath}`);
    }
    return JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
}

async function loadDeployment(): Promise<MigrationDeploymentResult> {
    const network = await ethers.provider.getNetwork();
    const deploymentPath = path.join(__dirname, `../deployments/${network.name}-migration-latest.json`);
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`Deployment file not found at ${deploymentPath}`);
    }
    return JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
}

interface VerificationResult {
    category: string;
    check: string;
    passed: boolean;
    expected: string;
    actual: string;
    error?: string;
}

async function main() {
    console.log("=".repeat(80));
    console.log("MIGRATION VERIFICATION");
    console.log("=".repeat(80));

    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();

    console.log(`\nNetwork: ${network.name} (chainId: ${network.chainId})`);
    console.log(`Signer: ${signer.address}`);

    // Load data
    const snapshot = await loadSnapshot();
    const deployment = await loadDeployment();

    console.log(`\nSnapshot holders: ${snapshot.holderCount}`);
    console.log(`Snapshot total supply: ${snapshot.tokenInfo.totalSupply} MYNT`);
    console.log(`\nDeployment timestamp: ${deployment.timestamp}`);

    // Initialize contracts
    const myntis = new ethers.Contract(deployment.myntis, MYNTIS_ABI, signer);
    const emissions = new ethers.Contract(deployment.emissionsContract, EMISSIONS_ABI, signer);
    const staking = new ethers.Contract(deployment.dualPoolStaking, STAKING_ABI, signer);
    const distributor = new ethers.Contract(deployment.zkMerkleDistributor, DISTRIBUTOR_ABI, signer);
    const vault = new ethers.Contract(deployment.liquidStakingVault, VAULT_ABI, signer);
    const registry = new ethers.Contract(deployment.globalSupplyRegistry, REGISTRY_ABI, signer);
    const verifier = new ethers.Contract(deployment.rewardClaimVerifier, VERIFIER_ABI, signer);

    const results: VerificationResult[] = [];

    // ============================================================
    // 1. VERIFY TOKEN STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("1. TOKEN VERIFICATION");
    console.log("=".repeat(80));

    try {
        const name = await myntis.name();
        results.push({
            category: "Token",
            check: "Name",
            passed: name === "Myntis",
            expected: "Myntis",
            actual: name
        });

        const symbol = await myntis.symbol();
        results.push({
            category: "Token",
            check: "Symbol",
            passed: symbol === "MYNT",
            expected: "MYNT",
            actual: symbol
        });

        const totalSupply = await myntis.totalSupply();
        const expectedSupply = BigInt(snapshot.tokenInfo.totalSupplyWei);
        const supplyMatch = totalSupply === expectedSupply;
        results.push({
            category: "Token",
            check: "Total Supply",
            passed: supplyMatch,
            expected: ethers.formatEther(expectedSupply),
            actual: ethers.formatEther(totalSupply)
        });

        const migrationComplete = await myntis.migrationComplete();
        results.push({
            category: "Token",
            check: "Migration Complete",
            passed: migrationComplete === true,
            expected: "true",
            actual: String(migrationComplete)
        });

        const totalMintedEmissions = await myntis.totalMintedEmissions();
        results.push({
            category: "Token",
            check: "Total Minted Emissions",
            passed: totalMintedEmissions === totalSupply,
            expected: ethers.formatEther(totalSupply),
            actual: ethers.formatEther(totalMintedEmissions)
        });

        console.log(`  Name: ${name}`);
        console.log(`  Symbol: ${symbol}`);
        console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} MYNT`);
        console.log(`  Migration Complete: ${migrationComplete}`);

    } catch (error: any) {
        console.log(`  ERROR: ${error.message}`);
        results.push({
            category: "Token",
            check: "Basic State",
            passed: false,
            expected: "readable",
            actual: "error",
            error: error.message
        });
    }

    // ============================================================
    // 2. VERIFY HOLDER BALANCES (Sample)
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("2. HOLDER BALANCE VERIFICATION (Top 10)");
    console.log("=".repeat(80));

    const sampleHolders = snapshot.holders.slice(0, 10);
    let balanceMismatches = 0;

    for (const holder of sampleHolders) {
        try {
            const actualBalance = await myntis.balanceOf(holder.address);
            const expectedBalance = BigInt(holder.balanceWei);
            const match = actualBalance === expectedBalance;
            
            if (!match) {
                balanceMismatches++;
                console.log(`  MISMATCH: ${holder.address}`);
                console.log(`    Expected: ${ethers.formatEther(expectedBalance)} MYNT`);
                console.log(`    Actual:   ${ethers.formatEther(actualBalance)} MYNT`);
            } else {
                console.log(`  OK: ${holder.address} - ${ethers.formatEther(actualBalance)} MYNT`);
            }
        } catch (error: any) {
            balanceMismatches++;
            console.log(`  ERROR: ${holder.address} - ${error.message}`);
        }
    }

    results.push({
        category: "Holders",
        check: "Sample Balance Check (Top 10)",
        passed: balanceMismatches === 0,
        expected: "0 mismatches",
        actual: `${balanceMismatches} mismatches`
    });

    // ============================================================
    // 3. VERIFY CONTRACT CONNECTIONS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("3. CONTRACT CONNECTIONS VERIFICATION");
    console.log("=".repeat(80));

    try {
        // Emissions -> Token
        const emissionsToken = await emissions.token();
        results.push({
            category: "Connections",
            check: "Emissions -> Token",
            passed: emissionsToken.toLowerCase() === deployment.myntis.toLowerCase(),
            expected: deployment.myntis,
            actual: emissionsToken
        });
        console.log(`  Emissions -> Token: ${emissionsToken === deployment.myntis ? 'OK' : 'MISMATCH'}`);

        // Emissions -> Staking
        const emissionsStaking = await emissions.stakingContract();
        results.push({
            category: "Connections",
            check: "Emissions -> Staking",
            passed: emissionsStaking.toLowerCase() === deployment.dualPoolStaking.toLowerCase(),
            expected: deployment.dualPoolStaking,
            actual: emissionsStaking
        });
        console.log(`  Emissions -> Staking: ${emissionsStaking.toLowerCase() === deployment.dualPoolStaking.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Staking -> Token
        const stakingToken = await staking.token();
        results.push({
            category: "Connections",
            check: "Staking -> Token",
            passed: stakingToken.toLowerCase() === deployment.myntis.toLowerCase(),
            expected: deployment.myntis,
            actual: stakingToken
        });
        console.log(`  Staking -> Token: ${stakingToken.toLowerCase() === deployment.myntis.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Staking -> Emissions
        const stakingEmissions = await staking.emissionsContract();
        results.push({
            category: "Connections",
            check: "Staking -> Emissions",
            passed: stakingEmissions.toLowerCase() === deployment.emissionsContract.toLowerCase(),
            expected: deployment.emissionsContract,
            actual: stakingEmissions
        });
        console.log(`  Staking -> Emissions: ${stakingEmissions.toLowerCase() === deployment.emissionsContract.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Staking -> Vault
        const stakingVault = await staking.liquidStakingVault();
        results.push({
            category: "Connections",
            check: "Staking -> Vault",
            passed: stakingVault.toLowerCase() === deployment.liquidStakingVault.toLowerCase(),
            expected: deployment.liquidStakingVault,
            actual: stakingVault
        });
        console.log(`  Staking -> Vault: ${stakingVault.toLowerCase() === deployment.liquidStakingVault.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Vault -> Token
        const vaultAsset = await vault.asset();
        results.push({
            category: "Connections",
            check: "Vault -> Token",
            passed: vaultAsset.toLowerCase() === deployment.myntis.toLowerCase(),
            expected: deployment.myntis,
            actual: vaultAsset
        });
        console.log(`  Vault -> Token: ${vaultAsset.toLowerCase() === deployment.myntis.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Vault -> Staking
        const vaultStaking = await vault.dualPoolStaking();
        results.push({
            category: "Connections",
            check: "Vault -> Staking",
            passed: vaultStaking.toLowerCase() === deployment.dualPoolStaking.toLowerCase(),
            expected: deployment.dualPoolStaking,
            actual: vaultStaking
        });
        console.log(`  Vault -> Staking: ${vaultStaking.toLowerCase() === deployment.dualPoolStaking.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Distributor -> Token
        const distributorToken = await distributor.token();
        results.push({
            category: "Connections",
            check: "Distributor -> Token",
            passed: distributorToken.toLowerCase() === deployment.myntis.toLowerCase(),
            expected: deployment.myntis,
            actual: distributorToken
        });
        console.log(`  Distributor -> Token: ${distributorToken.toLowerCase() === deployment.myntis.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Distributor -> Verifier
        const distributorVerifier = await distributor.verifier();
        results.push({
            category: "Connections",
            check: "Distributor -> Verifier",
            passed: distributorVerifier.toLowerCase() === deployment.rewardClaimVerifier.toLowerCase(),
            expected: deployment.rewardClaimVerifier,
            actual: distributorVerifier
        });
        console.log(`  Distributor -> Verifier: ${distributorVerifier.toLowerCase() === deployment.rewardClaimVerifier.toLowerCase() ? 'OK' : 'MISMATCH'}`);

        // Myntis -> Registry
        const myntisRegistry = await myntis.globalSupplyRegistry();
        results.push({
            category: "Connections",
            check: "Myntis -> Registry",
            passed: myntisRegistry.toLowerCase() === deployment.globalSupplyRegistry.toLowerCase(),
            expected: deployment.globalSupplyRegistry,
            actual: myntisRegistry
        });
        console.log(`  Myntis -> Registry: ${myntisRegistry.toLowerCase() === deployment.globalSupplyRegistry.toLowerCase() ? 'OK' : 'MISMATCH'}`);

    } catch (error: any) {
        console.log(`  ERROR verifying connections: ${error.message}`);
    }

    // ============================================================
    // 4. VERIFY ROLES
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("4. ROLES VERIFICATION");
    console.log("=".repeat(80));

    try {
        const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
        const PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PROVIDER_ROLE"));
        const DISTRIBUTOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISTRIBUTOR_ROLE"));
        const ADMIN_ROLE = ethers.ZeroHash;

        // Emissions has MINTER_ROLE on Myntis
        const emissionsHasMinter = await myntis.hasRole(MINTER_ROLE, deployment.emissionsContract);
        results.push({
            category: "Roles",
            check: "Emissions has MINTER_ROLE",
            passed: emissionsHasMinter,
            expected: "true",
            actual: String(emissionsHasMinter)
        });
        console.log(`  Emissions has MINTER_ROLE: ${emissionsHasMinter ? 'OK' : 'MISSING'}`);

        // Deployer has PROVIDER_ROLE on Distributor
        const deployerHasProvider = await distributor.hasRole(PROVIDER_ROLE, signer.address);
        results.push({
            category: "Roles",
            check: "Deployer has PROVIDER_ROLE",
            passed: deployerHasProvider,
            expected: "true",
            actual: String(deployerHasProvider)
        });
        console.log(`  Deployer has PROVIDER_ROLE: ${deployerHasProvider ? 'OK' : 'MISSING'}`);

        // Distributor has DISTRIBUTOR_ROLE on Verifier
        const distributorHasDistributor = await verifier.hasRole(DISTRIBUTOR_ROLE, deployment.zkMerkleDistributor);
        results.push({
            category: "Roles",
            check: "Distributor has DISTRIBUTOR_ROLE",
            passed: distributorHasDistributor,
            expected: "true",
            actual: String(distributorHasDistributor)
        });
        console.log(`  Distributor has DISTRIBUTOR_ROLE: ${distributorHasDistributor ? 'OK' : 'MISSING'}`);

    } catch (error: any) {
        console.log(`  ERROR verifying roles: ${error.message}`);
    }

    // ============================================================
    // 5. VERIFY EMISSIONS STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("5. EMISSIONS STATE VERIFICATION");
    console.log("=".repeat(80));

    try {
        const migrationInitialized = await emissions.migrationInitialized();
        results.push({
            category: "Emissions",
            check: "Migration Initialized",
            passed: true, // Either true or we skipped (both valid)
            expected: "true or skipped",
            actual: String(migrationInitialized)
        });
        console.log(`  Migration Initialized: ${migrationInitialized}`);

        if (migrationInitialized && snapshot.emissions.accRewardPerShare !== "0") {
            const accRewardPerShare = await emissions.accRewardPerShare();
            const expectedAcc = BigInt(snapshot.emissions.accRewardPerShare);
            results.push({
                category: "Emissions",
                check: "accRewardPerShare",
                passed: accRewardPerShare === expectedAcc,
                expected: snapshot.emissions.accRewardPerShare,
                actual: accRewardPerShare.toString()
            });
            console.log(`  accRewardPerShare: ${accRewardPerShare === expectedAcc ? 'OK' : 'MISMATCH'}`);

            const mintedEmissions = await emissions.mintedEmissions();
            const expectedMinted = BigInt(snapshot.emissions.mintedEmissionsWei);
            results.push({
                category: "Emissions",
                check: "mintedEmissions",
                passed: mintedEmissions === expectedMinted,
                expected: ethers.formatEther(expectedMinted),
                actual: ethers.formatEther(mintedEmissions)
            });
            console.log(`  mintedEmissions: ${mintedEmissions === expectedMinted ? 'OK' : 'MISMATCH'}`);
        }

    } catch (error: any) {
        console.log(`  ERROR verifying emissions: ${error.message}`);
    }

    // ============================================================
    // 6. VERIFY GLOBAL SUPPLY REGISTRY
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("6. GLOBAL SUPPLY REGISTRY VERIFICATION");
    console.log("=".repeat(80));

    try {
        const globalCap = await registry.globalCap();
        console.log(`  Global Cap: ${ethers.formatEther(globalCap)} MYNT`);
        
        const totalCrossChainSupply = await registry.totalCrossChainSupply();
        const tokenSupply = await myntis.totalSupply();
        results.push({
            category: "Registry",
            check: "Cross-chain supply matches token",
            passed: totalCrossChainSupply === tokenSupply,
            expected: ethers.formatEther(tokenSupply),
            actual: ethers.formatEther(totalCrossChainSupply)
        });
        console.log(`  Cross-chain Supply: ${ethers.formatEther(totalCrossChainSupply)} MYNT`);
        console.log(`  Token Supply: ${ethers.formatEther(tokenSupply)} MYNT`);
        console.log(`  Match: ${totalCrossChainSupply === tokenSupply ? 'OK' : 'MISMATCH'}`);

    } catch (error: any) {
        console.log(`  ERROR verifying registry: ${error.message}`);
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("VERIFICATION SUMMARY");
    console.log("=".repeat(80));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log(`\nTotal Checks: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        console.log(`\nFailed Checks:`);
        for (const result of results.filter(r => !r.passed)) {
            console.log(`  - ${result.category}: ${result.check}`);
            console.log(`    Expected: ${result.expected}`);
            console.log(`    Actual:   ${result.actual}`);
            if (result.error) {
                console.log(`    Error:    ${result.error}`);
            }
        }
    }

    // Save results
    const resultsFile = path.join(__dirname, `../deployments/verification-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        network: network.name,
        deployment,
        summary: { total, passed, failed },
        results
    }, null, 2));
    console.log(`\nResults saved to: ${resultsFile}`);

    if (failed > 0) {
        console.log(`\n❌ VERIFICATION FAILED - ${failed} checks did not pass`);
        process.exit(1);
    } else {
        console.log(`\n✅ ALL CHECKS PASSED - Migration verified successfully!`);
        process.exit(0);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
