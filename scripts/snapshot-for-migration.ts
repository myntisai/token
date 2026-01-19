import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// OLD contracts to snapshot FROM (December 27 deployment)
const OLD_TOKEN = "0x5242925C716225C58459f557E5B4Be51373aB767";
const OLD_STAKING = "0x8D7817B77692Ad0B1D0D399F889A3158104291a5";
const OLD_ZK_DISTRIBUTOR = "0xf74dF81441D120E4e4EF1c5bCa9bcde6f44256C8";
const OLD_EMISSIONS = "0x6Dc42e62024F3f18d6fD91F662C19850c1BFD978";

// Protocol contracts to EXCLUDE from user migration
const EXCLUDED_ADDRESSES = [
  // Old contracts
  "0x26B9c344a5245f7402f047F622F57be9E3975718",
  "0xdF890dA39bB3B7ad15A66d793Ec4B3D804E9BB16",
  "0xe2A90b4324717Dcfd479f6fcBd4f177B81aAB90e",
  "0x56Ad5c5285d036833828886108b733873345E86b",
  "0xe136e88Ce8388C153c7674431aa0833B0ba4CFF1",
  "0x1CE9AbFe9810D1FdBd92754714dE0286EE8a58D5",
  "0x71EfdD04D6de862F68AC9B24282B0555Ca0e4b9A",
  // Dec 27 contracts (being superseded)
  OLD_TOKEN,
  OLD_STAKING,
  OLD_ZK_DISTRIBUTOR,
  OLD_EMISSIONS,
  "0x45E241a5018b61BBCA454F88C23363971A13bA96",
  "0xa8699B994A2f5DAf5FA5B42bCDe9CBe75a52E6be",
  "0xf8d7c7E74Bc8B031fb0FdDC66FC725CC126a62b0",
  "0x725bC5d5C75Dc6afB4e61A43fbC35909866e4C8e",
  "0x67Ae52ee859c552CAfabFC08D00bb68D3a2e57bB",
  // New contracts (don't migrate to themselves)
  "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8",
  "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8",
  "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0",
  "0x31b816258ac3b72625169CD37F80ac12191e76ad",
  "0xC3d6e556b9C7dCAE100777e10234944A09A8cEac",
  "0xFBD4a2b0c095dbF14Be62B784c01d4baFaFa57d7",
  "0x10100031DeC4bd7F3475b24318d2E94940e03876",
  "0x2000738e7E3e4dCB58f7e917AAb2fb1F9C78d9E8",
  "0xe44eE55933BD85C9F899fd4820eE783C9832558D",
  // Zero address
  "0x0000000000000000000000000000000000000000",
].map(a => a.toLowerCase());

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const STAKING_ABI = [
  "function getUserInfo(address user) view returns (uint256 amount, uint256 rewardDebt)",
  "function getProviderInfo(address provider) view returns (uint256 stake, uint256 rewardDebt)",
  "function getTotalStaked() view returns (uint256)",
  "function getProviderPoolStaked() view returns (uint256)"
];

const DISTRIBUTOR_ABI = [
  "function providerBalance(address) view returns (uint256)",
  "function lockedBalance(address) view returns (uint256)"
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const blockNumber = await ethers.provider.getBlockNumber();
  
  console.log("================================================================================");
  console.log("SNAPSHOT FOR MIGRATION");
  console.log("================================================================================");
  console.log(`Block: ${blockNumber}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log();
  
  const token = new ethers.Contract(OLD_TOKEN, ERC20_ABI, ethers.provider);
  const staking = new ethers.Contract(OLD_STAKING, STAKING_ABI, ethers.provider);
  const distributor = new ethers.Contract(OLD_ZK_DISTRIBUTOR, DISTRIBUTOR_ABI, ethers.provider);
  
  // Get total supply
  const totalSupply = await token.totalSupply();
  console.log(`📊 Old Token Total Supply: ${ethers.formatEther(totalSupply)} MYNT`);
  
  // =========================================================================
  // 1. Get all token holders via Transfer events
  // =========================================================================
  console.log("\n📥 Fetching Transfer events...");
  
  const holders = new Set<string>();
  const CHUNK_SIZE = 50000;
  const startBlock = 0;
  const endBlock = blockNumber;
  
  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += CHUNK_SIZE) {
    const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, endBlock);
    console.log(`   Fetching blocks ${fromBlock} to ${toBlock}...`);
    
    try {
      const filter = token.filters.Transfer();
      const events = await token.queryFilter(filter, fromBlock, toBlock);
      
      for (const event of events) {
        const args = event.args;
        if (args) {
          holders.add(args.from);
          holders.add(args.to);
        }
      }
    } catch (e: any) {
      console.log(`   Warning: ${e.message}`);
    }
  }
  
  console.log(`   Found ${holders.size} unique addresses`);
  
  // =========================================================================
  // 2. Get balances for all holders
  // =========================================================================
  console.log("\n📊 Fetching balances...");
  
  const holderBalances: Array<{
    address: string;
    balance: string;
    balanceFormatted: string;
    isExcluded: boolean;
  }> = [];
  
  let totalUserBalance = 0n;
  let totalExcludedBalance = 0n;
  
  for (const addr of holders) {
    if (addr === ethers.ZeroAddress) continue;
    
    try {
      const balance = await token.balanceOf(addr);
      if (balance > 0n) {
        const isExcluded = EXCLUDED_ADDRESSES.includes(addr.toLowerCase());
        
        holderBalances.push({
          address: addr,
          balance: balance.toString(),
          balanceFormatted: ethers.formatEther(balance),
          isExcluded
        });
        
        if (isExcluded) {
          totalExcludedBalance += balance;
        } else {
          totalUserBalance += balance;
        }
      }
    } catch (e) {
      // Skip errors
    }
  }
  
  // Sort by balance descending
  holderBalances.sort((a, b) => {
    const balA = BigInt(a.balance);
    const balB = BigInt(b.balance);
    return balB > balA ? 1 : balB < balA ? -1 : 0;
  });
  
  // =========================================================================
  // 3. Get staking info
  // =========================================================================
  console.log("\n📊 Fetching staking info...");
  
  let totalStaked = 0n;
  let providerStaked = 0n;
  
  try {
    totalStaked = await staking.getTotalStaked();
    console.log(`   Total Staked: ${ethers.formatEther(totalStaked)} MYNT`);
  } catch (e) {
    console.log("   Could not get total staked");
  }
  
  try {
    providerStaked = await staking.getProviderPoolStaked();
    console.log(`   Provider Pool Staked: ${ethers.formatEther(providerStaked)} MYNT`);
  } catch (e) {
    console.log("   Could not get provider pool staked");
  }
  
  // Get provider info for deployer
  try {
    const providerInfo = await staking.getProviderInfo(deployer.address);
    console.log(`   Provider (${deployer.address}): ${ethers.formatEther(providerInfo.stake)} MYNT staked`);
  } catch (e) {
    console.log("   Could not get provider info");
  }
  
  // =========================================================================
  // 4. Get distributor info
  // =========================================================================
  console.log("\n📊 Fetching distributor info...");
  
  let providerDistributorBalance = 0n;
  let providerLockedBalance = 0n;
  
  try {
    providerDistributorBalance = await distributor.providerBalance(deployer.address);
    console.log(`   Provider Balance: ${ethers.formatEther(providerDistributorBalance)} MYNT`);
  } catch (e) {
    console.log("   Could not get provider balance");
  }
  
  try {
    providerLockedBalance = await distributor.lockedBalance(deployer.address);
    console.log(`   Provider Locked: ${ethers.formatEther(providerLockedBalance)} MYNT`);
  } catch (e) {
    console.log("   Could not get locked balance");
  }
  
  // =========================================================================
  // 5. Save snapshot
  // =========================================================================
  const snapshot = {
    timestamp: new Date().toISOString(),
    blockNumber,
    oldToken: OLD_TOKEN,
    oldStaking: OLD_STAKING,
    oldDistributor: OLD_ZK_DISTRIBUTOR,
    totalSupply: totalSupply.toString(),
    totalSupplyFormatted: ethers.formatEther(totalSupply),
    summary: {
      totalHolders: holderBalances.length,
      userHolders: holderBalances.filter(h => !h.isExcluded).length,
      excludedHolders: holderBalances.filter(h => h.isExcluded).length,
      totalUserBalance: totalUserBalance.toString(),
      totalUserBalanceFormatted: ethers.formatEther(totalUserBalance),
      totalExcludedBalance: totalExcludedBalance.toString(),
      totalExcludedBalanceFormatted: ethers.formatEther(totalExcludedBalance),
      totalStaked: totalStaked.toString(),
      totalStakedFormatted: ethers.formatEther(totalStaked),
      providerStaked: providerStaked.toString(),
      providerStakedFormatted: ethers.formatEther(providerStaked),
      providerDistributorBalance: providerDistributorBalance.toString(),
      providerDistributorBalanceFormatted: ethers.formatEther(providerDistributorBalance),
      providerLockedBalance: providerLockedBalance.toString(),
      providerLockedBalanceFormatted: ethers.formatEther(providerLockedBalance),
    },
    holders: holderBalances
  };
  
  // Save to file
  const snapshotDir = path.join(__dirname, "../snapshots");
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }
  
  const filename = `migration-snapshot-${Date.now()}.json`;
  const filepath = path.join(snapshotDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
  
  console.log("\n================================================================================");
  console.log("SNAPSHOT COMPLETE");
  console.log("================================================================================");
  console.log(`📁 Saved to: ${filepath}`);
  console.log();
  console.log("📊 Summary:");
  console.log(`   Total Supply: ${ethers.formatEther(totalSupply)} MYNT`);
  console.log(`   User Balances: ${ethers.formatEther(totalUserBalance)} MYNT (${holderBalances.filter(h => !h.isExcluded).length} holders)`);
  console.log(`   Excluded: ${ethers.formatEther(totalExcludedBalance)} MYNT (${holderBalances.filter(h => h.isExcluded).length} contracts)`);
  console.log(`   Staked: ${ethers.formatEther(totalStaked)} MYNT`);
  console.log(`   Provider Distributor: ${ethers.formatEther(providerDistributorBalance)} MYNT`);
  
  console.log("\n📋 Top 10 User Holders:");
  holderBalances
    .filter(h => !h.isExcluded)
    .slice(0, 10)
    .forEach((h, i) => {
      console.log(`   ${i + 1}. ${h.address}: ${h.balanceFormatted} MYNT`);
    });
  
  return snapshot;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Snapshot failed:", error);
    process.exit(1);
  });
