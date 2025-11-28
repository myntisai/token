// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IGlobalSupplyRegistry
 * @notice Interface for global supply tracking across chains
 */
interface IGlobalSupplyRegistry {
    /**
     * @notice Record a mint on the hub chain
     * @param amount Amount minted
     */
    function recordMint(uint256 amount) external;

    /**
     * @notice Record a burn on the hub chain
     * @param amount Amount burned
     */
    function recordBurn(uint256 amount) external;

    /**
     * @notice Check if minting would exceed global cap
     * @param amount Amount to mint
     * @return true if minting is allowed
     */
    function canMint(uint256 amount) external view returns (bool);

    /**
     * @notice Get total supply across all chains
     * @return Total cross-chain supply
     */
    function getGlobalSupply() external view returns (uint256);
}

