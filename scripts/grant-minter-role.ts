import { ethers } from "hardhat";

/**
 * Grants MINTER_ROLE on Myntis hub token to the configured EmissionsContract.
 *
 * Usage:
 *   MYNTIS_TOKEN_ADDRESS=0x... EMISSIONS_CONTRACT_ADDRESS=0x... npx hardhat run scripts/grant-minter-role.ts --network base-sepolia
 *
 * Notes:
 * - Myntis uses a custom role mapping (not OZ AccessControl), but exposes `MINTER_ROLE()` + `hasRole()` + `grantRole()`.
 * - `grantRole()` is `onlyOwner`, so your signer MUST be the token owner.
 */
async function main() {
  const tokenAddress = process.env.MYNTIS_TOKEN_ADDRESS;
  const emissionsAddress = process.env.EMISSIONS_CONTRACT_ADDRESS;

  if (!tokenAddress) throw new Error("Missing MYNTIS_TOKEN_ADDRESS");
  if (!emissionsAddress) throw new Error("Missing EMISSIONS_CONTRACT_ADDRESS");

  const [signer] = await ethers.getSigners();
  const signerAddr = await signer.getAddress();

  const token = await ethers.getContractAt("Myntis", tokenAddress, signer);
  const owner = await token.owner();
  const minterRole = await token.MINTER_ROLE();

  console.log(`Network: ${(await ethers.provider.getNetwork()).name} (${(await ethers.provider.getNetwork()).chainId})`);
  console.log(`Token:   ${tokenAddress}`);
  console.log(`Owner:   ${owner}`);
  console.log(`Signer:  ${signerAddr}`);
  console.log(`Role:    ${minterRole}`);
  console.log(`Target:  ${emissionsAddress}`);

  if (signerAddr.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Signer is not token owner. Owner=${owner}, Signer=${signerAddr}`);
  }

  const already = await token.hasRole(minterRole, emissionsAddress);
  if (already) {
    console.log("✅ Emissions already has MINTER_ROLE on token");
    return;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  console.log("📝 Granting MINTER_ROLE to EmissionsContract...");
  const tx = await token.grantRole(minterRole, emissionsAddress);
  console.log(`Tx: ${tx.hash}`);
  await tx.wait();

  // RPCs can be briefly stale right after a mined tx; poll for a short period.
  let nowHas = false;
  for (let i = 0; i < 10; i++) {
    nowHas = await token.hasRole(minterRole, emissionsAddress);
    if (nowHas) break;
    await sleep(1500);
  }
  if (!nowHas) throw new Error("Grant mined, but role not visible after retries (RPC stale or wrong chain?)");

  console.log("✅ Granted MINTER_ROLE to EmissionsContract");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

