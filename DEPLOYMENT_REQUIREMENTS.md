# Token Deployment Requirements - Critical Steps

## ⚠️ CRITICAL: Two Remaining Deployment Requirements

### 1. TOKEN_ROLE Registration (MUST DO BEFORE ENABLING REGISTRY)

**Problem**: `GlobalSupplyRegistry.recordMint/recordBurn` require `TOKEN_ROLE`, but tokens are not auto-registered.

**Impact**: If you set the registry before granting TOKEN_ROLE, all mint/burn/bridge operations will revert.

**Solution**: After deploying tokens, **BEFORE** calling `setGlobalSupplyRegistry()`:

```solidity
// Step 1: Deploy registry
GlobalSupplyRegistry registry = new GlobalSupplyRegistry(endpoint, admin);

// Step 2: Deploy hub token
Myntis hubToken = new Myntis();
hubToken.initialize(admin, cap, maxSupply, endpoint);

// Step 3: CRITICAL - Register token BEFORE setting registry
registry.registerToken(address(hubToken));

// Step 4: Now safe to set registry in token
hubToken.setGlobalSupplyRegistry(address(registry));
```

**For Myntis (upgradeable hub token)**:
```solidity
registry.registerToken(address(myntis));
myntis.setGlobalSupplyRegistry(address(registry));
```

**Verification**: Check that token has TOKEN_ROLE:
```solidity
require(registry.hasRole(registry.TOKEN_ROLE(), address(hubToken)), "Token not registered");
```

---

### 2. Spoke Supply Reporting (REQUIRED FOR CAP ENFORCEMENT)

**Problem**: `MyntisSpokeOFT` mints/burns tokens but never reports to the registry, so the global 1B cap is unenforced on spokes.

**Impact**: Spoke chains can mint unlimited tokens, breaking the global supply cap.

**Solution Options**:

#### Option A: Manual Keeper/Relayer (Recommended for Launch)
1. Set up a keeper service (Chainlink Automation, Gelato, custom bot)
2. Keeper listens to `SupplyChangeRequiresReporting` events
3. Keeper calls `reportSupplyUpdate()` with appropriate fees

**Event to Monitor**:
```solidity
event SupplyChangeRequiresReporting(uint256 newTotalSupply, uint32 chainId);
```

**Keeper Implementation**:
```solidity
// Pseudo-code for keeper
function onSupplyChangeEvent() {
    uint256 fee = spokeToken.quoteSupplyReportFee();
    spokeToken.reportSupplyUpdate{value: fee}(options, keeperAddress);
}
```

#### Option B: Batch Reporting (Future Enhancement)
- Report supply changes in batches to reduce gas costs
- Use a relayer service that aggregates multiple changes
- Consider using LayerZero's native batching if available

#### Option C: Automatic Reporting (Requires Fee Delegation)
- Contract holds native tokens for reporting
- Automatic reporting on significant supply changes
- Requires careful fee management to prevent depletion

**Current Implementation**:
- ✅ `reportSupplyUpdate()` function exists and is public
- ✅ `SupplyChangeRequiresReporting` events emitted on all supply changes
- ✅ `setRegistryPeer()` allows configuring registry address
- ⚠️ Requires manual/keeper calls due to LayerZero fee requirements

**Deployment Steps for Spoke**:
```solidity
// 1. Deploy spoke token
MyntisSpokeOFT spokeToken = new MyntisSpokeOFT();
spokeToken.initialize(name, symbol, admin, hubChainId, hubToken, endpoint);

// 2. Register spoke in hub registry
registry.registerSpoke(spokeEid, bytes32(uint256(uint160(address(spokeToken)))));

// 3. Set registry peer in spoke
spokeToken.setRegistryPeer(bytes32(uint256(uint160(address(registry)))));

// 4. Set up keeper to monitor SupplyChangeRequiresReporting events
// 5. Keeper calls reportSupplyUpdate() when events are emitted
```

---

## Deployment Checklist

### Hub Chain
- [ ] Deploy `GlobalSupplyRegistry`
- [ ] Deploy hub token (`Myntis.sol` with UUPS proxy)
- [ ] **CRITICAL**: `registry.registerToken(hubTokenAddress)` - grants TOKEN_ROLE
- [ ] `hubToken.setGlobalSupplyRegistry(registryAddress)`
- [ ] If existing supply: `registry.seedChainSupply(hubChainId, currentSupply)`
- [ ] Verify: `registry.hasRole(registry.TOKEN_ROLE(), hubTokenAddress) == true`

### Spoke Chain
- [ ] Deploy `MyntisSpokeOFT`
- [ ] Register spoke in hub registry: `registry.registerSpoke(spokeEid, bytes32(uint256(uint160(spokeTokenAddress))))`
- [ ] `spokeToken.setRegistryPeer(bytes32(uint256(uint160(registryAddress))))`
- [ ] If existing supply: `registry.seedChainSupply(spokeChainId, currentSupply)`
- [ ] **REQUIRED**: Set up keeper/relayer to call `reportSupplyUpdate()` on `SupplyChangeRequiresReporting` events

---

## Verification Commands

```bash
# Verify TOKEN_ROLE is granted
cast call $REGISTRY "hasRole(bytes32,address)" $(cast sig "TOKEN_ROLE()") $TOKEN_ADDRESS

# Check if registry is set in token
cast call $TOKEN "globalSupplyRegistry()" 

# Verify spoke is registered
cast call $REGISTRY "peers(uint32)" $SPOKE_EID

# Check current supply in registry
cast call $REGISTRY "totalCrossChainSupply()"
```

---

## Current Status

✅ **Fixed**:
- Registry role changed to TOKEN_ROLE (with registration function)
- Burn accounting uses netAmount
- Replay protection added to Myntis
- Registry seeding function added
- Spoke reporting function exists with events

⚠️ **Requires Manual Steps**:
- TOKEN_ROLE registration (one-time, before enabling registry)
- Spoke supply reporting (ongoing, via keeper/relayer)

---

## Recommendations

1. **For Mainnet Launch**:
   - Use Option A (keeper/relayer) for spoke reporting
   - Document keeper setup in operations runbook
   - Monitor `SupplyChangeRequiresReporting` events
   - Set up alerts if reporting fails

2. **Future Enhancements**:
   - Automatic fee delegation for spoke reporting
   - Batch reporting to reduce costs
   - Registry pull mechanism (if LayerZero supports it)

3. **Testing**:
   - Test TOKEN_ROLE registration before enabling registry
   - Test spoke reporting with mock keeper
   - Verify cap enforcement works across chains

---

**All code fixes are complete. The remaining items are deployment/operational requirements that must be followed for the system to work correctly.**

