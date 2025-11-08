const { ethers } = require('ethers');
require('dotenv').config({ path: '../.env.prod' });

async function deployMerkleDistributor() {
  try {
    console.log('👷 Deploying MerkleDistributor...\n');
    
    // Get configuration
    const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
    const privateKey = process.env.PRIVATE_KEY;
    const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS || '0xD3DD83F3D310288C77aB7f69A9426Fa6adE603d1'; // Use StakingContract's token
    const adminAddress = process.env.ADMIN_ADDRESS || '0x0904192498effF59e0502aE1700ecAa9B1708543';
    const stakingContractAddress = process.env.STAKING_CONTRACT_ADDRESS || '0xe2A90b4324717Dcfd479f6fcBd4f177B81aAB90e';
    
    if (!privateKey) {
      throw new Error('PRIVATE_KEY not found in environment');
    }
    
    // Get actual token from StakingContract
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const network = await provider.getNetwork();
    
    console.log('📋 Configuration:');
    console.log('   Network:', network.name, '(Chain ID:', network.chainId.toString() + ')');
    console.log('   RPC URL:', rpcUrl);
    console.log('   Deployer:', wallet.address);
    console.log('   Token Address:', tokenAddress);
    console.log('   Admin Address:', adminAddress);
    console.log('   StakingContract:', stakingContractAddress);
    console.log('');
    
    // Verify token address matches StakingContract
    const stakingABI = ['function token() view returns (address)'];
    const staking = new ethers.Contract(stakingContractAddress, stakingABI, provider);
    const stakingToken = await staking.token();
    console.log('🔍 Verifying token address...');
    console.log('   StakingContract token:', stakingToken);
    
    if (stakingToken.toLowerCase() !== tokenAddress.toLowerCase()) {
      console.log('   ⚠️  Token mismatch! Using StakingContract token:', stakingToken);
      // Use the actual token from StakingContract
      const actualTokenAddress = stakingToken;
    }
    
    // MerkleDistributor ABI for deployment
    const merkleDistributorABI = [
      'constructor(address _token, address _admin)',
      'function token() view returns (address)',
      'function setStakingContract(address staking) external',
      'function notifyReward(address provider, uint256 amount) external',
      'function addProviderBalance(address provider, uint256 amount) external',
      'function stakingContract() view returns (address)',
      'function ADMIN_ROLE() view returns (bytes32)',
      'function hasRole(bytes32 role, address account) view returns (bool)'
    ];
    
    // Get contract bytecode - we'll need to compile it or load from artifacts
    // For now, let's use a deployment via hardhat or check if we can load the artifact
    console.log('\n🚀 Deploying MerkleDistributor...');
    console.log('   This requires compiled bytecode. Checking for artifacts...');
    
    // Try to load from compiled artifacts
    const fs = require('fs');
    const path = require('path');
    
    let artifactPath = path.join(__dirname, '../artifacts/contracts/MerkleDistributor.sol/MerkleDistributor.json');
    if (!fs.existsSync(artifactPath)) {
      // Try alternative locations
      artifactPath = path.join(__dirname, '../../artifacts/contracts/MerkleDistributor.sol/MerkleDistributor.json');
    }
    
    if (!fs.existsSync(artifactPath)) {
      throw new Error('MerkleDistributor artifact not found. Please compile contracts first with: npx hardhat compile');
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const MerkleDistributorFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    console.log('   ✅ Loaded contract artifact');
    console.log('   Deploying...');
    
    const merkleDistributor = await MerkleDistributorFactory.deploy(stakingToken, adminAddress);
    console.log('   Transaction hash:', merkleDistributor.deploymentTransaction()?.hash);
    console.log('   Waiting for deployment...');
    
    await merkleDistributor.waitForDeployment();
    const merkleDistributorAddress = await merkleDistributor.getAddress();
    
    console.log('   ✅ MerkleDistributor deployed at:', merkleDistributorAddress);
    
    // Verify deployment
    console.log('\n🔍 Verifying deployment...');
    const code = await provider.getCode(merkleDistributorAddress);
    if (code === '0x') {
      throw new Error('Contract deployment failed - no code at address');
    }
    console.log('   ✅ Contract code deployed');
    
    // Verify functions exist
    const codeStr = code.toLowerCase();
    const notifyRewardSelector = ethers.id('notifyReward(address,uint256)').slice(0, 10);
    const setStakingSelector = ethers.id('setStakingContract(address)').slice(0, 10);
    const addBalanceSelector = ethers.id('addProviderBalance(address,uint256)').slice(0, 10);
    
    const hasNotifyReward = codeStr.includes(notifyRewardSelector.substring(2).toLowerCase());
    const hasSetStaking = codeStr.includes(setStakingSelector.substring(2).toLowerCase());
    const hasAddBalance = codeStr.includes(addBalanceSelector.substring(2).toLowerCase());
    
    console.log('   Functions in bytecode:');
    console.log('      notifyReward:', hasNotifyReward ? '✅' : '❌');
    console.log('      setStakingContract:', hasSetStaking ? '✅' : '❌');
    console.log('      addProviderBalance:', hasAddBalance ? '✅' : '❌');
    
    if (!hasNotifyReward || !hasSetStaking) {
      throw new Error('Deployed contract missing required functions!');
    }
    
    // Verify token address
    const deployedToken = await merkleDistributor.token();
    console.log('   Deployed token:', deployedToken);
    if (deployedToken.toLowerCase() !== stakingToken.toLowerCase()) {
      throw new Error('Token address mismatch in deployed contract!');
    }
    console.log('   ✅ Token address verified');
    
    // Set StakingContract
    console.log('\n🔗 Setting StakingContract on MerkleDistributor...');
    const ADMIN_ROLE = await merkleDistributor.ADMIN_ROLE();
    const hasAdminRole = await merkleDistributor.hasRole(ADMIN_ROLE, wallet.address);
    
    if (!hasAdminRole) {
      throw new Error(`Wallet ${wallet.address} does not have ADMIN_ROLE`);
    }
    
    const setTx = await merkleDistributor.setStakingContract(stakingContractAddress);
    console.log('   Transaction hash:', setTx.hash);
    await setTx.wait();
    console.log('   ✅ StakingContract set');
    
    // Verify
    const setStaking = await merkleDistributor.stakingContract();
    if (setStaking.toLowerCase() === stakingContractAddress.toLowerCase()) {
      console.log('   ✅ Verified: StakingContract correctly set');
    } else {
      throw new Error('StakingContract address mismatch after setting!');
    }
    
    // Update StakingContract to point to new MerkleDistributor
    console.log('\n🔄 Updating StakingContract to use new MerkleDistributor...');
    const stakingFullABI = [
      'function merkleDistributor() view returns (address)',
      'function setMerkleDistributor(address _merkleDistributor) external',
      'function hasRole(bytes32 role, address account) view returns (bool)',
      'function ADMIN_ROLE() view returns (bytes32)'
    ];
    const stakingContract = new ethers.Contract(stakingContractAddress, stakingFullABI, wallet);
    
    const stakingAdminRole = await stakingContract.ADMIN_ROLE();
    const hasStakingAdmin = await stakingContract.hasRole(stakingAdminRole, wallet.address);
    
    if (!hasStakingAdmin) {
      throw new Error(`Wallet ${wallet.address} does not have ADMIN_ROLE on StakingContract`);
    }
    
    const currentMerkle = await stakingContract.merkleDistributor();
    console.log('   Current MerkleDistributor in StakingContract:', currentMerkle);
    
    if (currentMerkle.toLowerCase() === merkleDistributorAddress.toLowerCase()) {
      console.log('   ✅ StakingContract already points to new address');
    } else {
      const updateTx = await stakingContract.setMerkleDistributor(merkleDistributorAddress);
      console.log('   Transaction hash:', updateTx.hash);
      await updateTx.wait();
      console.log('   ✅ StakingContract updated');
      
      // Verify
      const newMerkle = await stakingContract.merkleDistributor();
      if (newMerkle.toLowerCase() === merkleDistributorAddress.toLowerCase()) {
        console.log('   ✅ Verified: StakingContract correctly updated');
      } else {
        throw new Error('StakingContract address mismatch after update!');
      }
    }
    
    // Summary
    console.log('\n📊 Deployment Summary:');
    console.log('   ✅ MerkleDistributor:', merkleDistributorAddress);
    console.log('   ✅ Token:', stakingToken);
    console.log('   ✅ Admin:', adminAddress);
    console.log('   ✅ StakingContract set:', stakingContractAddress);
    console.log('   ✅ StakingContract updated to use new MerkleDistributor');
    
    console.log('\n🎉 Deployment and configuration complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update .env.prod: MERKLE_DISTRIBUTOR_ADDRESS=' + merkleDistributorAddress);
    console.log('   2. Update .env.prod: NEXT_PUBLIC_MERKLE_DISTRIBUTOR_ADDRESS=' + merkleDistributorAddress);
    console.log('   3. Restart services');
    
    return merkleDistributorAddress;
    
  } catch (error) {
    console.error('\n❌ Deployment failed:');
    console.error('   Message:', error.message);
    if (error.reason) {
      console.error('   Reason:', error.reason);
    }
    if (error.transaction) {
      console.error('   Transaction:', error.transaction);
    }
    throw error;
  }
}

if (require.main === module) {
  deployMerkleDistributor()
    .then((address) => {
      console.log('\n✅ Script completed successfully');
      console.log('   New MerkleDistributor:', address);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error.message);
      process.exit(1);
    });
}

module.exports = { deployMerkleDistributor };

