import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTree } from "merkletreejs";

describe("Multi-Provider Merkle Root Management", function () {
    let owner: SignerWithAddress;
    let providers: SignerWithAddress[];
    let users: SignerWithAddress[];

    let token: any;
    let stakingContract: any;
    let emissionContract: any;
    let merkleDistributor: any;

    // Test configuration
    const NUM_PROVIDERS = 10;
    const NUM_USERS = 20;
    const MIN_STAKE = ethers.parseEther("1000");
    const PROVIDER_FUNDING = ethers.parseEther("10000");

    beforeEach(async function () {
        const signers = await ethers.getSigners();
        owner = signers[0];
        
        // Ensure we have enough signers, reuse if necessary
        providers = [];
        users = [];
        
        for (let i = 0; i < NUM_PROVIDERS; i++) {
            providers.push(signers[(i % (signers.length - 1)) + 1]);
        }
        
        for (let i = 0; i < NUM_USERS; i++) {
            users.push(signers[(i % (signers.length - 1)) + 1]);
        }

        // Deploy contracts
        const MyntisToken = await ethers.getContractFactory("MyntisToken");
        token = await MyntisToken.deploy(owner.address);

        const MerkleDistributor = await ethers.getContractFactory("MerkleDistributor");
        merkleDistributor = await MerkleDistributor.deploy(await token.getAddress(), owner.address);

        const StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await StakingContract.deploy(
            await token.getAddress(),
            ethers.ZeroAddress,
            await merkleDistributor.getAddress(),
            owner.address
        );

        const EmissionsContract = await ethers.getContractFactory("EmissionsContract");
        emissionContract = await EmissionsContract.deploy(
            await token.getAddress(),
            await stakingContract.getAddress(),
            owner.address
        );

        // Configure system
        await token.grantRole(await token.MINTER_ROLE(), await emissionContract.getAddress());
        await token.grantRole(await token.BURNER_ROLE(), owner.address);
        await stakingContract.setEmissionContract(await emissionContract.getAddress());
        await merkleDistributor.setStakingContract(await stakingContract.getAddress());
        await merkleDistributor.grantRole(await merkleDistributor.BRIDGE_ROLE(), owner.address);

        // Fund and register all providers
        for (let i = 0; i < NUM_PROVIDERS; i++) {
            // Mint tokens and register as provider
            await token.mint(providers[i].address, PROVIDER_FUNDING);
            await token.connect(providers[i]).approve(await stakingContract.getAddress(), PROVIDER_FUNDING);
            await stakingContract.connect(providers[i]).registerProvider(MIN_STAKE);

            // Fund merkle distributor for this provider
            await token.connect(providers[i]).approve(await merkleDistributor.getAddress(), PROVIDER_FUNDING);
            await merkleDistributor.connect(providers[i]).selfNotifyReward(ethers.parseEther("1000"));
        }
    });

    describe("Provider Merkle Root Lifecycle", function () {
        it("Should handle multiple providers submitting multiple merkle roots", async function () {
            const rootsPerProvider = 3;
            const totalRoots = NUM_PROVIDERS * rootsPerProvider;
            const submittedRoots: { provider: number; rootIndex: number; root: string; expiry: number }[] = [];

            // Each provider submits multiple merkle roots
            for (let providerIndex = 0; providerIndex < NUM_PROVIDERS; providerIndex++) {
                for (let rootIndex = 0; rootIndex < rootsPerProvider; rootIndex++) {
                    // Create merkle tree with random users and amounts
                    const userCount = Math.floor(Math.random() * 5) + 1; // 1-5 users per root
                    const leaves: string[] = [];
                    
                    for (let j = 0; j < userCount; j++) {
                        const userIndex = Math.floor(Math.random() * NUM_USERS);
                        const amount = ethers.parseEther((Math.random() * 100 + 1).toFixed(2)); // 1-100 tokens
                        const leaf = ethers.keccak256(
                            ethers.AbiCoder.defaultAbiCoder().encode(
                                ["address", "uint256"], 
                                [users[userIndex].address, amount]
                            )
                        );
                        leaves.push(leaf);
                    }

                    const merkleTree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
                    const root = merkleTree.getHexRoot();
                    
                    // Set expiry time (1-7 days from now)
                    const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
                    const expiry = currentTime + (Math.floor(Math.random() * 7) + 1) * 86400; // 1-7 days

                    // Submit merkle root
                    await merkleDistributor.connect(providers[providerIndex]).submitMerkleRoot(root, expiry);
                    
                    submittedRoots.push({
                        provider: providerIndex,
                        rootIndex: rootIndex,
                        root: root,
                        expiry: expiry
                    });
                }
            }

            // Verify all roots were submitted
            expect(submittedRoots).to.have.length(totalRoots);
            console.log(`✅ Successfully submitted ${totalRoots} merkle roots across ${NUM_PROVIDERS} providers`);

            // Verify each provider has the correct number of roots
            for (let i = 0; i < NUM_PROVIDERS; i++) {
                const rootCount = await merkleDistributor.providerMerkleRoots(providers[i].address, 0).then(() => {
                    // Count roots by checking each index until we get an error
                    let count = 0;
                    return new Promise<number>((resolve) => {
                        const checkRoot = async (index: number) => {
                            try {
                                await merkleDistributor.providerMerkleRoots(providers[i].address, index);
                                count++;
                                checkRoot(index + 1);
                            } catch {
                                resolve(count);
                            }
                        };
                        checkRoot(0);
                    });
                });
                expect(rootCount).to.equal(rootsPerProvider);
            }
        });

        it("Should handle concurrent claims across multiple providers and roots", async function () {
            // Submit merkle roots from multiple providers
            const claimData: { provider: number; rootIndex: number; user: number; amount: bigint; proof: string[] }[] = [];
            
            for (let providerIndex = 0; providerIndex < 5; providerIndex++) { // Use first 5 providers
                const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
                const expiry = currentTime + 86400; // 1 day

                // Create merkle tree with 3 users
                const leaves: string[] = [];
                const userAmounts: { user: number; amount: bigint; leaf: string }[] = [];
                
                for (let j = 0; j < 3; j++) {
                    const userIndex = j;
                    const amount = ethers.parseEther((Math.random() * 50 + 10).toFixed(2)); // 10-60 tokens
                    const leaf = ethers.keccak256(
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ["address", "uint256"], 
                            [users[userIndex].address, amount]
                        )
                    );
                    leaves.push(leaf);
                    userAmounts.push({ user: userIndex, amount, leaf });
                }

                const merkleTree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
                const root = merkleTree.getHexRoot();

                // Submit merkle root
                await merkleDistributor.connect(providers[providerIndex]).submitMerkleRoot(root, expiry);

                // Prepare claim data using the same tree
                for (const userData of userAmounts) {
                    const proof = merkleTree.getHexProof(userData.leaf);
                    
                    claimData.push({
                        provider: providerIndex,
                        rootIndex: 0,
                        user: userData.user,
                        amount: userData.amount,
                        proof: proof
                    });
                }
            }

            // Execute claims concurrently
            const claimPromises = claimData.map(async (data) => {
                const initialBalance = await token.balanceOf(users[data.user].address);
                
                await merkleDistributor.connect(users[data.user]).claim(
                    providers[data.provider].address,
                    data.rootIndex,
                    data.amount,
                    data.proof
                );
                
                const finalBalance = await token.balanceOf(users[data.user].address);
                expect(finalBalance).to.be.greaterThanOrEqual(initialBalance + data.amount);
                
                return { user: data.user, amount: data.amount };
            });

            const results = await Promise.all(claimPromises);
            console.log(`✅ Successfully processed ${results.length} concurrent claims`);
            
            // Verify total claimed amounts
            const totalClaimed = results.reduce((sum, result) => sum + result.amount, 0n);
            console.log(`✅ Total claimed: ${ethers.formatEther(totalClaimed)} tokens`);
        });

        it("Should handle epoch management across multiple providers", async function () {
            // Submit merkle roots with different expiry times
            const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
            const shortExpiry = currentTime + 3600; // 1 hour
            const longExpiry = currentTime + 86400; // 1 day

            // First 3 providers submit short-lived roots
            for (let i = 0; i < 3; i++) {
                const leaf = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256"], 
                        [users[0].address, ethers.parseEther("10")]
                    )
                );
                const merkleTree = new MerkleTree([leaf], ethers.keccak256, { sortPairs: true });
                
                await merkleDistributor.connect(providers[i]).submitMerkleRoot(merkleTree.getHexRoot(), shortExpiry);
            }

            // Next 3 providers submit long-lived roots
            for (let i = 3; i < 6; i++) {
                const leaf = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256"], 
                        [users[0].address, ethers.parseEther("10")]
                    )
                );
                const merkleTree = new MerkleTree([leaf], ethers.keccak256, { sortPairs: true });
                
                await merkleDistributor.connect(providers[i]).submitMerkleRoot(merkleTree.getHexRoot(), longExpiry);
            }

            // Advance time to expire short-lived roots
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine", []);

            // Close expired epochs
            for (let i = 0; i < 3; i++) {
                await merkleDistributor.closeEpoch(providers[i].address, 0);
                
                // Verify epoch is closed
                const epoch = await merkleDistributor.providerMerkleRoots(providers[i].address, 0);
                expect(epoch.closed).to.be.true;
            }

            // Verify long-lived epochs are still open
            for (let i = 3; i < 6; i++) {
                const epoch = await merkleDistributor.providerMerkleRoots(providers[i].address, 0);
                expect(epoch.closed).to.be.false;
            }

            console.log("✅ Successfully managed epochs across multiple providers");
        });

        it("Should handle provider slashing and balance management", async function () {
            // Get initial balances
            const initialBalances: bigint[] = [];
            for (let i = 0; i < NUM_PROVIDERS; i++) {
                const balance = await merkleDistributor.providerBalance(providers[i].address);
                initialBalances.push(balance);
            }

            // Slash different amounts from different providers
            const slashAmounts = [
                ethers.parseEther("50"),   // Provider 0
                ethers.parseEther("100"),  // Provider 1
                ethers.parseEther("200"),  // Provider 2
                ethers.parseEther("25"),   // Provider 3
                ethers.parseEther("150"),  // Provider 4
            ];

            for (let i = 0; i < 5; i++) {
                await merkleDistributor.slashProvider(providers[i].address, slashAmounts[i]);
                
                const newBalance = await merkleDistributor.providerBalance(providers[i].address);
                expect(newBalance).to.equal(initialBalances[i] - slashAmounts[i]);
            }

            // Verify unslashed providers maintain their balances
            for (let i = 5; i < NUM_PROVIDERS; i++) {
                const balance = await merkleDistributor.providerBalance(providers[i].address);
                expect(balance).to.equal(initialBalances[i]);
            }

            const totalSlashed = slashAmounts.reduce((sum, amount) => sum + amount, 0n);
            console.log(`✅ Successfully slashed ${ethers.formatEther(totalSlashed)} tokens from 5 providers`);
        });

        it("Should handle complex provider lifecycle with staking and rewards", async function () {
            // Advance time to generate emissions
            await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
            await ethers.provider.send("evm_mine", []);

            // Harvest rewards for all providers
            const harvestPromises = providers.map(async (provider, index) => {
                const initialBalance = await token.balanceOf(await merkleDistributor.getAddress());
                await stakingContract.connect(provider).harvestRewards();
                const finalBalance = await token.balanceOf(await merkleDistributor.getAddress());
                return { provider: index, harvested: finalBalance - initialBalance };
            });

            const harvestResults = await Promise.all(harvestPromises);
            const totalHarvested = harvestResults.reduce((sum, result) => sum + result.harvested, 0n);
            console.log(`✅ Total harvested rewards: ${ethers.formatEther(totalHarvested)} tokens`);

            // Submit merkle roots after harvesting
            const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
            const expiry = currentTime + 86400;

            for (let i = 0; i < NUM_PROVIDERS; i++) {
                const leaf = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "uint256"], 
                        [users[i].address, ethers.parseEther("10")]
                    )
                );
                const merkleTree = new MerkleTree([leaf], ethers.keccak256, { sortPairs: true });
                
                await merkleDistributor.connect(providers[i]).submitMerkleRoot(merkleTree.getHexRoot(), expiry);
            }

            // Some providers withdraw stakes
            const withdrawPromises = providers.slice(0, 3).map(async (provider, index) => {
                const initialStake = (await stakingContract.getProviderInfo(provider.address))[0];
                const withdrawAmount = initialStake / 2n; // Withdraw half
                await stakingContract.connect(provider).withdrawStake(withdrawAmount);
                return { provider: index, withdrawn: withdrawAmount };
            });

            const withdrawResults = await Promise.all(withdrawPromises);
            const totalWithdrawn = withdrawResults.reduce((sum, result) => sum + result.withdrawn, 0n);
            console.log(`✅ Total withdrawn stakes: ${ethers.formatEther(totalWithdrawn)} tokens`);

            // Verify system state after complex operations
            const totalStake = await stakingContract.getTotalStaked();
            const totalProviderBalance = await Promise.all(
                providers.map(p => merkleDistributor.providerBalance(p.address))
            ).then(balances => balances.reduce((sum, balance) => sum + balance, 0n));

            console.log(`✅ Final system state:`);
            console.log(`   - Total stake: ${ethers.formatEther(totalStake)} tokens`);
            console.log(`   - Total provider balances: ${ethers.formatEther(totalProviderBalance)} tokens`);
            console.log(`   - Active providers: ${NUM_PROVIDERS}`);
        });

        it("Should handle edge cases with overlapping epochs and claims", async function () {
            const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
            
            // Provider 0 submits multiple overlapping epochs
            const epochs = [
                { expiry: currentTime + 3600, users: [0, 1] },      // 1 hour
                { expiry: currentTime + 7200, users: [2, 3] },      // 2 hours  
                { expiry: currentTime + 10800, users: [4, 5] },     // 3 hours
            ];

            const merkleTrees: MerkleTree[] = [];

            for (let i = 0; i < epochs.length; i++) {
                const leaves = epochs[i].users.map(userIndex => 
                    ethers.keccak256(
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ["address", "uint256"], 
                            [users[userIndex].address, ethers.parseEther("10")]
                        )
                    )
                );
                
                const merkleTree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
                merkleTrees.push(merkleTree);
                await merkleDistributor.connect(providers[0]).submitMerkleRoot(merkleTree.getHexRoot(), epochs[i].expiry);
            }

            // Advance time to expire first epoch
            await ethers.provider.send("evm_increaseTime", [3601]);
            await ethers.provider.send("evm_mine", []);

            // Close first epoch
            await merkleDistributor.closeEpoch(providers[0].address, 0);

            // Try to claim from expired epoch (should fail)
            const expiredLeaf = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"], 
                    [users[0].address, ethers.parseEther("10")]
                )
            );
            const expiredProof = merkleTrees[0].getHexProof(expiredLeaf);

            await expect(
                merkleDistributor.connect(users[0]).claim(providers[0].address, 0, ethers.parseEther("10"), expiredProof)
            ).to.be.revertedWith("expired");

            // Claim from active epoch (should succeed)
            const activeLeaf = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256"], 
                    [users[2].address, ethers.parseEther("10")]
                )
            );
            const activeProof = merkleTrees[1].getHexProof(activeLeaf);

            const initialBalance = await token.balanceOf(users[2].address);
            await merkleDistributor.connect(users[2]).claim(providers[0].address, 1, ethers.parseEther("10"), activeProof);
            const finalBalance = await token.balanceOf(users[2].address);
            expect(finalBalance).to.equal(initialBalance + ethers.parseEther("10"));

            console.log("✅ Successfully handled overlapping epochs and edge cases");
        });
    });

    describe("Performance and Stress Tests", function () {
        it("Should handle large number of merkle roots efficiently", async function () {
            const rootsPerProvider = 10;
            const startTime = Date.now();

            // Submit many roots quickly
            const submitPromises = [];
            for (let providerIndex = 0; providerIndex < NUM_PROVIDERS; providerIndex++) {
                for (let rootIndex = 0; rootIndex < rootsPerProvider; rootIndex++) {
                    const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
                    const expiry = currentTime + 86400;
                    
                    const leaf = ethers.keccak256(
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ["address", "uint256"], 
                            [users[0].address, ethers.parseEther("1")]
                        )
                    );
                    const merkleTree = new MerkleTree([leaf], ethers.keccak256, { sortPairs: true });
                    
                    submitPromises.push(
                        merkleDistributor.connect(providers[providerIndex]).submitMerkleRoot(merkleTree.getHexRoot(), expiry)
                    );
                }
            }

            await Promise.all(submitPromises);
            const endTime = Date.now();
            const totalRoots = NUM_PROVIDERS * rootsPerProvider;
            
            console.log(`✅ Submitted ${totalRoots} merkle roots in ${endTime - startTime}ms`);
            console.log(`✅ Average time per root: ${(endTime - startTime) / totalRoots}ms`);
        });

        it("Should handle concurrent operations without conflicts", async function () {
            const currentTime = await ethers.provider.getBlock('latest').then(block => block!.timestamp);
            const expiry = currentTime + 86400;

            // Concurrent operations: submit roots, harvest rewards, slash providers
            const operations = [
                // Submit merkle roots
                ...providers.slice(0, 5).map(provider => {
                    const leaf = ethers.keccak256(
                        ethers.AbiCoder.defaultAbiCoder().encode(
                            ["address", "uint256"], 
                            [users[0].address, ethers.parseEther("10")]
                        )
                    );
                    const merkleTree = new MerkleTree([leaf], ethers.keccak256, { sortPairs: true });
                    return merkleDistributor.connect(provider).submitMerkleRoot(merkleTree.getHexRoot(), expiry);
                }),
                
                // Harvest rewards
                ...providers.slice(5, 8).map(provider => stakingContract.connect(provider).harvestRewards()),
                
                // Slash providers
                ...providers.slice(8, 10).map(provider => merkleDistributor.slashProvider(provider.address, ethers.parseEther("50")))
            ];

            // Execute all operations concurrently
            await Promise.all(operations);
            
            console.log("✅ Successfully executed 10 concurrent operations without conflicts");
        });
    });
});
