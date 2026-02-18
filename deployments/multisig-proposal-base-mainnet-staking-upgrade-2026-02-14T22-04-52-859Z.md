# Staking Upgrade Multisig Proposal

- Generated: 2026-02-14T22:04:52.859Z
- Network: base-mainnet (8453)
- Multisig: `0x5c3c2ba37a73a371D4A3F41ed2663Af15B7b220B`
- Staking proxy: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
- Previous implementation: `0xbebB59857bE6D1C05A0FB66a6E9721F1ba10c345`
- New implementation: `0x4540361c613ba75DD0e394b652a6D8401EA4310F`
- New implementation deployment tx: `0x2dce97408112b9713a4babd9c3bff6d5ca6faaa015b47163ac6f2096452ca6f4`

## Safe Transaction

1. DualPoolStaking.upgradeToAndCall(newImplementation, 0x)
   - to: `0x3CBA95f31B61d9FaAC54D3A8A7fbb926737BB57d`
   - value: `0`
   - data: `0x4f1ef2860000000000000000000000004540361c613ba75dd0e394b652a6d8401ea4310f00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000`

## Notes

- This upgrade is intended to enforce restricted third-party harvest behavior.
- Execution requires multisig threshold signatures.
