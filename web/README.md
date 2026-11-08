# (p)IMD frontend

A static Vite, React and TypeScript application for the deployed Ethereum launch. The application source is in `web/`, the publishable export is in root `dist/`, and validation/design records are in `docs/frontend/` and `docs/DESIGN.md`.

## Run and rebuild

Use Node.js 24 and npm with this repository's Git history available. The exact deployed commit must exist locally: `5a2c74702c5b46634f19da467ba344ac814ff69b`.

From the repository root:

```sh
npm ci --prefix web --cache test/scratch/npm-cache
npm run build --prefix web
npm run preview --prefix web -- --port 4173
```

Open the preview URL. For development, use `npm run dev --prefix web`; runtime JSON/ABIs must first be built. The Vite development middleware serves the same root `dist/imd-deployment.json` and ABI files; it adds no separate deployment map. Run the build once before starting development. Use the production preview for final wallet and integration work.

The build runs TypeScript, builds with `base: './'`, then runs `web/scripts/export.mjs`. The exporter:

1. Reads the preserved handoff and network inputs in `web/deployment/`.
2. Retrieves every ABI with `git show <deployed-commit>:docs/abi/<Contract>.json`.
3. Compares recursively key-sorted canonical Keccak-256 ABI hashes with the handoff and checks the working ABI exports are unchanged.
4. Copies the raw ABI arrays into `dist/abi/`.
5. Enumerates every final exported file except the manifest and records its lowercase SHA-256.
6. Writes `dist/imd-deployment.json` with the exact identifiers, contract set, pool key, network and add-chain parameters. It rejects the asset-count and per-file-size limit violations.

Rebuild after every source or exported-asset change. Do not edit the generated manifest or deploy addresses by hand. `npm run verify --prefix web` independently recomputes the expected manifest and fails on any mismatch.

`web/public/share.png` is a complete local 1200×630 share image. Its editable vector source is `web/public/share.svg`; regenerate with `node web/scripts/share.mjs` if needed. Font availability can affect that optional regeneration, so the committed PNG is the publishing input.

## Configuration and hosting

The browser loads `./imd-deployment.json`, then its referenced ABI JSON files, and verifies all six ABI hashes before mounting wallet controls. `web/src/config.ts` constructs the chain, public RPC clients, protocol interfaces and wallet connectors from that runtime manifest. Build-time handoff snapshots are never imported into the app. There is no independent runtime address/chain/ABI map.

USDC is obtained by walking the on-chain registry version 1 path to its terminal currency, then checking its symbol and six decimals. Asset symbols, decimals, U, roles, balances, prices, orders and fee rates are read on chain. Protocol targets for the launch-token swap come exclusively from `network.uniswapV4`; the attested `poolKey` is used without changing its hook or currency ordering.

Serve all of `dist/` as static files, preserving relative paths. Pages use hash routing (`#above`, `#up-down`, `#token`, `#tools`, `#old`, `#docs`), so no server rewrite is needed. The same export is designed for a gateway subpath or named site. The deployment domain is not supplied; Open Graph image paths remain relative until the publisher knows the final address. No publication, pinning, naming or contract redeployment is performed by this worker.

## Wallets and transactions

One header control opens a native dialog. Desktop extensions use EIP-6963 discovery with wagmi's injected fallback. Phones without a provider get MetaMask, Coinbase Wallet, Rabby and Phantom app links. Coinbase Smart Wallet uses the Coinbase connector. No relay or WalletConnect project ID is configured.

An unknown-chain switch error triggers the exact supplied `wallet_addEthereumChain` parameters, followed by another switch. Writes remain unavailable on the wrong chain. Wagmi persistent storage and automatic reconnect are disabled; app account data is held in memory. The selected wallet owns its own storage and signing implementation.

Public reads use the configured RPC URLs in order, then the connected provider on the correct chain. Initial reads verify the RPC chain, nonempty code for every deployed contract and Above's registry/oracle bindings. The client refreshes launch data every 20 seconds, selected-market data every 12 seconds, and token/oracle data every 15 seconds. Refresh and retry controls are also provided.

Each action simulates, estimates gas, shows a review, checks the account/network again, simulates again and requests the wallet signature. The pending guard lasts through the receipt and balance refetch. Replacement/cancellation, rejection, simulation failure, mined failure and success have distinct messages and an explorer link when a hash exists. A receipt timeout retains the hash and tells the visitor to check it before retrying. No backend signs, stores orders or relays transactions.

ERC-20 approvals are explicit transactions for exact amounts. Above deposits approve PimdAbove. Oracle payments approve the relevant deployed oracle; registry-path swaps approve PimdSwap2. The pIMD/IMD swap separately approves the input token to Permit2 and Permit2 to the configured Universal Router when current allowances are short. Quotes are simulations, expire after 60 seconds and are invalidated by amount, direction, account, network or slippage changes. Router commands/actions are `0x10` / `0x060c0f`, with the exact-output minimum and deadline enforced. Both the standard five-field and configured extended six-field swap tuples are supported. The supplied launch uses two ERC-20 currencies and sends zero native value.

## Pages and known deployment limits

- **Above:** assets and sorted market rows, paginated in batches of 20, including older pinned asset versions; limit/market buys and sells of Yes/No; share or USDC market-buy sizing; Max and balance guards; locks and fee/share/proceeds estimates; best orders, per-first-fill Match reward estimate, open orders and cancellations; deposit/withdraw, split/merge, settle/claim. After-end trading stays open until settlement.
- **pIMD:** live pIMD/IMD quote and swap, approvals, transfer, supply/allocation explanation and contract address.
- **Tools:** StartOracle requests, boundary proof submission, proposals/disputes/retries/finalization/timeouts/refund withdrawal, registry-path exact-output swaps and role-gated market/asset/period/rate/role controls. Oracle proofs and asset-path JSON must be supplied by the caller; the app never fabricates them.
- **Up/Down:** explicitly unavailable. The handoff and pinned source do not contain PimdMarkets2. No address, ABI or activation action is invented.
- **Old contract:** informational only. The approved workflow's prohibition on all v1 calls takes precedence over the older withdrawal-page description.
- **Docs:** settlement, fees, examples, tokenomics, deployment identifiers, ABI downloads and full checksummed addresses with copy/explorer controls.

Above prices use USDC, shares have six decimals, and thresholds are read as 18-decimal USD per U then converted for the per-token market label. A pair is one Yes plus one No backed by exactly 1 USDC. A winner redeems 1; a tie or no close after three days redeems 0.5 each. Initial K=0.05 and Km=0.01; caps remain 0.10 and 0.05. No market fee on cancel, expiry, split, merge or claim. Gas is separate. Existing orders remain live after the end until settlement. Match estimates cover the first visible crossing only, not guaranteed proceeds from all 64 potential fills.

pIMD supply is 1,000,000,000 with 18 decimals. Launch allocation is 35% pool, 10% swarm and 55% owner. The stated post-launch allocation is 5% retained by the owner and 50% transferred by that owner to `0x000000000000000000000000000000000000dEaD`. This site does not assert that transfer occurred. Pool fee 12500, tick spacing 60, opening market cap 2,500 IMD. No token owner/mint/burn function/fee/pause/upgrade was added or changed. No owner setup is required by these deployed contracts.

## Validation

Run after the build, not concurrently with it:

```sh
npm run typecheck --prefix web
npm run test --prefix web
npm run verify --prefix web
node web/scripts/design-check.mjs
node web/scripts/live-check.mjs
```

Nine tests cover amount/fee/router arithmetic, React interactions and static gateway-path/hash resolution. The unit and React DOM interaction tests use mocked RPC and EIP-1193 responses; they never broadcast. The live-check script performs read-only RPC checks and a quoter `eth_call`, writing `docs/frontend/live-rpc.json`.

Rendered tests are provided separately:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" web/node_modules/.bin/playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/test/scratch/browsers" npm run test:browser --prefix web
```

They serve the production export under a gateway-style subpath and check 320/390/1440 layouts, first-screen action, resources, wallet dialog/phone links, mocked connect/switch/order/receipt and balance guards. Screenshots/reports go only to `test/scratch/browser/`. Optional `BROWSER=firefox` or `BROWSER=webkit` selects another installed engine. The pinned design probe is also attempted as specified by the assignment.

**Worker limitation:** Chromium and the provided browser service failed during startup before rendering. Firefox could not initialize either. The runtime also returned `502 upstream failure` for local loopback HTTP requests, so static path verification uses file bytes and does not certify HTTP preview behavior. No screenshots of the app, rendered contrast/overflow measurements, actual phone wallet or passkey tests are claimed. `docs/frontend/VALIDATION.md` distinguishes passing DOM tests from unperformed browser checks. Live funded orders, approvals, swaps, oracle submissions and the full SPEC §7 mainnet-fork suite were not run. PimdMarkets2 and its examples are outside the available implementation.

## Submission scope and budget

Only `web/**`, root `dist/**` and `docs/**` are delivered. `web/.gitignore` is the only changed ignore file; its explicit path budget is 1 KiB, and it excludes dependency/cache directories at every nesting level. No node_modules, npm mirrors, dependency archives, browser runtimes or test scratch files belong in the submission. No submodule is created. The total added Git content must remain under 8 MiB.

The root `DESIGN.md` request conflicts with the higher-priority path allowlist. The implemented design record is delivered at `docs/DESIGN.md`; root configuration and deployed source remain untouched.
