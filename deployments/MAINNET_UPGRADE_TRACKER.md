# Mainnet Upgrade Tracker (Execution Log)

Use this file as the live checklist and audit log for the Base mainnet upgrade.

## Change Metadata

- Change ID: `base-mainnet-emissions-staking-upgrade-2026-02-14`
- Date (UTC): `2026-02-14`
- Chain: Base Mainnet (`8453`)
- Safe (multisig): `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B`
- Proposer wallet: `0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6`
- Executor wallet: `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` (Safe execution)
- Reviewer/sign-off: `TBD`

Source snapshot:

- Deployment file: `deployments/deployment-base-mainnet-latest.json`
- Deployment timestamp: `2026-02-08T04:32:48.860Z`

## Scope

- Upgrade emissions flow with state migration (`initializeMigration`).
- Optional staking implementation upgrade.
- Rewire staking to new emissions contract.
- Transfer admin/control roles to multisig at the end.

Additional upgrades after this change are tracked separately (example: staking `rewardDebt` sync fix):

- `deployments/MAINNET_STAKING_REWARDDEBT_SYNC_UPGRADE_TRACKER.md`

## Contract Addresses

### Before

- Myntis: `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
- Emissions (old): `0x803f9694bE31D3ACe5792C21ab9F72b69838C0e0`
- DualPoolStaking proxy: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- LiquidStakingVault: `0x019cB2AA19465Ca1e140AbeADF13320414031C6B`
- ZKMerkleDistributor: `0xfF52fdA700CaF238F9fE3bea3091E863aA00EADc`
- GlobalSupplyRegistry: `0xdFb3b8107B33d54BAe402a76BbA1432668B2D896`

### After

- Emissions (new): `0x7086792971b623462B6C1d1263Ac73b0761ADDB9`
- Staking implementation (if upgraded): `0x4540361c613ba75DD0e394b652a6D8401EA4310F`

## Phase 0: Preflight

- [ ] Frontend/backend routing freeze announced and effective.
- [x] Safe proposer role granted to deployer/proposer wallet.
- [ ] Confirm runbook reviewed: `deployments/MAINNET_EMISSIONS_STAKING_UPGRADE_RUNBOOK.md`.
- [ ] Confirm migration disclosure reviewed: `deployments/MIGRATION_SCOPE_DISCLOSURE.md`.
- [ ] Confirm frozen addresses reviewed: `deployments/FROZEN_MAINNET_ADDRESSES.md`.

Notes:

- Safe proposals submitted via:
  - `deployments/safe-proposal-submit-base-mainnet-2026-02-14T21-48-46-228Z.json`
  - `deployments/safe-proposal-submit-base-mainnet-2026-02-14T22-05-02-769Z.json` (staking upgrade)

---

## Phase 1: Proposal Generation

Command:

```bash
MULTISIG=<safe_address> NEW_EMISSIONS_ADDRESS=<new_emissions_address> \
npx hardhat run scripts/prepare-mainnet-upgrade-proposal.ts --network base-mainnet
```

Artifacts:

- Proposal JSON: `deployments/multisig-proposal-base-mainnet-emissions-upgrade-2026-02-14T21-37-07-910Z.json`
- Proposal MD: `deployments/multisig-proposal-base-mainnet-emissions-upgrade-2026-02-14T21-37-07-910Z.md`
- Generated-at timestamp: `2026-02-14T21:37:07.910Z`
- New emissions deployment tx: `0xe8373e12b911acc06ec235dcf9b0f16da3716bfad36563aff09aaf6f55a4d394`

Migration snapshot captured in proposal:

- `mintedEmissions`: `1665379249112125824228100`
- `accountedEmissions`: `1665379249112125824228100`
- `accRewardPerShare`: `256905798394179`
- `startTime`: `1770524987`
- `lastRewardTime`: `1771104689`

Checklist:

- [x] Proposal generated from latest chain state (fresh run).
- [x] `newEmissionsAddress` verified.
- [x] If staking upgrade is included, new implementation address verified.

---

## Phase 2: Safe Execution (Upgrade Transactions)

Record each Safe transaction in order.

| Step | Contract Call | Safe Tx Hash | Exec Tx Hash | Block | Status | Notes |
|---|---|---|---|---:|---|---|
| 1 | Optional `DualPoolStaking.upgradeToAndCall(newImpl,data)` | `0xa409c7087337b7d785dbe443f778e2441f2150886c77e23e3ffe291fe7d1a618` | `0x53de57cb4c23662851491dce2983dfd1cf7f0faf0c33433a301d84a499d61b2a` | 42158791 | Executed | nonce=8, new impl `0x4540361c613ba75DD0e394b652a6D8401EA4310F` |
| 2 | `Myntis.grantRole(MINTER_ROLE,newEmissions)` | `0x32c1e6fd9012110183a812f824e8a451f6ad3cb879c48816b836c46c55a91372` | `0x5eff478cb241c6985d4d51130fd4e1628b0cbe61f519a494fbcbe57d2013b7ad` | 42158296 | Executed | nonce=4 |
| 3 | `newEmissions.initializeMigration(...)` | `0xc25dc3af9ae618c3cb036feaedcf8a0e98aa7f80a365e18e6a6a400bebdc5e4a` | `0xc302a1c4165b314013ac91463fd8787b573671b7744436579cde1baa70e96ed4` | 42158355 | Executed | nonce=5 |
| 4 | `DualPoolStaking.setEmissionsContract(newEmissions)` | `0x5eaea1bc5ddb78f0bfbd7d50725f1bb180b33e0c6782ae02923e5216716810be` | `0x154381f4e76a29719c76c2b18fb31f2bc1ff924e775e3a76c446839ad854ac32` | 42158405 | Executed | nonce=6 |
| 5 | `Myntis.revokeRole(MINTER_ROLE,oldEmissions)` | `0x75d94a54ee7d66915be1bd07aba5bfb4f41fe7686dd3169a44b16237d0a548c4` | `0xb2e813f73e6ebdbeeae410d9f0d6b2c4bce57f31c0cfc62a17b11f8af3e83692` | 42158446 | Executed | nonce=7 |

Safe copy-paste payloads:

1. `Myntis.grantRole(MINTER_ROLE,newEmissions)`
   - to: `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
   - value: `0`
   - data: `0x2f2ff15d9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a60000000000000000000000007086792971b623462b6c1d1263ac73b0761addb9`
2. `Emissions.initializeMigration(...)`
   - to: `0x7086792971b623462B6C1d1263Ac73b0761ADDB9`
   - value: `0`
   - data: `0x2d72f4ef0000000000000000000000000000000000000000000160a863d6b60e58aadb040000000000000000000000000000000000000000000160a863d6b60e58aadb040000000000000000000000000000000000000000000000000000e9a78adaa143000000000000000000000000000000000000000000000000000000006988113b000000000000000000000000000000000000000000000000000000006990e9b100000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`
3. `DualPoolStaking.setEmissionsContract(newEmissions)`
   - to: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
   - value: `0`
   - data: `0xa9c353340000000000000000000000007086792971b623462b6c1d1263ac73b0761addb9`
4. `Myntis.revokeRole(MINTER_ROLE,oldEmissions)`
   - to: `0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47`
   - value: `0`
   - data: `0xd547741f9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6000000000000000000000000803f9694be31d3ace5792c21ab9f72b69838c0e0`

Checklist:

- [x] All Safe txs executed successfully.
- [x] No out-of-order execution.
- [x] No unexpected reverts/retries.

---

## Phase 3: Post-Upgrade Verification

Commands:

```bash
npx hardhat run scripts/check-hub-stack-latest.ts --network base-mainnet
MULTISIG=0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B npx hardhat run scripts/check-roles.ts --network base-mainnet
```

Verification results:

- [x] `DualPoolStaking.emissionsContract == newEmissions`
- [x] New emissions migrated state matches proposal snapshot
- [x] Myntis minter role: new emissions `true`, old emissions `false`
- [x] Staking harvest permission hardening verified (`harvestRewards` from random EOA reverts: `Not authorized harvester`)
- [x] New emissions multisig admin role check: `hasRole(ADMIN_ROLE, 0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B) == true`

Pre-execution snapshot checks run:

- `npx hardhat run scripts/check-hub-stack-latest.ts --network base-mainnet`
- `MULTISIG=0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B npx hardhat run scripts/check-roles.ts --network base-mainnet`

Evidence links (tx / logs / screenshots):

---

## Phase 4: Role Transfer to Multisig (Finalization)

Use:

```bash
MULTISIG=<safe_address> npx hardhat run scripts/transfer-roles-to-multisig.ts --network base-mainnet
```

### Role Transfer Matrix

| Contract | Role / Ownership | Current Holder Before | Target (Multisig) | Tx Hash | Verified |
|---|---|---|---|---|---|
| Myntis | `owner()` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| Myntis | `MINTER_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| Myntis | `PAUSER_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| EmissionsContract | `ADMIN_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| DualPoolStaking | `DEFAULT_ADMIN_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| DualPoolStaking | `UPGRADER_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| LiquidStakingVault | `ADMIN_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| ZKMerkleDistributor | `ADMIN_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| GlobalSupplyRegistry | `ADMIN_ROLE` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |
| GlobalSupplyRegistry | `owner()` | historical deployer | `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B` | pre-existing | [x] |

Checklist:

- [x] `check-roles.ts` confirms multisig holds target roles.
- [x] Deployer/operator role revocations completed.
- [x] Ownership transfers completed where applicable.

---

## Phase 5: Documentation Closeout

- [x] Update frozen address records if addresses changed.
- [ ] Commit final proposal JSON/MD and this tracker file with filled tx hashes.
- [ ] Publish short public changelog note for open-source consumers.
- [ ] Link this completed tracker in release notes / PR.

Final sign-off:

- Ops:
- Security:
- Protocol owner:
