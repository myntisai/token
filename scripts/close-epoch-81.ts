import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const MERKLE_ADDRESS = '0xdF890dA39bB3B7ad15A66d793Ec4B3D804E9BB16';
  const PROVIDER = '0x0904192498effF59e0502aE1700ecAa9B1708543';
  
  const abi = [
    'function closeEpoch(address provider, uint256 rootIndex) external',
    'function getProviderBalance(address provider) view returns (uint256)',
    'function getLockedBalance(address provider) view returns (uint256)'
  ];
  
  const contract = new ethers.Contract(MERKLE_ADDRESS, abi, deployer);
  
  console.log('Closing epoch 81...');
  try {
    const tx = await contract.closeEpoch(PROVIDER, 81);
    console.log('Tx:', tx.hash);
    await tx.wait();
    console.log('✅ Epoch 81 closed!');
  } catch (e: any) {
    console.log('Note:', e.message?.includes('already closed') ? 'Already closed' : e.message);
  }
  
  const available = await contract.getProviderBalance(PROVIDER);
  const locked = await contract.getLockedBalance(PROVIDER);
  
  console.log('\n💰 Current Balances:');
  console.log('   Available:', ethers.formatEther(available), 'MYNT');
  console.log('   Locked:', ethers.formatEther(locked), 'MYNT');
  console.log('   Total:', ethers.formatEther(available + locked), 'MYNT');
}

main().catch(console.error);

