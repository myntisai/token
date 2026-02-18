import { run } from "hardhat";

// =============================================================================
// HUB CONTRACTS (Base Sepolia - deployed Dec 28, 2025)
// =============================================================================
const HUB_CONTRACTS = {
  Groth16Verifier: {
    address: "0x2000738e7E3e4dCB58f7e917AAb2fb1F9C78d9E8",
    args: [],
    contract: "contracts/RewardClaimVerifier_generated.sol:Groth16Verifier"
  },
  RewardClaimVerifier: {
    address: "0xe44eE55933BD85C9F899fd4820eE783C9832558D",
    args: [],
    contract: "contracts/RewardClaimVerifier.sol:RewardClaimVerifier"
  },
  GlobalSupplyRegistry: {
    address: "0xFBD4a2b0c095dbF14Be62B784c01d4baFaFa57d7",
    args: [
      "0x6EDCE65403992e310A62460808c4b910D972f10f", // LZ Endpoint
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627"  // Admin
    ],
    contract: "contracts/GlobalSupplyRegistry.sol:GlobalSupplyRegistry"
  },
  Myntis: {
    address: "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8",
    args: [
      "0x6EDCE65403992e310A62460808c4b910D972f10f", // LZ Endpoint
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627"  // Admin/Delegate
    ],
    contract: "contracts/Myntis.sol:Myntis"
  },
  EmissionsContract: {
    address: "0x31b816258ac3b72625169CD37F80ac12191e76ad",
    args: [
      "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8", // Myntis Token
      "0x0000000000000000000000000000000000000000", // Staking (set later)
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627"  // Admin
    ],
    contract: "contracts/EmissionsContract.sol:EmissionsContract"
  },
  DualPoolStakingImpl: {
    address: "0x844e6eEE9E6f4B9Ad3eC624DbacC4B9078F232e8",
    args: [],
    contract: "contracts/DualPoolStaking.sol:DualPoolStaking"
  },
  LiquidStakingVault: {
    address: "0xC3d6e556b9C7dCAE100777e10234944A09A8cEac",
    args: [
      "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8", // Myntis Token
      "0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8", // Staking Proxy
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627"  // Admin
    ],
    contract: "contracts/LiquidStakingVault.sol:LiquidStakingVault"
  },
  ZKMerkleDistributor: {
    address: "0xF8adFB263Fd6682055941e6c16750d8D34BDeec0",
    args: [
      "0xEb4fD5Ef1Be46567f82FCc34C4c4EEeAd7e1A3A8", // Myntis Token
      "0xe44eE55933BD85C9F899fd4820eE783C9832558D", // RewardClaimVerifier
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627"  // Admin
    ],
    contract: "contracts/ZKMerkleDistributor.sol:ZKMerkleDistributor"
  },
  RewardWeightingRegistryImpl: {
    address: "0xDd13AB037efDC4696c16E732094c964A2e76d8D4",
    args: [],
    contract: "contracts/RewardWeightingRegistry.sol:RewardWeightingRegistry"
  }
};

// =============================================================================
// SPOKE CONTRACTS (Ethereum Sepolia - UPDATE after deployment)
// =============================================================================
const SPOKE_CONTRACTS = {
  Groth16Verifier: {
    address: process.env.ETH_SEPOLIA_GROTH16_VERIFIER || "",
    args: [],
    contract: "contracts/RewardClaimVerifier_generated.sol:Groth16Verifier"
  },
  RewardClaimVerifier: {
    address: process.env.ETH_SEPOLIA_REWARD_CLAIM_VERIFIER || "",
    args: [],
    contract: "contracts/RewardClaimVerifier.sol:RewardClaimVerifier"
  },
  MyntisOFTSpoke: {
    address: process.env.ETH_SEPOLIA_MYNTIS_SPOKE || "",
    args: [
      "0x6EDCE65403992e310A62460808c4b910D972f10f", // LZ Endpoint (Eth Sepolia)
      "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627", // Admin
      40245, // Hub Chain EID (Base Sepolia)
      40161 // Local Chain EID (Eth Sepolia)
    ],
    contract: "contracts/MyntisOFTSpoke.sol:MyntisOFTSpoke"
  },
  SpokeDistributor: {
    address: process.env.ETH_SEPOLIA_SPOKE_DISTRIBUTOR || "",
    args: [], // Will be set dynamically
    contract: "contracts/SpokeDistributor.sol:SpokeDistributor"
  }
};

async function verifyContract(name: string, address: string, args: any[], contractPath: string, network: string) {
  if (!address) {
    console.log(`⏭️ Skipping ${name}: No address provided`);
    return false;
  }
  
  console.log(`\n🔍 Verifying ${name} at ${address}...`);
  
  try {
    await run("verify:verify", {
      address,
      constructorArguments: args,
      contract: contractPath,
    });
    console.log(`✅ ${name} verified!`);
    return true;
  } catch (error: any) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      console.log(`✅ ${name} already verified`);
      return true;
    }
    console.error(`❌ ${name} verification failed: ${error.message}`);
    console.log(`   Manual: npx hardhat verify --network ${network} --contract ${contractPath} ${address} ${args.join(" ")}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const networkArg = args.find(a => a.startsWith("--network="))?.split("=")[1] || 
                     args[args.indexOf("--network") + 1] || "base-sepolia";
  
  console.log("================================================================================");
  console.log("VERIFY ALL CONTRACTS");
  console.log("================================================================================");
  console.log(`Network: ${networkArg}`);
  console.log();
  
  let contracts: Record<string, any>;
  let network: string;
  
  if (networkArg === "base-sepolia") {
    contracts = HUB_CONTRACTS;
    network = "base-sepolia";
    console.log("📌 Verifying HUB contracts on Base Sepolia...\n");
  } else if (networkArg === "ethereum-sepolia") {
    // Update SpokeDistributor args dynamically
    if (SPOKE_CONTRACTS.MyntisOFTSpoke.address) {
      SPOKE_CONTRACTS.SpokeDistributor.args = [
        SPOKE_CONTRACTS.MyntisOFTSpoke.address,
        "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627"
      ];
    }
    contracts = SPOKE_CONTRACTS;
    network = "ethereum-sepolia";
    console.log("📌 Verifying SPOKE contracts on Ethereum Sepolia...\n");
  } else {
    console.error(`❌ Unknown network: ${networkArg}`);
    console.log("   Use: --network base-sepolia OR --network ethereum-sepolia");
    process.exit(1);
  }
  
  let verified = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const [name, config] of Object.entries(contracts)) {
    if (!config.address) {
      skipped++;
      continue;
    }
    
    const success = await verifyContract(
      name,
      config.address,
      config.args,
      config.contract,
      network
    );
    
    if (success) verified++;
    else failed++;
    
    // Small delay between verifications
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log("\n================================================================================");
  console.log("VERIFICATION SUMMARY");
  console.log("================================================================================");
  console.log(`✅ Verified: ${verified}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️ Skipped: ${skipped}`);
  
  if (networkArg === "base-sepolia") {
    console.log("\n📋 Hub Contract Addresses:");
    console.log("MYNTIS_TOKEN_ADDRESS=" + HUB_CONTRACTS.Myntis.address);
    console.log("STAKING_CONTRACT_ADDRESS=0xe66e51C61a0D89831e9B41f8dE28fbFf18C5E1f8");
    console.log("EMISSIONS_CONTRACT_ADDRESS=" + HUB_CONTRACTS.EmissionsContract.address);
    console.log("ZK_MERKLE_DISTRIBUTOR_ADDRESS=" + HUB_CONTRACTS.ZKMerkleDistributor.address);
    console.log("LIQUID_STAKING_VAULT_ADDRESS=" + HUB_CONTRACTS.LiquidStakingVault.address);
    console.log("GLOBAL_SUPPLY_REGISTRY_ADDRESS=" + HUB_CONTRACTS.GlobalSupplyRegistry.address);
    console.log("REWARD_CLAIM_VERIFIER_ADDRESS=" + HUB_CONTRACTS.RewardClaimVerifier.address);
    console.log("REWARD_WEIGHTING_REGISTRY_ADDRESS=0x10100031DeC4bd7F3475b24318d2E94940e03876");
    console.log("GROTH16_VERIFIER_ADDRESS=" + HUB_CONTRACTS.Groth16Verifier.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Verification script failed:", error);
    process.exit(1);
  });
