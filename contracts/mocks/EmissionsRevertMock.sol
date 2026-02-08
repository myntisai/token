// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract EmissionsRevertMock {
    function initializeNewProvider(address) external pure {
        revert("init revert");
    }

    function harvest(address) external pure {
        revert("harvest revert");
    }
}
