import { expect } from "chai";
import { ethers } from "hardhat";

describe("Groth16Verifier Coverage", function () {
  it("verifyProof returns false for invalid proof", async function () {
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const proofA = [0, 0];
    const proofB = [
      [0, 0],
      [0, 0]
    ];
    const proofC = [0, 0];
    const pubSignals = [0, 0, 0];

    const ok = await verifier.verifyProof(proofA, proofB, proofC, pubSignals);
    expect(ok).to.equal(false);
  });
});
