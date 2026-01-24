const { ethers } = require("hardhat");

async function main() {
  const DISTRIBUTOR_V2 = "0x1C7eFdAC07C6fc7eb74565D557E2d98c4dACd095";
  const PROVIDER_WALLET = "0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627";
  
  // PROVIDER_ROLE = keccak256("PROVIDER_ROLE")
  const PROVIDER_ROLE = "0x18d9ff454de989bd126b06bd404b47ede75f9e65543e94e8d212f89d7dcbb87c";

  console.log("Granting PROVIDER_ROLE on ZKMerkleDistributorV2...");
  console.log("Distributor:", DISTRIBUTOR_V2);
  console.log("Provider:", PROVIDER_WALLET);

  const ABI = [
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function grantRole(bytes32 role, address account)"
  ];

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  const distributor = new ethers.Contract(DISTRIBUTOR_V2, ABI, signer);

  // Check if already has role
  const hasRole = await distributor.hasRole(PROVIDER_ROLE, PROVIDER_WALLET);
  console.log("Has PROVIDER_ROLE:", hasRole);
  
  if (hasRole) {
    console.log("Provider already has PROVIDER_ROLE!");
    return;
  }

  console.log("Granting role...");
  const tx = await distributor.grantRole(PROVIDER_ROLE, PROVIDER_WALLET);
  console.log("TX:", tx.hash);
  await tx.wait();
  
  console.log("PROVIDER_ROLE granted successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
