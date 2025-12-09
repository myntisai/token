// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title SimpleProxy
 * @notice Simple wrapper around ERC1967Proxy for easy deployment
 */
contract SimpleProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory data) 
        ERC1967Proxy(implementation, data) 
    {}
}
