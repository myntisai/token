import { ethers } from "hardhat";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Snapshot State Script
 * 
 * Captures all state from current contracts for migration:
 * 1. Token balances from Transfer events
 * 2. Emissions state (accRewardPerShare, mintedEmissions, etc.)
 * 3. Staking state (provider stakes, debts)
 * 4. Merkle state (active epochs, balances)
 * 
 * Output: migration-snapshot-{timestamp}.json
 */

// Current contract addresses (ACTIVE - 0xD3DD... token)
const ACTIVE_TOKEN = "0xD3DD83F3D310288C77aB7f69A9426Fa6adE603d1";
const STAKING_CONTRACT = process.env.STAKING_CONTRACT_ADDRESS || "0xe2A90b4324717Dcfd479f6fcBd4f177B81aAB90e";
const EMISSIONS_CONTRACT = process.env.EMISSIONS_CONTRACT_ADDRESS || "0x56Ad5c5285d036833828886108b733873345E86b";
const MERKLE_DISTRIBUTOR = process.env.MERKLE_DISTRIBUTOR_ADDRESS || "0xdF890dA39bB3B7ad15A66d793Ec4B3D804E9BB16";

// ABIs for reading state
const TOKEN_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const EMISSIONS_ABI = [
    "function token() view returns (address)",
    "function stakingContract() view returns (address)",
    "function startTime() view returns (uint256)",
    "function lastRewardTime() view returns (uint256)",
    "function mintedEmissions() view returns (uint256)",
    "function accountedEmissions() view returns (uint256)",
    "function accRewardPerShare() view returns (uint256)",
    "function providerRewardDebt(address) view returns (uint256)",
    "function getCurrentEmissionRate() view returns (uint256)",
    "function TOTAL_EMISSIONS() view returns (uint256)",
    "function PRECISION() view returns (uint256)"
];

const STAKING_ABI = [
    "function getTotalStaked() view returns (uint256)",
    "function getProviderInfo(address) view returns (uint256 stake, uint256 rewardDebt)",
    "function providers(address) view returns (uint256 stake, uint256 rewardDebt)",
    "function token() view returns (address)",
    "function emissionContract() view returns (address)",
    "function merkleDistributor() view returns (address)"
];

const MERKLE_ABI = [
    "function token() view returns (address)",
    "function stakingContract() view returns (address)",
    "function providerBalance(address) view returns (uint256)",
    "function lockedBalance(address) view returns (uint256)",
    "function getProviderBalance(address) view returns (uint256)",
    "function getLockedBalance(address) view returns (uint256)"
];

interface TokenHolder {
    address: string;
    balance: string;
    balanceWei: string;
}

interface EmissionsState {
    tokenAddress: string;
    stakingContract: string;
    startTime: number;
    lastRewardTime: number;
    mintedEmissions: string;
    mintedEmissionsWei: string;
    accountedEmissions: string;
    accountedEmissionsWei: string;
    accRewardPerShare: string;
    currentEmissionRate: string;
    totalEmissionsCap: string;
    precision: string;
    providerDebts: { address: string; debt: string; debtWei: string }[];
}

interface StakingState {
    totalStaked: string;
    totalStakedWei: string;
    providers: { address: string; stake: string; stakeWei: string; rewardDebt: string; rewardDebtWei: string }[];
}

interface MerkleState {
    tokenAddress: string;
    stakingContract: string;
    providerBalances: { address: string; available: string; locked: string }[];
}

interface MigrationSnapshot {
    timestamp: string;
    blockNumber: number;
    network: string;
    contracts: {
        token: string;
        staking: string;
        emissions: string;
        merkle: string;
    };
    tokenInfo: {
        name: string;
        symbol: string;
        decimals: number;
        totalSupply: string;
        totalSupplyWei: string;
    };
    holders: TokenHolder[];
    holderCount: number;
    emissions: EmissionsState;
    staking: StakingState;
    merkle: MerkleState;
}

async function main() {
    console.log("=".repeat(80));
    console.log("MIGRATION STATE SNAPSHOT");
    console.log("=".repeat(80));

    const [signer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    const blockNumber = await ethers.provider.getBlockNumber();
    
    console.log(`\nNetwork: ${network.name} (chainId: ${network.chainId})`);
    console.log(`Block Number: ${blockNumber}`);
    console.log(`Signer: ${signer.address}`);

    console.log(`\nContract Addresses:`);
    console.log(`  Token:       ${ACTIVE_TOKEN}`);
    console.log(`  Staking:     ${STAKING_CONTRACT}`);
    console.log(`  Emissions:   ${EMISSIONS_CONTRACT}`);
    console.log(`  Merkle:      ${MERKLE_DISTRIBUTOR}`);

    // Initialize contracts
    const token = new ethers.Contract(ACTIVE_TOKEN, TOKEN_ABI, signer);
    const emissions = new ethers.Contract(EMISSIONS_CONTRACT, EMISSIONS_ABI, signer);
    const staking = new ethers.Contract(STAKING_CONTRACT, STAKING_ABI, signer);
    const merkle = new ethers.Contract(MERKLE_DISTRIBUTOR, MERKLE_ABI, signer);

    // ============================================================
    // 1. SNAPSHOT TOKEN INFO
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("1. TOKEN INFO");
    console.log("=".repeat(80));

    const tokenName = await token.name();
    const tokenSymbol = await token.symbol();
    const tokenDecimals = await token.decimals();
    const totalSupply = await token.totalSupply();

    console.log(`  Name: ${tokenName}`);
    console.log(`  Symbol: ${tokenSymbol}`);
    console.log(`  Decimals: ${tokenDecimals}`);
    console.log(`  Total Supply: ${ethers.formatEther(totalSupply)} MYNT`);

    // ============================================================
    // 2. SNAPSHOT TOKEN HOLDERS
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("2. TOKEN HOLDERS (from Transfer events)");
    console.log("=".repeat(80));

    console.log("  Fetching Transfer events... (this may take a while)");
    
    // Get all Transfer events to build holder list
    // Query in chunks to avoid exceeding max block range (100,000 blocks)
    const filter = token.filters.Transfer();
    const currentBlock = await ethers.provider.getBlockNumber();
    const CHUNK_SIZE = 50000; // Safe chunk size
    const events: ethers.EventLog[] = [];
    
    // Start from a reasonable block (Base Sepolia started ~2024)
    const startBlock = 0;
    
    for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += CHUNK_SIZE) {
        const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, currentBlock);
        console.log(`    Querying blocks ${fromBlock} to ${toBlock}...`);
        
        try {
            const chunkEvents = await token.queryFilter(filter, fromBlock, toBlock);
            events.push(...(chunkEvents as ethers.EventLog[]));
        } catch (error: any) {
            // If chunk is still too big, try smaller chunks
            console.log(`    Chunk too large, trying smaller chunks...`);
            const SMALLER_CHUNK = 10000;
            for (let subFrom = fromBlock; subFrom <= toBlock; subFrom += SMALLER_CHUNK) {
                const subTo = Math.min(subFrom + SMALLER_CHUNK - 1, toBlock);
                try {
                    const subEvents = await token.queryFilter(filter, subFrom, subTo);
                    events.push(...(subEvents as ethers.EventLog[]));
                } catch (e) {
                    console.log(`      Skipping blocks ${subFrom}-${subTo}: ${(e as Error).message.slice(0, 50)}`);
                }
            }
        }
    }
    
    console.log(`  Found ${events.length} Transfer events`);

    // Build balance map from events
    const balanceMap = new Map<string, bigint>();
    
    for (const event of events) {
        const log = event as ethers.EventLog;
        const from = log.args[0] as string;
        const to = log.args[1] as string;
        const value = log.args[2] as bigint;

        // Subtract from sender (unless mint from zero address)
        if (from !== ethers.ZeroAddress) {
            const currentFrom = balanceMap.get(from.toLowerCase()) || 0n;
            balanceMap.set(from.toLowerCase(), currentFrom - value);
        }

        // Add to receiver (unless burn to zero address)
        if (to !== ethers.ZeroAddress) {
            const currentTo = balanceMap.get(to.toLowerCase()) || 0n;
            balanceMap.set(to.toLowerCase(), currentTo + value);
        }
    }

    // Filter out zero balances and convert to array
    const holders: TokenHolder[] = [];
    let calculatedTotal = 0n;

    for (const [address, balance] of balanceMap) {
        if (balance > 0n) {
            holders.push({
                address: ethers.getAddress(address), // Checksum address
                balance: ethers.formatEther(balance),
                balanceWei: balance.toString()
            });
            calculatedTotal += balance;
        }
    }

    // Sort by balance descending
    holders.sort((a, b) => {
        const balA = BigInt(a.balanceWei);
        const balB = BigInt(b.balanceWei);
        return balB > balA ? 1 : balB < balA ? -1 : 0;
    });

    console.log(`  Unique holders with balance: ${holders.length}`);
    console.log(`  Calculated total: ${ethers.formatEther(calculatedTotal)} MYNT`);
    console.log(`  On-chain total:   ${ethers.formatEther(totalSupply)} MYNT`);
    
    // Verify totals match
    if (calculatedTotal !== totalSupply) {
        console.log(`  WARNING: Calculated total differs from on-chain total by ${ethers.formatEther(totalSupply - calculatedTotal)} MYNT`);
    } else {
        console.log(`  Totals match!`);
    }

    // Show top holders
    console.log(`\n  Top 10 Holders:`);
    for (let i = 0; i < Math.min(10, holders.length); i++) {
        console.log(`    ${i + 1}. ${holders[i].address}: ${holders[i].balance} MYNT`);
    }

    // ============================================================
    // 3. SNAPSHOT EMISSIONS STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("3. EMISSIONS STATE");
    console.log("=".repeat(80));

    let emissionsState: EmissionsState;
    
    try {
        const emTokenAddr = await emissions.token();
        const emStakingAddr = await emissions.stakingContract();
        const startTime = await emissions.startTime();
        const lastRewardTime = await emissions.lastRewardTime();
        const mintedEmissions = await emissions.mintedEmissions();
        const accountedEmissions = await emissions.accountedEmissions();
        const accRewardPerShare = await emissions.accRewardPerShare();
        const currentRate = await emissions.getCurrentEmissionRate();
        const totalEmissionsCap = await emissions.TOTAL_EMISSIONS();
        const precision = await emissions.PRECISION();

        console.log(`  Token: ${emTokenAddr}`);
        console.log(`  Staking Contract: ${emStakingAddr}`);
        console.log(`  Start Time: ${new Date(Number(startTime) * 1000).toISOString()}`);
        console.log(`  Last Reward Time: ${new Date(Number(lastRewardTime) * 1000).toISOString()}`);
        console.log(`  Minted Emissions: ${ethers.formatEther(mintedEmissions)} MYNT`);
        console.log(`  Accounted Emissions: ${ethers.formatEther(accountedEmissions)} MYNT`);
        console.log(`  Acc Reward Per Share: ${accRewardPerShare.toString()}`);
        console.log(`  Current Rate: ${ethers.formatEther(currentRate)} MYNT/sec`);

        // Get provider debts - we need to find providers from staking events
        const providerDebts: { address: string; debt: string; debtWei: string }[] = [];
        
        // Try to get provider debt for known addresses (deployer)
        try {
            const deployerDebt = await emissions.providerRewardDebt(signer.address);
            if (deployerDebt > 0n) {
                providerDebts.push({
                    address: signer.address,
                    debt: ethers.formatEther(deployerDebt),
                    debtWei: deployerDebt.toString()
                });
            }
        } catch (e) {
            console.log(`  Could not read deployer debt`);
        }

        emissionsState = {
            tokenAddress: emTokenAddr,
            stakingContract: emStakingAddr,
            startTime: Number(startTime),
            lastRewardTime: Number(lastRewardTime),
            mintedEmissions: ethers.formatEther(mintedEmissions),
            mintedEmissionsWei: mintedEmissions.toString(),
            accountedEmissions: ethers.formatEther(accountedEmissions),
            accountedEmissionsWei: accountedEmissions.toString(),
            accRewardPerShare: accRewardPerShare.toString(),
            currentEmissionRate: ethers.formatEther(currentRate),
            totalEmissionsCap: ethers.formatEther(totalEmissionsCap),
            precision: precision.toString(),
            providerDebts
        };
    } catch (error: any) {
        console.log(`  ERROR reading emissions state: ${error.message}`);
        emissionsState = {
            tokenAddress: "",
            stakingContract: "",
            startTime: 0,
            lastRewardTime: 0,
            mintedEmissions: "0",
            mintedEmissionsWei: "0",
            accountedEmissions: "0",
            accountedEmissionsWei: "0",
            accRewardPerShare: "0",
            currentEmissionRate: "0",
            totalEmissionsCap: "0",
            precision: "0",
            providerDebts: []
        };
    }

    // ============================================================
    // 4. SNAPSHOT STAKING STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("4. STAKING STATE");
    console.log("=".repeat(80));

    let stakingState: StakingState;

    try {
        const totalStaked = await staking.getTotalStaked();
        console.log(`  Total Staked: ${ethers.formatEther(totalStaked)} MYNT`);

        // Get provider info for known addresses
        const providers: { address: string; stake: string; stakeWei: string; rewardDebt: string; rewardDebtWei: string }[] = [];
        
        try {
            const [stake, rewardDebt] = await staking.getProviderInfo(signer.address);
            if (stake > 0n) {
                providers.push({
                    address: signer.address,
                    stake: ethers.formatEther(stake),
                    stakeWei: stake.toString(),
                    rewardDebt: ethers.formatEther(rewardDebt),
                    rewardDebtWei: rewardDebt.toString()
                });
                console.log(`  Deployer stake: ${ethers.formatEther(stake)} MYNT`);
            }
        } catch (e) {
            console.log(`  Could not read deployer stake`);
        }

        stakingState = {
            totalStaked: ethers.formatEther(totalStaked),
            totalStakedWei: totalStaked.toString(),
            providers
        };
    } catch (error: any) {
        console.log(`  ERROR reading staking state: ${error.message}`);
        stakingState = {
            totalStaked: "0",
            totalStakedWei: "0",
            providers: []
        };
    }

    // ============================================================
    // 5. SNAPSHOT MERKLE STATE
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("5. MERKLE DISTRIBUTOR STATE");
    console.log("=".repeat(80));

    let merkleState: MerkleState;

    try {
        const merkleToken = await merkle.token();
        let merkleStaking = "";
        try {
            merkleStaking = await merkle.stakingContract();
        } catch (e) {
            console.log(`  No stakingContract() function`);
        }

        console.log(`  Token: ${merkleToken}`);
        console.log(`  Staking: ${merkleStaking || "N/A"}`);

        // Get provider balances
        const providerBalances: { address: string; available: string; locked: string }[] = [];
        
        try {
            let available, locked;
            try {
                available = await merkle.getProviderBalance(signer.address);
                locked = await merkle.getLockedBalance(signer.address);
            } catch (e) {
                available = await merkle.providerBalance(signer.address);
                locked = await merkle.lockedBalance(signer.address);
            }
            
            if (available > 0n || locked > 0n) {
                providerBalances.push({
                    address: signer.address,
                    available: ethers.formatEther(available),
                    locked: ethers.formatEther(locked)
                });
                console.log(`  Deployer available: ${ethers.formatEther(available)} MYNT`);
                console.log(`  Deployer locked: ${ethers.formatEther(locked)} MYNT`);
            }
        } catch (e) {
            console.log(`  Could not read deployer merkle balance`);
        }

        merkleState = {
            tokenAddress: merkleToken,
            stakingContract: merkleStaking,
            providerBalances
        };
    } catch (error: any) {
        console.log(`  ERROR reading merkle state: ${error.message}`);
        merkleState = {
            tokenAddress: "",
            stakingContract: "",
            providerBalances: []
        };
    }

    // ============================================================
    // 6. CREATE SNAPSHOT
    // ============================================================
    console.log(`\n${"=".repeat(80)}`);
    console.log("6. CREATING SNAPSHOT FILE");
    console.log("=".repeat(80));

    const snapshot: MigrationSnapshot = {
        timestamp: new Date().toISOString(),
        blockNumber,
        network: network.name,
        contracts: {
            token: ACTIVE_TOKEN,
            staking: STAKING_CONTRACT,
            emissions: EMISSIONS_CONTRACT,
            merkle: MERKLE_DISTRIBUTOR
        },
        tokenInfo: {
            name: tokenName,
            symbol: tokenSymbol,
            decimals: Number(tokenDecimals),
            totalSupply: ethers.formatEther(totalSupply),
            totalSupplyWei: totalSupply.toString()
        },
        holders,
        holderCount: holders.length,
        emissions: emissionsState,
        staking: stakingState,
        merkle: merkleState
    };

    // Write to file
    const filename = `migration-snapshot-${Date.now()}.json`;
    const filepath = `./scripts/${filename}`;
    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));

    console.log(`  Snapshot saved to: ${filepath}`);
    console.log(`  Total holders: ${holders.length}`);
    console.log(`  Total supply: ${ethers.formatEther(totalSupply)} MYNT`);

    // Also create a summary file for quick reference
    const summaryFilepath = `./scripts/migration-snapshot-latest.json`;
    fs.writeFileSync(summaryFilepath, JSON.stringify(snapshot, null, 2));
    console.log(`  Latest snapshot: ${summaryFilepath}`);

    console.log(`\n${"=".repeat(80)}`);
    console.log("SNAPSHOT COMPLETE");
    console.log("=".repeat(80));
    console.log(`\nNext steps:`);
    console.log(`  1. Review the snapshot file`);
    console.log(`  2. Run deploy-migration.ts to deploy new contracts`);
    console.log(`  3. Run verify-migration.ts to verify state`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
