# Myntis OFT Implementation Decision

## Current Status: ❌ NOT a Proper LayerZero V2 OFT

Your `Myntis.sol` uses LayerZero V2's endpoint directly but **does not follow the OFT standard**.

### What You Have vs. What OFT Standard Provides

| Feature | Your Myntis.sol | Proper OFT V2 |
|---------|-----------------|---------------|
| Message Format | Custom `BridgeMessage` struct | Standard OFT message (compatible everywhere) |
| Send Function | `bridge()` | `send()` with `SendParam` struct |
| Fee Quoting | `quoteBridge()` | `quoteSend()` (standardized) |
| Options | Raw bytes (easy to misconfigure) | `OptionsBuilder` with enforced gas |
| Security | Basic peer check | DVN config, rate limiting, security features |
| Composability | ❌ Custom format | ✅ Works with all OFT tooling |
| Receive Hook | Basic `lzReceive()` | `_lzReceive()` with compose support |
| Delegate Pattern | ❌ Missing | ✅ Admin delegation for OApp config |

---

## Your Options

### Option A: Upgrade to Proper OFT V2 (Recommended) ⭐

**Best for**: New deployments, testnets, full cross-chain compatibility

```bash
# Install required packages
cd token
npm install @layerzerolabs/oapp-evm @layerzerolabs/oft-evm
```

Then use the official OFT base:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MyntisOFT is OFT {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;
    
    constructor(
        address _lzEndpoint,
        address _delegate
    ) OFT("Myntis", "MYNT", _lzEndpoint, _delegate) Ownable(_delegate) {}
    
    function mint(address _to, uint256 _amount) external onlyOwner {
        require(totalSupply() + _amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(_to, _amount);
    }
}
```

**Pros:**
- ✅ Full LayerZero ecosystem compatibility
- ✅ Standard tooling (LayerZero Scan, explorers)
- ✅ Built-in security features
- ✅ Proper gas estimation
- ✅ DVN/Executor configuration
- ✅ Compose support for complex operations

**Cons:**
- ⚠️ Need to redeploy (or use adapter pattern)
- ⚠️ Different interface than current `bridge()`

---

### Option B: OFTAdapter Pattern (For Existing Tokens)

**Best for**: Already deployed tokens you can't change

Keep your existing `Myntis.sol` as-is and deploy an `OFTAdapter`:

```solidity
import { OFTAdapter } from "@layerzerolabs/oft-evm/contracts/OFTAdapter.sol";

contract MyntisOFTAdapter is OFTAdapter {
    constructor(
        address _token,        // Your existing Myntis token
        address _lzEndpoint,
        address _delegate
    ) OFTAdapter(_token, _lzEndpoint, _delegate) {}
}
```

**How it works:**
1. User locks MYNT in adapter
2. Adapter sends OFT message to destination
3. Destination chain mints representation
4. Bridge back: burn representation → unlock original

**Pros:**
- ✅ No changes to existing token
- ✅ Full OFT compatibility
- ✅ Can be added to already-deployed tokens

**Cons:**
- ⚠️ Extra contract to maintain
- ⚠️ Users need to interact with adapter, not token directly
- ⚠️ Lock/unlock pattern vs burn/mint

---

### Option C: Fix Current Implementation (Quick Patch)

**Best for**: If you must keep current architecture but want to improve it

Add missing features to your current contract:

```solidity
// Add to Myntis.sol

import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";

// Add enforced options storage
mapping(uint32 => bytes) public enforcedOptions;

// Add enforced gas limits
function setEnforcedOptions(uint32 _eid, uint128 _gas, uint128 _value) external onlyRole(ADMIN_ROLE) {
    enforcedOptions[_eid] = OptionsBuilder.newOptions()
        .addExecutorLzReceiveOption(_gas, _value);
}

// Update bridge to use enforced options
function bridge(...) external payable {
    bytes memory options = enforcedOptions[dstEid];
    require(options.length > 0, "No enforced options for chain");
    // ... rest of bridge logic
}
```

**Pros:**
- ✅ Minimal changes
- ✅ Better gas estimation

**Cons:**
- ❌ Still not "standard" OFT
- ❌ Won't work with OFT tooling
- ❌ Custom message format remains

---

## Recommendation for Testnet Deployment

Since you're deploying to **testnets** anyway, I recommend:

### 🎯 Go with Option A (Proper OFT V2)

1. **Install OFT packages:**
   ```bash
   cd token
   npm install @layerzerolabs/oapp-evm @layerzerolabs/oft-evm
   ```

2. **Create proper OFT contract** (I can help you write this)

3. **Deploy fresh on testnets** with the standard interface

4. **Test cross-chain** with proper tooling

5. **When going mainnet**, you'll have battle-tested standard OFT

---

## LayerZero V2 Endpoint Addresses (For Reference)

All testnets use the same V2 endpoint address:
```
0x6EDCE65403992e310A62460808c4b910D972f10f
```

But you need to configure **DVNs (Decentralized Verifier Networks)** and **Executors** for each path:

```solidity
// Example: Configure DVN for Base Sepolia → Ethereum Sepolia
endpoint.setConfig(
    address(this),           // OApp address
    address(sendLib),        // Send library
    SetConfigParam({
        eid: 40161,          // Ethereum Sepolia EID
        configType: 2,       // DVN config
        config: abi.encode(dvnConfig)
    })
);
```

---

## Action Items

1. **Decision**: Choose Option A, B, or C
2. **If Option A**: 
   - Install packages
   - Create new OFT contract
   - Update deployment scripts
3. **If Option B**:
   - Keep current token
   - Deploy adapter alongside
4. **If Option C**:
   - Patch current contract
   - Accept non-standard limitations

---

## Let Me Know

Would you like me to:
1. **Create a proper OFT V2 contract** that matches your tokenomics?
2. **Create an OFTAdapter** for your existing deployment?
3. **Patch the current implementation** with better options handling?

The testnet is the perfect time to get this right before mainnet!

