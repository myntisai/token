# Contract Consolidation - MyntisOFT Removed

## Summary

**`MyntisOFT.sol` has been deleted** as it was redundant with `Myntis.sol`.

## Architecture Decision

### Before (Redundant)
- `Myntis.sol` - Upgradeable hub token (UUPS)
- `MyntisOFT.sol` - Non-upgradeable hub token (redundant)
- `MyntisSpokeOFT.sol` - Spoke token

### After (Consolidated)
- `Myntis.sol` - **Upgradeable hub token (UUPS)** ✅ Use this for hub
- `MyntisSpokeOFT.sol` - **Spoke token** ✅ Use this for spokes

## Why MyntisOFT Was Redundant

1. **Same Functionality**: Both `Myntis.sol` and `MyntisOFT.sol` provided identical LayerZero OFT functionality
2. **Upgradeability**: `Myntis.sol` is upgradeable (better for production), `MyntisOFT.sol` was not
3. **Deployment Script Bug**: `deploy-oft-hub.ts` tried to deploy `MyntisOFT` with UUPS proxy, but `MyntisOFT` wasn't upgradeable
4. **Pure OFT Architecture**: We agreed on pure OFT (no HubSpokeBridge), so we only need one hub token

## Migration Required

### Deployment Scripts
- ✅ `deploy-oft-hub.ts` - **NEEDS UPDATE** to use `Myntis.sol` instead of `MyntisOFT`
- ✅ `deploy-myntis-oft.ts` - **NEEDS UPDATE** to use `Myntis.sol` with proxy
- ✅ Other scripts referencing `MyntisOFT` - **NEEDS UPDATE**

### Tests
- ✅ Test files using `MyntisOFT` - **NEEDS UPDATE** to use `Myntis.sol`
- Note: Some tests may be historical and can be archived

### Documentation
- ✅ Update references to clarify: Hub = `Myntis.sol`, Spoke = `MyntisSpokeOFT.sol`

## Key Differences: Myntis vs MyntisOFT (Historical)

| Feature | Myntis.sol | MyntisOFT.sol (deleted) |
|--------|------------|-------------------------|
| Upgradeable | ✅ Yes (UUPS) | ❌ No |
| Base Contracts | Upgradeable versions | Standard versions |
| Constructor | No (uses `initialize`) | Yes |
| Endpoint | Mutable | Immutable |
| Use Case | Production hub | Was redundant |

## Next Steps

1. Update deployment scripts to use `Myntis.sol`
2. Update tests (or archive old ones)
3. Update documentation
4. Verify all references are updated

---

**Status**: `MyntisOFT.sol` deleted. Migration in progress.

