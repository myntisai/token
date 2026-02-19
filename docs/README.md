# Token Documentation Index

This folder contains project documentation organized by domain.

## Structure

- `architecture/`
  - `OFT_ARCHITECTURE_PLAN.md`
  - `OFT_UPGRADE_DECISION.md`
  - `CONTRACT_CONSOLIDATION.md`
  - `MULTI_CHAIN_NETWORK_CONFIG.md`
  - `DUAL_POOL_ZK_STAKING_README.md`
- `deployment/`
  - `README.md`
  - `CONTRACT_DEPLOYMENT_HISTORY.md`
  - `MIGRATION_AND_ACCOUNTING_STORY.md`
  - `FORENSIC_MIGRATION_TRANSFER_ANALYSIS.md`
  - `BASE_SEPOLIA_DEPLOYER_STORY.md`
  - `BASE_SEPOLIA_DEPLOYER_SCAN_BLOCKSCOUT.md`
  - `DEPLOYMENT_GUIDE.md`
  - `DEPLOYMENT_REQUIREMENTS.md`
  - `TESTNET_DEPLOYMENT_PLAN.md`
- `testing/`
  - `QUICK_TEST_GUIDE.md`
  - `ZK_PROOF_TESTING_GUIDE.md`
  - `ZK_TEST_RESULTS.md`
- `security/`
  - `REWARDS_FLOW_AUDIT.md`
  - `audits/` (`SECURITY_AUDIT_REPORT*.md`)

## Recommended Reading (External)

1. `../README.md` (project overview and setup)
2. `../SECURITY.md` (reporting policy)
3. `../CONTRIBUTING.md` (contribution workflow)
4. `deployment/README.md` (deployment docs map + evidence files)
5. `deployment/CONTRACT_DEPLOYMENT_HISTORY.md` (canonical timeline and active addresses)
6. `deployment/MIGRATION_AND_ACCOUNTING_STORY.md` (migration/accounting caveats and deltas)
7. `deployment/FORENSIC_MIGRATION_TRANSFER_ANALYSIS.md` (event-level transfer/mint reconciliation)
8. `deployment/BASE_SEPOLIA_DEPLOYER_SCAN_BLOCKSCOUT.md` (full chain-derived deployer scan)
9. `security/audits/SECURITY_AUDIT_REPORT_V7.md` (latest security snapshot)

## Historical and Operational Notes

- `deployments/` files are operational runbooks/trackers and may include checklist-style statuses (`TBD`, in-progress, executed markers) tied to specific maintenance windows.
- Audit version files under `security/audits/` are historical snapshots by date/version.
- For migration and transfer forensics, treat `deployments/*.json` artifacts as canonical data and `docs/deployment/*.md` as narrative summaries of those artifacts.

## Related Folders

- `deployments/`: mainnet/testnet runbooks, execution trackers, and proposal artifacts
- `zk-circuits/`: circuit-specific setup and testing docs
- `solana/`: Solana integration docs
- `scripts/`: script-specific operational guides

## Open Source Conventions

- Root-level docs are intentionally minimal and standard:
  - `README.md`
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `LICENSE`
  - `CODE_OF_CONDUCT.md`
- Domain-specific and historical docs belong under `docs/` (or the closest code folder).
