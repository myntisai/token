// Type declarations for snarkjs and circomlibjs
declare module 'snarkjs' {
  export const groth16: any;
  export const zkey: any;
  export const powersoftau: any;
}

declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>;
}

