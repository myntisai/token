# DualPoolStaking MasterChef Delta-Sync Fix Proposal

- Generated: 2026-02-15T21:57:03.108Z
- Network: base-mainnet (8453)
- Multisig: `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B`
- Staking proxy: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- New implementation: `0xAB62e9dD23f77a6ceEbCd386AC7ed6869115c755`

## Fix Accounts

- `0x26A942e30505DF986c16fa9f1CbeEeAe9ad325B6`
- `0xca7735a6290f384C8A9394B0E3141FeF89e6589d`
- `0x019cB2AA19465Ca1e140AbeADF13320414031C6B`

## Safe Transaction

1. DualPoolStaking.upgradeToAndCall(newImpl, reinitializeV5MasterchefFix(3 accounts))
   - to: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
   - value: `0`
   - data: `0x4f1ef286000000000000000000000000ab62e9dd23f77a6ceebcd386ac7ed6869115c755000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a4ab1a3e570000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000300000000000000000000000026a942e30505df986c16fa9f1cbeeeae9ad325b6000000000000000000000000ca7735a6290f384c8a9394b0e3141fef89e6589d000000000000000000000000019cb2aa19465ca1e140abeadf13320414031c6b00000000000000000000000000000000000000000000000000000000`

## Notes

- This upgrade changes syncEmissions() to MasterChef-correct delta syncing using EmissionsContract.mintedEmissions().
- The reinitializer writes down pendingTreasuryWithdrawal (drift bucket) and rebaselines rewardDebt for the listed accounts.
- This sets pending rewards for the listed accounts to ~0 at execution time.
- If you plan to compensate historical rewards from a broken epoch, do it separately (Merkle/manual) and document it.
