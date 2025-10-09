// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MyntisSpoke
 * @notice Lightweight ERC20 token for spoke chains
 * @dev No emissions, no complex logic - pure bridge functionality
 * @dev Only bridge can mint/burn tokens
 */
contract MyntisSpoke is ERC20, AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // Hub chain information
    uint32 public immutable hubChainId;
    address public immutable hubTokenAddress;
    
    // Events
    event TokensMinted(address indexed to, uint256 amount, string reason);
    event TokensBurned(address indexed from, uint256 amount, string reason);
    event BridgeRoleUpdated(address indexed bridge, bool enabled);

    constructor(
        string memory name,
        string memory symbol,
        uint32 _hubChainId,
        address _hubTokenAddress,
        address admin
    ) ERC20(name, symbol) {
        hubChainId = _hubChainId;
        hubTokenAddress = _hubTokenAddress;
        
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(BRIDGE_ROLE, admin); // Admin can also bridge initially
    }

    /**
     * @notice Mint tokens (only bridge)
     * @dev Used when tokens are bridged from hub to spoke
     */
    function mint(address to, uint256 amount, string calldata reason) external onlyRole(MINTER_ROLE) {
        require(!paused(), "Minting is paused");
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than zero");
        
        _mint(to, amount);
        emit TokensMinted(to, amount, reason);
    }

    /**
     * @notice Burn tokens (only bridge)
     * @dev Used when tokens are bridged from spoke to hub
     */
    function burn(address from, uint256 amount, string calldata reason) external onlyRole(BURNER_ROLE) {
        require(!paused(), "Burning is paused");
        require(from != address(0), "Cannot burn from zero address");
        require(amount > 0, "Amount must be greater than zero");
        require(balanceOf(from) >= amount, "Insufficient balance");
        
        _burn(from, amount);
        emit TokensBurned(from, amount, reason);
    }

    /**
     * @notice Set bridge role for cross-chain operations
     */
    function setBridgeRole(address bridge, bool enabled) external onlyRole(ADMIN_ROLE) {
        if (enabled) {
            _grantRole(BRIDGE_ROLE, bridge);
            _grantRole(MINTER_ROLE, bridge);
            _grantRole(BURNER_ROLE, bridge);
        } else {
            _revokeRole(BRIDGE_ROLE, bridge);
            _revokeRole(MINTER_ROLE, bridge);
            _revokeRole(BURNER_ROLE, bridge);
        }
        emit BridgeRoleUpdated(bridge, enabled);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Override transfer to include pause check
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!paused(), "Token transfers are paused");
        return super.transfer(to, amount);
    }

    /**
     * @notice Override transferFrom to include pause check
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(!paused(), "Token transfers are paused");
        return super.transferFrom(from, to, amount);
    }

    /**
     * @notice Get hub chain information
     */
    function getHubInfo() external view returns (uint32 chainId, address tokenAddress) {
        return (hubChainId, hubTokenAddress);
    }

    /**
     * @notice Get contract information
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint32 hubChainId_,
        address hubTokenAddress_,
        bool paused_
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            hubChainId,
            hubTokenAddress,
            paused()
        );
    }
}
