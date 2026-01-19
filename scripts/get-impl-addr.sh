#!/bin/bash
# Get implementation address from proxy storage slot

PROXY_ADDR="0x5242925C716225C58459f557E5B4Be51373aB767"
SLOT="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
RPC="https://sepolia.base.org"

echo "Getting implementation address..."
STORAGE=$(curl -s -X POST $RPC \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getStorageAt\",\"params\":[\"$PROXY_ADDR\",\"$SLOT\",\"latest\"],\"id\":1}" \
  | grep -o '"result":"[^"]*"' | cut -d'"' -f4)

if [ -z "$STORAGE" ] || [ "$STORAGE" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
  echo "❌ Could not find implementation address"
  exit 1
fi

IMPL_ADDR="0x${STORAGE: -40}"
echo "✅ Implementation address: $IMPL_ADDR"
echo ""
echo "To verify, run:"
echo "npx hardhat verify --network base-sepolia $IMPL_ADDR"
