#!/bin/bash
# Quick script to query old distributor state

echo "Querying old ZKMerkleDistributor state..."
echo ""
echo "Old Production Distributor: 0xF8adFB263Fd6682055941e6c16750d8D34BDeec0"
echo ""

# Set the old distributor address
export OLD_DISTRIBUTOR_ADDRESS=0xF8adFB263Fd6682055941e6c16750d8D34BDeec0

# Set provider address if available
if [ -n "$PROVIDER_ADDRESS" ]; then
    export PROVIDER_ADDRESSES=$PROVIDER_ADDRESS
fi

# Run the query script
npx hardhat run scripts/query-distributor-state.ts --network base-sepolia
