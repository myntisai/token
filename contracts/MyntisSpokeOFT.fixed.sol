// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title MyntisSpokeOFT
 * @notice Spoke OFT token for cross-chain Myntis distribution
 * @dev Wrapped token on spoke chains, minted/burned by bridge operations
 * @dev Simplified OFT implementation without LayerZero dependencies for now
 * @dev FIX: Added null checks in bridgeIn and receiveFrom functions
 */
contract MyntisSpokeOFT is 
    Initializable,
    ERC20Upgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // Cross-chain state
    mapping(uint32 => bytes32) public peers; // chainId => peer address
    uint32 public hubChainId;
    address public hubToken; // Hub token address (for reference)

    // Events
    event PeerSet(uint32 indexed chainId, bytes32 indexed peer);
    event TokensSent(uint32 indexed dstChainId, address indexed to, uint256 amount);
    event TokensReceived(uint32 indexed srcChainId, address indexed to, uint256 amount);
    event TokensBridgedIn(address indexed to, uint256 amount);
    event TokensBridgedOut(address indexed from, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the spoke OFT token
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _delegate Delegate address
     * @param _hubChainId Hub chain ID
     * @param _hubToken Hub token address
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        address _delegate,
        uint32 _hubChainId,
        address _hubToken
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        hubChainId = _hubChainId;
        hubToken = _hubToken;

        _grantRole(ADMIN_ROLE, _delegate);
        _grantRole(MINTER_ROLE, _delegate);
        _grantRole(BURNER_ROLE, _delegate);
        _grantRole(UPGRADER_ROLE, _delegate);
    }

    /**
     * @notice Authorize upgrade (UUPS pattern)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Set peer contract on another chain
     * @param _chainId Destination chain ID
     * @param _peer Peer contract address
     */
    function setPeer(uint32 _chainId, bytes32 _peer) external onlyRole(ADMIN_ROLE) {
        peers[_chainId] = _peer;
        emit PeerSet(_chainId, _peer);
    }

    /**
     * @notice Send tokens to another chain (OFT functionality)
     * @param _dstChainId Destination chain ID
     * @param _to Destination address
     * @param _amount Amount to send
     */
    function sendFrom(
        address _from,
        uint32 _dstChainId,
        bytes32 _to,
        uint256 _amount
    ) external whenNotPaused {
        require(peers[_dstChainId] != bytes32(0), "Peer not set");
        require(_amount > 0, "Amount must be positive");
        
        if (_from != msg.sender) {
            _spendAllowance(_from, msg.sender, _amount);
        }
        
        // Burn tokens from sender
        _burn(_from, _amount);
        
        // In a real implementation, this would send a LayerZero message
        // For now, we'll just emit an event
        emit TokensSent(_dstChainId, address(uint160(uint256(_to))), _amount);
    }

    /**
     * @notice Receive tokens from another chain (OFT functionality)
     * @param _srcChainId Source chain ID
     * @param _to Destination address
     * @param _amount Amount to receive
     * @dev FIX: Added null check for _to parameter
     */
    function receiveFrom(
        uint32 _srcChainId,
        address _to,
        uint256 _amount
    ) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(_to != address(0), "MyntisSpokeOFT: zero recipient");
        require(_amount > 0, "Amount must be positive");
        
        // Mint tokens to recipient
        _mint(_to, _amount);
        
        emit TokensReceived(_srcChainId, _to, _amount);
    }

    /**
     * @notice Bridge tokens in from hub chain
     * @param _to Destination address
     * @param _amount Amount to bridge
     * @dev FIX: Added null check for _to parameter
     */
    function bridgeIn(address _to, uint256 _amount) external onlyRole(MINTER_ROLE) {
        require(_to != address(0), "MyntisSpokeOFT: zero recipient");
        require(_amount > 0, "Amount must be positive");
        
        _mint(_to, _amount);
        emit TokensBridgedIn(_to, _amount);
    }

    /**
     * @notice Bridge tokens out to hub chain
     * @param _from Source address
     * @param _amount Amount to bridge
     */
    function bridgeOut(address _from, uint256 _amount) external onlyRole(BURNER_ROLE) {
        require(_amount > 0, "Amount must be positive");
        
        _burn(_from, _amount);
        emit TokensBridgedOut(_from, _amount);
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
     * @notice Get cross-chain information
     */
    function getCrossChainInfo() external view returns (
        uint32 hubChainId_,
        address hubToken_,
        uint32 currentChainId
    ) {
        return (
            hubChainId,
            hubToken,
            uint32(block.chainid)
        );
    }

    /**
     * @notice Get contract information
     */
    function getContractInfo() external view returns (
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        bool paused_
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            paused()
        );
    }
}

