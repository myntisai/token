# Forensic Migration Transfer Analysis

Generated: 2026-02-18T23:03:08.159Z

## base-sepolia

- RPC: `https://base-sepolia-rpc.publicnode.com`
- Latest block: `37843401`
- Tokens analyzed: **4**
- Tracked core addresses: **23**

### Token 0xE1eFd4598Cb371035F78dD3eb4151A7498F9dEa4 (MYNT)

- Block range: `34266198 -> 37843401`
- Total transfers: **2**
- Minted via Transfer(from=0): **10000.0** (1 events)
- Burned via Transfer(to=0/0xdead): **100.0** (1 events)
- Aggregate transfer volume: **10100.0**
- Current totalSupply: **9900.0**
- BalanceMigrated events: **0**
- BalanceMigrated recipients: **0**
- BalanceMigrated total: **0.0**
- ImmediateMinted total: **10000.0**
- EmissionsMinted total: **0.0**

### Token 0x8BEceC0fFbc93bBd94DEcaa9Bbf7b2CfDd286d55 (MYNT)

- Block range: `34494930 -> 37843401`
- Total transfers: **35**
- Minted via Transfer(from=0): **12834079.654997463214896** (34 events)
- Burned via Transfer(to=0/0xdead): **0.0** (0 events)
- Aggregate transfer volume: **12844471.103177463214896**
- Current totalSupply: **12834079.654997463214896**
- BalanceMigrated events: **34**
- BalanceMigrated recipients: **34**
- BalanceMigrated total: **12834079.654997463214896**
- ImmediateMinted total: **0.0**
- EmissionsMinted total: **0.0**

### Token 0x599016bF00eE23d531223c6285C92aa0cAC278EF (MYNT)

- Block range: `37189217 -> 37843401`
- Total transfers: **2270**
- Minted via Transfer(from=0): **23934903.348794757797289605** (805 events)
- Burned via Transfer(to=0/0xdead): **1000.0** (10 events)
- Aggregate transfer volume: **26088678.696720355343617194**
- Current totalSupply: **23933903.348794757797289605**
- BalanceMigrated events: **0**
- BalanceMigrated recipients: **0**
- BalanceMigrated total: **0.0**
- ImmediateMinted total: **22577514.967263105797289606**
- EmissionsMinted total: **1357388.381531651999999999**

### Token 0xC5aA7e0992EEDf67f5096Cb629152267cEDf2875 (MYNT)

- Block range: `37363780 -> 37843401`
- Total transfers: **19**
- Minted via Transfer(from=0): **6118.9457128361237944** (4 events)
- Burned via Transfer(to=0/0xdead): **114.0** (6 events)
- Aggregate transfer volume: **12559.8914256715237944**
- Current totalSupply: **6004.9457128361237944**
- BalanceMigrated events: **0**
- BalanceMigrated recipients: **0**
- BalanceMigrated total: **0.0**
- ImmediateMinted total: **1500.0**
- EmissionsMinted total: **4616.9457128361237944**

## base-mainnet

- RPC: `https://base-mainnet.g.alchemy.com/v2/<redacted>`
- Latest block: `42333194`
- Tokens analyzed: **2**
- Tracked core addresses: **10**

### Token 0x7629FD045E1462C9DCD580d0aF31db6D46c5AB47 (MYNT)

- Block range: `41867816 -> 42333194`
- Total transfers: **3676**
- Minted via Transfer(from=0): **24724308.693629691520180846** (1748 events)
- Burned via Transfer(to=0/0xdead): **0.0** (0 events)
- Aggregate transfer volume: **30310537.404637706335113266**
- Current totalSupply: **24724308.693629691520180846**
- BalanceMigrated events: **98**
- BalanceMigrated recipients: **92**
- BalanceMigrated total: **21943112.600276063920356146**
- ImmediateMinted total: **0.0**
- EmissionsMinted total: **2781196.0933536275998247**

### Token 0x0314e1274b9860E77d90E894D784cD24EeCbE479 (MYNT)

- Block range: `41866687 -> 42333194`
- Total transfers: **0**
- Minted via Transfer(from=0): **0.0** (0 events)
- Burned via Transfer(to=0/0xdead): **0.0** (0 events)
- Aggregate transfer volume: **0.0**
- Current totalSupply: **0.0**
- BalanceMigrated events: **0**
- BalanceMigrated recipients: **0**
- BalanceMigrated total: **0.0**
- ImmediateMinted total: **0.0**
- EmissionsMinted total: **0.0**

## Migration Findings

- Snapshot recipients: **92**
- Snapshot total: **21760243.737607178686863132 MYNT**
- Snapshot min recipient: **42511.120608909011494252 MYNT**
- Min*recipients floor: **3911023.096019629057471184 MYNT**
- Above-floor remainder: **17849220.641587549629391948 MYNT**
- Recipients in 40k-50k band: **40**

### Snapshot To Mainnet Reconciliation

- Mainnet `BalanceMigrated` total: **21943112.600276063920356146 MYNT**
- Delta vs snapshot total: **+182868.862668885233493014 MYNT**
- Recipient reconciliation: **88 exact-match**, **4 top-ups**, **0 shortfalls**, **0 missing recipients**
- All 92 snapshot recipients were migrated on mainnet.

Tx-level `BalanceMigrated` breakdown:

- `0xbef2847a5c3100c92e8b841626064c62a9a8c19cdb92580bf247baa5828c37f7` (block `41868299`, `2026-02-08T04:45:45Z`): **21760243.737607178686863132 MYNT** across **92 events / 92 recipients**.
- `0x4ec6c454dba249c6633b32f062767ab81f412b17e3be488095cf1b70a3442007` (block `41892275`, `2026-02-08T18:04:57Z`): **146088.7557077016 MYNT** across **4 events**.
- `0xebda138f7f4ef092fbd7b0c5fcc33cb4dae89d0cdf62fc8ca982a1d3207d1a91` (block `41893247`, `2026-02-08T18:37:21Z`): **36780.106961183633493014 MYNT** across **2 events**.

Top-up recipients (delta over snapshot amounts):

- `0xaCbe177685b442886c779F89132b85e05eCEf86D`: **+67859.169549194014965088 MYNT**
- `0x6255cFEC19A346A5b0Add66eF44F7C5740c12377`: **+47850.529261476019437626 MYNT**
- `0x807833243F1AAFD29e1B9acDB4D796987D0aa934`: **+46941.7932341749490903 MYNT**
- `0x43495fBcd33235D9FcD4c2c7f8cB2444E463C9b3`: **+20217.37062404025 MYNT**

`MigrationCompleted` emitted later in:

- `0x4dabbb9690fef9c860bf00e035b3a83e9b6d61537078c4c3662fde47b4fd2368` (block `42071313`, `2026-02-12T21:32:53Z`) with `totalMigrated = 23059132.387186261789306346 MYNT`.
- This is **+1116019.7869101978689502 MYNT** above `BalanceMigrated` aggregate, so `totalMigrated` includes additional accounting beyond direct holder migration mints.

### Migrated

- Holder balances via Myntis.migrateMint on Base mainnet (captured as BalanceMigrated events where present).
- One-time holder airdrop/migration snapshot from Base Sepolia holders into Base mainnet holder balances.
- Mainnet token minting allocations tracked through ImmediateMinted and EmissionsMinted events.

### Not Fully Migrated

- Legacy staking positions and per-user reward debt state.
- Legacy emissions internal state in earlier waves (unless explicitly migrated via `initializeMigration` in that wave).
- Legacy distributor epoch internals (open/closed epochs, locked claim states) outside explicit cutover handling.
- Legacy Merkle proof/nullifier state across old distributor instances.

## Evidence Files

- `deployments/forensic-migration-transfer-analysis.json`
- `deployments/forensic-mainnet-migration-reconciliation.json`
- `deployments/MIGRATION_SCOPE_DISCLOSURE.md`
- `migrations/base-sepolia-holders-snapshot-37378124.json`
