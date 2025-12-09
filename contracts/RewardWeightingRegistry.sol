// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title RewardWeightingRegistry
 * @notice On-chain registry for provider reward weighting strategies
 * @dev Allows providers to specify their preferred off-chain weighting strategy
 * @dev UUPS upgradeable for future enhancements
 */
contract RewardWeightingRegistry is 
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable 
{
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PROVIDER_ROLE = keccak256("PROVIDER_ROLE");
    
    struct StrategyInfo {
        string strategyName;      // e.g., "myntis_default", "custom_ml_v1"
        string version;           // e.g., "1.0.0"
        string endpointUrl;       // Optional: URL for custom off-chain service
        bytes32 configHash;       // Hash of strategy configuration
        bool active;
        uint256 registeredAt;     // Timestamp of registration
    }
    
    // Provider address => Strategy info
    mapping(address => StrategyInfo) public providerStrategies;
    
    // Strategy name => is approved
    mapping(string => bool) public approvedStrategies;
    
    // Strategy name => usage count
    mapping(string => uint256) public strategyUsageCount;
    
    // SECURITY FIX: Array to track all approved strategy names
    string[] private _approvedStrategyList;
    
    // Events
    event StrategyRegistered(
        address indexed provider, 
        string strategyName, 
        string version,
        string endpointUrl,
        bytes32 configHash
    );
    event StrategyUpdated(
        address indexed provider, 
        string strategyName, 
        string version
    );
    event StrategyApproved(string strategyName);
    event StrategyRevoked(string strategyName);
    event ProviderRoleGranted(address indexed provider);
    event ProviderRoleRevoked(address indexed provider);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the reward weighting registry
     * @param admin Admin address
     * @dev SECURITY FIX: Added zero address validation
     */
    function initialize(address admin) public initializer {
        require(admin != address(0), "RewardWeightingRegistry: invalid admin");
        
        __AccessControl_init();
        __UUPSUpgradeable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        
        // Approve default Myntis strategy
        approvedStrategies["myntis_default"] = true;
        _approvedStrategyList.push("myntis_default");
        emit StrategyApproved("myntis_default");
    }
    
    /**
     * @notice Register or update provider's reward weighting strategy
     * @param strategyName Name of the strategy
     * @param version Version of the strategy
     * @param endpointUrl Optional endpoint URL for custom service
     * @param configHash Hash of strategy configuration
     */
    function setProviderStrategy(
        string memory strategyName,
        string memory version,
        string memory endpointUrl,
        bytes32 configHash
    ) external onlyRole(PROVIDER_ROLE) {
        require(approvedStrategies[strategyName], "Strategy not approved");
        require(bytes(strategyName).length > 0, "Invalid strategy name");
        require(bytes(version).length > 0, "Invalid version");
        
        StrategyInfo memory previous = providerStrategies[msg.sender];
        bool isUpdate = bytes(previous.strategyName).length > 0;
        
        providerStrategies[msg.sender] = StrategyInfo({
            strategyName: strategyName,
            version: version,
            endpointUrl: endpointUrl,
            configHash: configHash,
            active: true,
            registeredAt: block.timestamp
        });
        
        // Update usage count
        if (isUpdate) {
            if (strategyUsageCount[previous.strategyName] > 0 && keccak256(bytes(previous.strategyName)) != keccak256(bytes(strategyName))) {
                strategyUsageCount[previous.strategyName]--;
            }
        }
        strategyUsageCount[strategyName]++;
        
        if (isUpdate) {
            emit StrategyUpdated(msg.sender, strategyName, version);
        } else {
            emit StrategyRegistered(msg.sender, strategyName, version, endpointUrl, configHash);
        }
    }
    
    /**
     * @notice Deactivate provider's strategy
     */
    function deactivateStrategy() external onlyRole(PROVIDER_ROLE) {
        require(bytes(providerStrategies[msg.sender].strategyName).length > 0, "No strategy registered");
        
        string memory strategyName = providerStrategies[msg.sender].strategyName;
        providerStrategies[msg.sender].active = false;
        
        // Decrease usage count
        if (strategyUsageCount[strategyName] > 0) {
            strategyUsageCount[strategyName]--;
        }
        
        emit StrategyUpdated(msg.sender, strategyName, "");
    }
    
    /**
     * @notice Approve a new strategy (admin only)
     * @param strategyName Name of the strategy to approve
     * @dev SECURITY FIX: Maintains _approvedStrategyList for accurate getApprovedStrategies()
     */
    function approveStrategy(string memory strategyName) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(bytes(strategyName).length > 0, "Invalid strategy name");
        
        // Only add to list if not already approved
        if (!approvedStrategies[strategyName]) {
            _approvedStrategyList.push(strategyName);
        }
        
        approvedStrategies[strategyName] = true;
        emit StrategyApproved(strategyName);
    }
    
    /**
     * @notice Revoke a strategy (admin only)
     * @param strategyName Name of the strategy to revoke
     */
    function revokeStrategy(string memory strategyName) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(bytes(strategyName).length > 0, "Invalid strategy name");
        approvedStrategies[strategyName] = false;
        emit StrategyRevoked(strategyName);
    }
    
    /**
     * @notice Grant provider role to an address
     * @param provider Address to grant provider role
     */
    function grantProviderRole(address provider) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _grantRole(PROVIDER_ROLE, provider);
        emit ProviderRoleGranted(provider);
    }
    
    /**
     * @notice Revoke provider role from an address
     * @param provider Address to revoke provider role
     */
    function revokeProviderRole(address provider) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _revokeRole(PROVIDER_ROLE, provider);
        emit ProviderRoleRevoked(provider);
    }
    
    /**
     * @notice Get provider's strategy info
     * @param provider Provider address
     * @return Strategy information
     */
    function getProviderStrategy(address provider) 
        external 
        view 
        returns (StrategyInfo memory) 
    {
        return providerStrategies[provider];
    }
    
    /**
     * @notice Check if a provider has an active strategy
     * @param provider Provider address
     * @return True if provider has active strategy
     */
    function hasActiveStrategy(address provider) external view returns (bool) {
        StrategyInfo memory strategy = providerStrategies[provider];
        return strategy.active && bytes(strategy.strategyName).length > 0;
    }
    
    /**
     * @notice Get strategy usage count
     * @param strategyName Name of the strategy
     * @return Number of providers using this strategy
     */
    function getStrategyUsageCount(string memory strategyName) 
        external 
        view 
        returns (uint256) 
    {
        return strategyUsageCount[strategyName];
    }
    
    /**
     * @notice Check if a strategy is approved
     * @param strategyName Name of the strategy
     * @return True if strategy is approved
     */
    function isStrategyApproved(string memory strategyName) 
        external 
        view 
        returns (bool) 
    {
        return approvedStrategies[strategyName];
    }
    
    /**
     * @notice Get all approved strategies
     * @return Array of approved strategy names (only currently approved ones)
     * @dev SECURITY FIX: Returns actual approved strategies from _approvedStrategyList
     * @dev Note: This may include revoked strategies in the underlying array
     *      but only returns currently approved ones
     */
    function getApprovedStrategies() external view returns (string[] memory) {
        // Count approved strategies
        uint256 count = 0;
        for (uint256 i = 0; i < _approvedStrategyList.length; i++) {
            if (approvedStrategies[_approvedStrategyList[i]]) {
                count++;
            }
        }
        
        // Create result array
        string[] memory result = new string[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < _approvedStrategyList.length; i++) {
            if (approvedStrategies[_approvedStrategyList[i]]) {
                result[index] = _approvedStrategyList[i];
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @notice Get registry statistics
     * @return totalProviders Total number of providers with strategies
     * @return totalStrategies Total number of unique strategies in use
     */
    function getRegistryStats() external view returns (uint256 totalProviders, uint256 totalStrategies) {
        // This would require iterating through all providers
        // For now, return placeholder values
        return (0, 1); // Placeholder
    }
    
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(UPGRADER_ROLE) 
    {}
}
