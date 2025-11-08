# Installing Circom Compiler

## Issue

The npm package `circom` is deprecated and doesn't support Circom 2.0 syntax. We need to install the official Circom compiler.

## Option 1: Install from Source (Recommended)

### Prerequisites
- Rust (install from https://rustup.rs/)
- Node.js and npm

### Steps

1. **Install Rust** (if not installed):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

2. **Clone and Build Circom**:
   ```bash
   git clone https://github.com/iden3/circom.git
   cd circom
   cargo build --release
   cargo install --path circom
   ```

3. **Verify Installation**:
   ```bash
   circom --version
   ```

## Option 2: Use Pre-built Binary

1. **Download from Releases**:
   - Visit: https://github.com/iden3/circom/releases
   - Download the latest release for your OS
   - Extract and add to PATH

## Option 3: Use Docker

```bash
docker pull iden3/circom:latest
docker run --rm -v $(pwd):/workspace iden3/circom:latest circom --version
```

## After Installation

Once Circom is installed, you can compile the circuit:

```bash
cd token/zk-circuits
circom reward_claim.circom --r1cs --wasm --sym --c
```

## Current Status

The circuit file uses Circom 2.0 syntax (`pragma circom 2.0.0;`), which requires the official Circom compiler. The deprecated npm package `circom@0.5.46` cannot compile it.

## Alternative: Update Scripts to Use Docker

If installation is difficult, we can update the scripts to use Docker:

```bash
# compile.sh would become:
docker run --rm -v $(pwd):/workspace iden3/circom:latest \
  circom /workspace/reward_claim.circom --r1cs --wasm --sym --c
```

