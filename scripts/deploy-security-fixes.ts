import { ethers, upgrades } from "hardhat";

/**
 * Deployment script for security-fixed contracts
 * 
 * This script deploys/upgrades the following contracts with security fixes:
 * - Myntis.sol (UUPS upgrade)
 * - DualPoolStaking.sol (UUPS upgrade)
 * - EmissionsContract.sol (redeploy - non-upgradeable)
 * - MerkleDistributor.sol (redeploy - non-upgradeable)
 * - LiquidStakingVault.sol (redeploy - non-upgradeable)
 * - ZKMerkleDistributor.sol (redeploy - non-upgradeable)
 * - SpokeDistributor.sol (redeploy - non-upgradeable)
 * - GlobalSupplyRegistry.sol (redeploy - non-upgradeable)
 * - GlobalNullifier.sol (redeploy - non-upgradeable)
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying security-fixed contracts with:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Configuration - update these addresses for your deployment
  const CONFIG = {
    // Existing proxy addresses (for upgrades)
    MYNTIS_PROXY: process.env.MYNTIS_PROXY || "",
    STAKING_PROXY: process.env.STAKING_PROXY || "",
    
    // LayerZero endpoint
    LZ_ENDPOINT: process.env.LZ_ENDPOINT || "0x6EDCE65403992e310A62460808c4b910D972f10f",
    
    // Hub chain ID (Base Sepolia = 84532)
    HUB_CHAIN_ID: 84532,
    
    // Token address (if not deploying new)
    TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || "",
  };

  const deployedContracts: Record<string, string> = {};

  // ==========================================
  // Phase 1: Deploy/Upgrade Core Token
  // ==========================================
  console.log("\n=== Phase 1: Core Token ===");

  if (CONFIG.MYNTIS_PROXY) {
    console.log("Upgrading Myntis proxy at:", CONFIG.MYNTIS_PROXY);
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = await upgrades.upgradeProxy(CONFIG.MYNTIS_PROXY, Myntis);
    await myntis.waitForDeployment();
    deployedContracts.Myntis = CONFIG.MYNTIS_PROXY;
    console.log("Myntis upgraded at:", CONFIG.MYNTIS_PROXY);
  } else {
    console.log("Deploying new Myntis...");
    const Myntis = await ethers.getContractFactory("Myntis");
    const myntis = await upgrades.deployProxy(
      Myntis,
      [
        deployer.address,
        ethers.parseEther("1000000000"), // 1B cap
        ethers.parseEther("1000000000"), // 1B max supply
        CONFIG.LZ_ENDPOINT,
      ],
      { initializer: "initialize" }
    );
    await myntis.waitForDeployment();
    deployedContracts.Myntis = await myntis.getAddress();
    console.log("Myntis deployed at:", deployedContracts.Myntis);
  }

  const tokenAddress = CONFIG.TOKEN_ADDRESS || deployedContracts.Myntis;

  // ==========================================
  // Phase 2: Deploy GlobalNullifier
  // ==========================================
  console.log("\n=== Phase 2: GlobalNullifier ===");
  
  const GlobalNullifier = await ethers.getContractFactory("GlobalNullifier");
  const globalNullifier = await GlobalNullifier.deploy(deployer.address);
  await globalNullifier.waitForDeployment();
  deployedContracts.GlobalNullifier = await globalNullifier.getAddress();
  console.log("GlobalNullifier deployed at:", deployedContracts.GlobalNullifier);

  // ==========================================
  // Phase 3: Deploy GlobalSupplyRegistry
  // ==========================================
  console.log("\n=== Phase 3: GlobalSupplyRegistry ===");
  
  const GlobalSupplyRegistry = await ethers.getContractFactory("GlobalSupplyRegistry");
  const globalSupplyRegistry = await GlobalSupplyRegistry.deploy(
    CONFIG.LZ_ENDPOINT,
    deployer.address
  );
  await globalSupplyRegistry.waitForDeployment();
  deployedContracts.GlobalSupplyRegistry = await globalSupplyRegistry.getAddress();
  console.log("GlobalSupplyRegistry deployed at:", deployedContracts.GlobalSupplyRegistry);

  // ==========================================
  // Phase 4: Deploy/Upgrade DualPoolStaking
  // ==========================================
  console.log("\n=== Phase 4: DualPoolStaking ===");

  let stakingAddress: string;
  if (CONFIG.STAKING_PROXY) {
    console.log("Upgrading DualPoolStaking proxy at:", CONFIG.STAKING_PROXY);
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    const staking = await upgrades.upgradeProxy(CONFIG.STAKING_PROXY, DualPoolStaking);
    await staking.waitForDeployment();
    stakingAddress = CONFIG.STAKING_PROXY;
    console.log("DualPoolStaking upgraded at:", stakingAddress);
  } else {
    console.log("Deploying new DualPoolStaking...");
    const DualPoolStaking = await ethers.getContractFactory("DualPoolStaking");
    // We need emissions contract address, deploy placeholder first
    const staking = await upgrades.deployProxy(
      DualPoolStaking,
      [
        tokenAddress,
        ethers.ZeroAddress, // Emissions contract - will be set later
        deployer.address,
      ],
      { initializer: "initialize" }
    );
    await staking.waitForDeployment();
    stakingAddress = await staking.getAddress();
    console.log("DualPoolStaking deployed at:", stakingAddress);
  }
  deployedContracts.DualPoolStaking = stakingAddress;

  // Set treasury on staking contract
  const staking = await ethers.getContractAt("DualPoolStaking", stakingAddress);
  const setTreasuryTx = await staking.setTreasury(deployer.address);
  await setTreasuryTx.wait();
  console.log("Treasury set to:", deployer.address);

  // ==========================================
  // Phase 5: Deploy EmissionsContract
  // ==========================================
  console.log("\n=== Phase 5: EmissionsContract ===");
  
  const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
  const emissions = await EmissionsContract.deploy(
    tokenAddress,
    stakingAddress,
    deployer.address
  );
  await emissions.waitForDeployment();
  deployedContracts.EmissionsContract = await emissions.getAddress();
  console.log("EmissionsContract deployed at:", deployedContracts.EmissionsContract);

  // ==========================================
  // Phase 6: Deploy MerkleDistributor
  // ==========================================
  console.log("\n=== Phase 6: MerkleDistributor ===");
  
  const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
  const merkleDistributor = await MerkleDistributor.deploy(
    tokenAddress,
    deployer.address
  );
  await merkleDistributor.waitForDeployment();
  deployedContracts.MerkleDistributor = await merkleDistributor.getAddress();
  console.log("MerkleDistributor deployed at:", deployedContracts.MerkleDistributor);

  // Set staking contract on MerkleDistributor
  const md = await ethers.getContractAt("MerkleDistributor", deployedContracts.MerkleDistributor);
  const setStakingTx = await md.setStakingContract(stakingAddress);
  await setStakingTx.wait();
  console.log("Staking contract set on MerkleDistributor");

  // ==========================================
  // Phase 7: Deploy LiquidStakingVault
  // ==========================================
  console.log("\n=== Phase 7: LiquidStakingVault ===");
  
  const LiquidStakingVault = await ethers.getContractFactory("LiquidStakingVault");
  const liquidStakingVault = await LiquidStakingVault.deploy(
    tokenAddress,
    stakingAddress,
    deployer.address
  );
  await liquidStakingVault.waitForDeployment();
  deployedContracts.LiquidStakingVault = await liquidStakingVault.getAddress();
  console.log("LiquidStakingVault deployed at:", deployedContracts.LiquidStakingVault);

  // Set vault on staking contract
  const setVaultTx = await staking.setLiquidStakingVault(deployedContracts.LiquidStakingVault);
  await setVaultTx.wait();
  console.log("LiquidStakingVault set on DualPoolStaking");

  // ==========================================
  // Phase 8: Deploy SpokeDistributor
  // ==========================================
  console.log("\n=== Phase 8: SpokeDistributor ===");
  
  const SpokeDistributor = await ethers.getContractFactory("SpokeDistributor");
  const spokeDistributor = await SpokeDistributor.deploy(
    CONFIG.HUB_CHAIN_ID,
    deployedContracts.GlobalNullifier,
    tokenAddress,
    deployer.address
  );
  await spokeDistributor.waitForDeployment();
  deployedContracts.SpokeDistributor = await spokeDistributor.getAddress();
  console.log("SpokeDistributor deployed at:", deployedContracts.SpokeDistributor);

  // ==========================================
  // Phase 9: Configure Contracts
  // ==========================================
  console.log("\n=== Phase 9: Configuration ===");

  // Register token with GlobalSupplyRegistry
  const gsr = await ethers.getContractAt("GlobalSupplyRegistry", deployedContracts.GlobalSupplyRegistry);
  const registerTokenTx = await gsr.registerToken(tokenAddress);
  await registerTokenTx.wait();
  console.log("Token registered with GlobalSupplyRegistry");

  // Grant MINTER_ROLE to emissions contract if Myntis was deployed
  if (deployedContracts.Myntis) {
    const myntis = await ethers.getContractAt("Myntis", deployedContracts.Myntis);
    const MINTER_ROLE = await myntis.MINTER_ROLE();
    const grantMinterTx = await myntis.grantRole(MINTER_ROLE, deployedContracts.EmissionsContract);
    await grantMinterTx.wait();
    console.log("MINTER_ROLE granted to EmissionsContract");

    // Set GlobalSupplyRegistry on Myntis
    const setRegistryTx = await myntis.setGlobalSupplyRegistry(deployedContracts.GlobalSupplyRegistry);
    await setRegistryTx.wait();
    console.log("GlobalSupplyRegistry set on Myntis");
  }

  // ==========================================
  // Summary
  // ==========================================
  console.log("\n========================================");
  console.log("DEPLOYMENT COMPLETE - Security Fixed Contracts");
  console.log("========================================");
  console.log("\nDeployed Contracts:");
  for (const [name, address] of Object.entries(deployedContracts)) {
    console.log(`  ${name}: ${address}`);
  }

  console.log("\n========================================");
  console.log("IMPORTANT: Update your configuration files with these addresses");
  console.log("========================================");

  // Save deployment info
  const fs = await import("fs");
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployedContracts,
  };

  fs.writeFileSync(
    `deployments/security-fixes-${Date.now()}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\nDeployment info saved to deployments/security-fixes-*.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

