import { groth16 } from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

export interface ZKProofInputs {
  // Public inputs (visible to verifier)
  merkleRoot: string;
  nullifier: string;
  claimAmount: string;
  
  // Private inputs (hidden from verifier)
  userAddress: string;
  aiLegitimacyScore: number;    // 0-100
  aiRewardMultiplier: number;   // 10-10000 (0.1x-10x scaled)
  merkleProof: string[];
  merklePathIndices: number[];
}

export interface ZKProofResult {
  proof: {
    a: [string, string];
    b: [[string, string], [string, string]];
    c: [string, string];
  };
  publicSignals: string[];
}

export interface AIScores {
  legitimacyScore: number;    // 0-100
  rewardMultiplier: number;   // 10-10000
  abuseProbability: number;   // 0-100
  engagementQuality: number;  // 0-100
  metadata: Record<string, any>;
}

export class ZKProofGenerator {
  private wasm: string;
  private zkey: string;
  private poseidon: any;

  constructor(wasmPath: string, zkeyPath: string) {
    this.wasm = wasmPath;
    this.zkey = zkeyPath;
  }

  /**
   * Initialize the proof generator
   */
  async initialize(): Promise<void> {
    try {
      this.poseidon = await buildPoseidon();
    } catch (error) {
      throw new Error(`Failed to initialize Poseidon: ${error}`);
    }
  }

  /**
   * Generate ZK proof for reward claim
   * @param inputs ZK proof inputs
   * @returns ZK proof and public signals
   */
  async generateRewardClaimProof(inputs: ZKProofInputs): Promise<ZKProofResult> {
    if (!this.poseidon) {
      throw new Error('ZKProofGenerator not initialized. Call initialize() first.');
    }

    try {
      // Prepare circuit inputs
      const circuitInputs = {
        // Public inputs
        merkleRoot: inputs.merkleRoot,
        nullifier: inputs.nullifier,
        claimAmount: inputs.claimAmount,
        
        // Private inputs (hidden)
        userAddress: inputs.userAddress,
        aiLegitimacyScore: inputs.aiLegitimacyScore,
        aiRewardMultiplier: inputs.aiRewardMultiplier,
        merkleProof: inputs.merkleProof,
        merklePathIndices: inputs.merklePathIndices
      };

      // Generate proof
      const { proof, publicSignals } = await groth16.fullProve(
        circuitInputs,
        this.wasm,
        this.zkey
      );

      return {
        proof: {
          a: proof.pi_a.slice(0, 2) as [string, string],
          b: [proof.pi_b[0].slice(0, 2), proof.pi_b[1].slice(0, 2)] as [[string, string], [string, string]],
          c: proof.pi_c.slice(0, 2) as [string, string]
        },
        publicSignals: publicSignals
      };
    } catch (error) {
      throw new Error(`Failed to generate ZK proof: ${error}`);
    }
  }

  /**
   * Generate nullifier for double-claim prevention
   * @param userAddress User's address
   * @param merkleRoot Merkle root for the claim
   * @returns Nullifier hash
   */
  generateNullifier(userAddress: string, merkleRoot: string): string {
    if (!this.poseidon) {
      throw new Error('ZKProofGenerator not initialized. Call initialize() first.');
    }

    try {
      const nullifier = this.poseidon([
        BigInt(userAddress),
        BigInt(merkleRoot)
      ]);
      return nullifier.toString();
    } catch (error) {
      throw new Error(`Failed to generate nullifier: ${error}`);
    }
  }

  /**
   * Create ZK proof inputs from user data and AI scores
   * @param userAddress User's address
   * @param aiScores AI analysis scores
   * @param merkleData Merkle proof data
   * @returns ZK proof inputs
   */
  createProofInputs(
    userAddress: string,
    aiScores: AIScores,
    merkleData: {
      root: string;
      proof: string[];
      pathIndices: number[];
      amount: string;
    }
  ): ZKProofInputs {
    // Generate nullifier
    const nullifier = this.generateNullifier(userAddress, merkleData.root);

    return {
      // Public inputs
      merkleRoot: merkleData.root,
      nullifier: nullifier,
      claimAmount: merkleData.amount,
      
      // Private inputs
      userAddress: userAddress,
      aiLegitimacyScore: aiScores.legitimacyScore,
      aiRewardMultiplier: aiScores.rewardMultiplier,
      merkleProof: merkleData.proof,
      merklePathIndices: merkleData.pathIndices
    };
  }

  /**
   * Verify a ZK proof (for testing)
   * @param proof ZK proof
   * @param publicSignals Public signals
   * @param verificationKey Verification key
   * @returns True if proof is valid
   */
  async verifyProof(
    proof: ZKProofResult['proof'],
    publicSignals: string[],
    verificationKey: any
  ): Promise<boolean> {
    try {
      return await groth16.verify(verificationKey, publicSignals, proof);
    } catch (error) {
      console.error('Proof verification failed:', error);
      return false;
    }
  }

  /**
   * Get proof generation statistics
   * @returns Statistics object
   */
  getStats(): {
    isInitialized: boolean;
    hasWasm: boolean;
    hasZkey: boolean;
  } {
    return {
      isInitialized: !!this.poseidon,
      hasWasm: !!this.wasm,
      hasZkey: !!this.zkey
    };
  }
}

/**
 * Utility functions for ZK proof generation
 */
export class ZKProofUtils {
  /**
   * Convert AI scores to ZK-compatible format
   * @param aiScores AI analysis scores
   * @returns ZK-compatible scores
   */
  static formatAIScores(aiScores: AIScores): {
    legitimacyScore: number;
    rewardMultiplier: number;
  } {
    return {
      legitimacyScore: Math.max(0, Math.min(100, aiScores.legitimacyScore)),
      rewardMultiplier: Math.max(10, Math.min(10000, aiScores.rewardMultiplier))
    };
  }

  /**
   * Validate ZK proof inputs
   * @param inputs ZK proof inputs
   * @returns True if valid
   */
  static validateProofInputs(inputs: ZKProofInputs): boolean {
    try {
      // Check required fields
      if (!inputs.merkleRoot || !inputs.nullifier || !inputs.claimAmount) {
        return false;
      }
      if (!inputs.userAddress || !inputs.merkleProof || !inputs.merklePathIndices) {
        return false;
      }

      // Validate score ranges
      if (inputs.aiLegitimacyScore < 0 || inputs.aiLegitimacyScore > 100) {
        return false;
      }
      if (inputs.aiRewardMultiplier < 10 || inputs.aiRewardMultiplier > 10000) {
        return false;
      }

      // Validate claim amount
      const amount = BigInt(inputs.claimAmount);
      if (amount <= 0) {
        return false;
      }

      // Validate merkle proof length
      if (inputs.merkleProof.length !== 8 || inputs.merklePathIndices.length !== 8) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create mock ZK proof inputs for testing
   * @param userAddress User's address
   * @returns Mock ZK proof inputs
   */
  static createMockInputs(userAddress: string): ZKProofInputs {
    return {
      merkleRoot: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      nullifier: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      claimAmount: "1000000000000000000", // 1 token
      userAddress: userAddress,
      aiLegitimacyScore: 85,
      aiRewardMultiplier: 2500, // 2.5x multiplier
      merkleProof: Array(8).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"),
      merklePathIndices: Array(8).fill(0)
    };
  }
}

export default ZKProofGenerator;
