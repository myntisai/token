// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title MockGroth16Verifier
 * @notice Test-only verifier that always returns true.
 */
contract MockGroth16Verifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool value) external {
        shouldVerify = value;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[3] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}
