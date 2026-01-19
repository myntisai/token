# Unclaimed Rewards Summary - Old ZKMerkleDistributor

**Contract**: `0xF8adFB263Fd6682055941e6c16750d8D34BDeec0`  
**Provider**: `0x89C6C4e7F952C1c07467E32Ea2fF0660f6d4C627`  
**Query Date**: January 7, 2026

## Current State

### Balances
- **Available Balance**: 119,594.82 MYNT
- **Locked Balance**: 301,822.75 MYNT (reserved for active epochs)
- **Total Balance**: 421,417.56 MYNT

### Epoch Summary
- **Total Epochs**: 177
- **Active Epochs**: 99
- **Expired Epochs**: 78
- **Closed Epochs**: 0

### Distribution Totals
- **Total Distributed**: 2,643,411.27 MYNT
- **Total Claimed**: 2,341,588.53 MYNT (88.6%)
- **Total Unclaimed**: 301,822.75 MYNT (11.4%)

## Unclaimed Epochs

The following epochs have unclaimed rewards:

| Epoch | Root | Expiry | Total (MYNT) | Unclaimed (MYNT) | Claim Rate |
|-------|------|--------|--------------|------------------|------------|
| 160 | 0xbdc8e6d2... | 2026-01-12 18:24 | 1,377.77 | **1,377.77** | 0% |
| 163 | 0x28aacd5c... | 2026-01-12 21:54 | 22,142.30 | **8,303.36** | 62.5% |
| 164 | 0x5b2bb250... | 2026-01-12 22:04 | 1,637.60 | **1,637.60** | 0% |
| 165 | 0xf630be3b... | 2026-01-12 22:24 | 7,093.36 | **7,093.36** | 0% |
| 166 | 0x87096d79... | 2026-01-12 22:34 | 2,848.23 | **2,848.23** | 0% |
| 167 | 0x42d58cae... | 2026-01-12 22:44 | 5,977.65 | **5,977.65** | 0% |
| 168 | 0x226864c1... | 2026-01-13 00:04 | 1,872.01 | **1,872.01** | 0% |
| 176 | 0xc6d398d2... | 2026-01-13 19:04 | 5,031.59 | **5,031.59** | 0% |

**Total Unclaimed in Active Epochs**: ~34,138 MYNT

## Migration Considerations

### Critical Points

1. **301,822 MYNT locked** - This represents unclaimed rewards across all epochs
2. **99 active epochs** - Users can still claim from these
3. **78 expired epochs** - These should be closed to return unclaimed tokens to provider balance
4. **No closed epochs** - All epochs are still active (even expired ones)

### Migration Strategy Options

**Option 1: Keep Old Distributor Active**
- Users continue claiming from old distributor
- New batches go to new distributor
- Both distributors active during migration period
- **Pros**: No disruption, users can claim from both
- **Cons**: Two systems to maintain

**Option 2: Migrate Unclaimed Rewards**
- Query all unclaimed rewards from old distributor
- Create new Merkle roots in new distributor
- Mark old claims as migrated
- **Pros**: Single system, cleaner
- **Cons**: Complex migration, gas costs

**Option 3: Close Expired Epochs**
- Close all expired epochs (78 epochs)
- Return unclaimed tokens to provider balance
- Users can still claim from active epochs
- **Pros**: Recover locked tokens
- **Cons**: Users lose ability to claim from expired epochs

## Next Steps

1. ✅ Query complete - Current state documented
2. ⏳ Decide on migration strategy
3. ⏳ If migrating: Create migration script
4. ⏳ If keeping both: Update frontend to support dual distributors
5. ⏳ Close expired epochs (if desired)

## Data Files

- Full query results: `distributor-state-*.json`
- Contains complete epoch data, Merkle roots, expiry dates, claim status
