# Frontend validation record

This is worker-produced evidence, not an independent verifier or a security audit. The file-integrity verifier does not establish frontend behavior. Publication, named-site/CID checks and any funded wallet transaction remain outside this run.

## Result

| Area | Outcome |
| --- | --- |
| TypeScript | Passed (`npm run build` runs `tsc --noEmit` first) |
| Production build | Passed; relative Vite export and generated manifest |
| ABI binding | All six ABIs match canonical Keccak hashes at deployed commit `5a2c74702c5b46634f19da467ba344ac814ff69b` |
| Export integrity | Exact handoff identifiers/contract set/pool key/network/add-chain; every other file SHA-256 inventoried; no recursive manifest hash |
| Unit / DOM / static paths | `npm test`: 9 passed, 0 failed, including 19 mocked wallet transactions; no broadcast |
| Live RPC reads | Both configured endpoints returned chain 1, code at all six contracts, correct Above wiring, one registry asset and four periods |
| Live quote | `quoteExactInputSingle` succeeded by `eth_call` on both configured endpoints using the attested pool key |
| Local HTTP preview | The browser suite serves `dist/` over loopback HTTP under a gateway-style `/ipfs/fixture/` subpath |
| Rendered browser | `npm run test:browser` (Playwright 1.56.1, Chromium 141 headless): 6 of 6 checks passed, mock wallet/RPC only |
| Pinned taste@1 | `taste.mjs` at 320/390/1440 on the entry page: 16 of 16 checks passed |
| Source contrast | Eight declared token pairs meet 4.5:1; not a rendered contrast measurement |
| Funded mainnet / full SPEC §7 fork | Not performed; no transactions broadcast; PimdMarkets2 does not exist in this handoff |

Machine-readable evidence: `live-rpc.json`, `browser-report.json`, `taste-report.json`, `design-check.json` and `checks.json`. The browser/probe reports deliberately retain the outcome rather than shipping internal process arguments or environment paths.

## Interaction coverage

`web/tests/domain.test.ts` verifies strict decimal parsing (no silent precision rounding), fees inside the lock, the approved Above Vika/Bob example to four decimals, per-U to per-token conversion, exact router commands/actions and both the five-field and extended six-field encodings with unchanged hook/currency ordering.

`web/tests/interaction.test.tsx` mounts the actual React source with wagmi, viem, query state and a deterministic EIP-1193/RPC fixture. It exercises:

- Disconnected controls; zero RPC calls before connection; wallet dialog; initial wrong chain; error 4902 → exact add-chain parameters → successful switch.
- Yes limit buy, No sell and USDC-sized No market buy; locks and exact quantities; above-balance guard.
- Explicit USDC approval, deposit and withdrawal; receipt-driven balance refresh, and a confirmed receipt whose follow-up reads fail reporting “Balance refresh failed” instead of “Balances refreshed”.
- Market-board rows showing each market's Yes and No best bid/ask, with “no quote” for an empty side.
- Split, merge, Match, cancellation; refusal in the wallet and simulation reverts with no new send.
- Ended-market settlement and claim; settled trading disabled.
- Live-shaped quoter simulation, ERC-20 approval to the configured Permit2, Permit2 approval to the configured Universal Router, `execute` arguments and zero native value for this ERC-20 pair.
- Quote invalidation after editing slippage; StartOracle request; unavailable Up/Down and noninteractive v1 pages.
- Wrong-network write gating, rejected chain switching, account changes, role-gated settings, rate-cap validation and market creation.

All account balances, orders, receipts and wallet submissions in these tests are explicitly mocks from `web/tests/mock-chain.ts`. Those fixtures are not bundled into `dist/`. DOM tests validate component behavior and calldata, **not layout, rendering, browser compatibility or real EVM execution**.

`web/tests/static.test.ts` resolves all HTML resource and manifest paths against a gateway-style mount, checks the exact file inventory and bytes against SHA-256 hashes, and loads every ABI array. This is a filesystem-backed URL-resolution test, not an HTTP or browser check. A separate loopback HTTP attempt failed in the runtime with `502 upstream failure` before the server received a request.

`web/tests/browser.mjs` runs against the production export under a gateway-style subpath. It covers all six routes at 320/390/1440, the first-screen action at 390, local resource errors, external requests before Connect, native dialog Escape behavior, wallet discovery/switch/order/receipt, the balance guard, phone wallet links and screenshots. With the mock wallet connected at 390×844 it also checks board prices, the header height, that the order button is fully on the first screen, and no sideways scroll at 320. In this run all 6 checks passed (`browser-report.json`). The connected header measured 121px and the order button ended at 838.6px.

## Live read evidence

`web/scripts/live-check.mjs` uses only the export's configuration and ABI files. It checks both public RPCs and simulates one 1-IMD quote using the configured quoter. The captured quote was approximately 388,781.173762100528628734 pIMD per 1 IMD at the recorded time; this is historical validation output, not a promised or hardcoded UI price.

At the recorded time `marketCount()` was zero. The frontend's empty-market state is therefore intentional. It does not create markets for the admin or fabricate a demonstration ladder. Both endpoints reported the deployed initial fee settings K=0.05 and Km=0.01. Contract-code checks establish nonempty code and the named wiring, not full runtime-bytecode equivalence or a security audit.

## Better Interface review

The pinned workflow, six domain cores, relevant dialog/form/responsive guidance, documentation guide, wallet guide, Ethereum UX guide and design-critic thresholds were read and applied during implementation. The following is the consolidated source/DOM review. The rendered checks listed in Result were run separately.

| Domain | Coverage | Findings corrected / decisions | Remaining limitation |
| --- | --- | --- | --- |
| Accessibility | Native form controls, explicit labels, skip/main landmarks, native dialog, named buttons, live regions, focus CSS, reduced-motion guard | `web/src/ui.tsx:11`: dialog uses native modal semantics and restores focus; `web/src/styles.css:812`: skip link; invalid order/balance text remains adjacent to the controls | No real keyboard traversal, screen reader, focus-ring measurement, automated browser accessibility audit or 200% zoom check |
| Layout | Grid ordering, breakpoints, flexible widths, long-value wrapping, mobile header rules | `web/src/styles.css:905`: ticket placed before board on small screens. `web/src/Above.tsx:611`: expiry moved below the main action into disclosure to reduce entry-screen height. `web/src/styles.css:1066`: narrow navigation becomes a three-column grid | Overflow/overlap at 320/390/1440 and the 390 first screen were measured (Result). RTL/pseudo-localization remain unverified |
| Writing | Labels mapped to actual ABI calls, empty/error descriptions, review consequences and units | Unavailable PimdMarkets2 and prohibited v1 calls are stated explicitly. “Review buy/sell”, “Record start price”, “Withdraw oracle credit” name the actual actions; estimates and actual chain data are distinguished | Copy is English only; no localization check |
| Typography | One scale, three weights, system/mono families, full addresses, numeric units | `web/src/styles.css:1`: six sizes; inputs at 16px; no tracked all-caps kicker. `web/src/domain.ts:113`: per-U threshold conversion avoids assuming U=1 | Actual fallback face, wrapping, glyph overlaps and resized text unverified |
| Colors | Semantic aliases, textual status cues, declared-pair computation | `web/scripts/design-check.mjs`: eight source pairs pass; outcomes carry words/arrows, not color alone. Light-only theme is explicit | No rendered background/opacity measurement or forced-colors observation |
| UI | Structural borders, dialog-only shadow, 44px primary controls, explicit hover/pressed/focus/disabled states, per-action pending labels | `web/src/styles.css:868`: motion only with no-preference; no `transition: all`. `web/src/context.tsx:363`: write lock lasts through receipt/refetch; cancellations/replacements do not masquerade as success | Native popup/scroll/safe-area behavior, actual phone deep links and Coinbase passkeys untested |

Additional corrected functional findings:

1. **Old-version asset filtering:** `web/src/context.tsx:217` and `web/src/Above.tsx:39`. Filtering solely by a token's latest version hid older markets. Market metadata now carries the token of its pinned version and filters by that token. Threshold conversion retains U and token decimals.
2. **Quote races:** `web/src/Token.tsx`. Quotes now bind to input amount, currency, account, slippage and age, with input/network-change invalidation. A response from an obsolete slippage request cannot enable the current swap.
3. **Replacement reporting:** `web/src/context.tsx`. Receipt replacement reasons other than repricing now produce a replacement/cancellation message and explorer link instead of reporting the original action as confirmed.
4. **Precision and limits:** `web/src/domain.ts` and `web/src/Above.tsx`. Amount parsing rejects excess decimals instead of allowing rounding. Fee estimates honor integer rounding inside the lock. Limit expiry retains the exact five-minute contract minimum; the UI explains inclusion/signing delay instead of inventing a new minimum.
5. **Missing-wallet guidance:** `web/src/wallet.tsx`. The generic fallback gives an install-or-Coinbase instruction when no provider exists. Named EIP-6963 providers remain available on a phone even if they do not set `window.ethereum`.

## Revision: reviewer findings

1. **Board prices (high), fixed.** `web/src/context.tsx` `useBoardQuotes` reads `best(id, yes, buy)` and the head order's price for every open market on the board. `web/src/Above.tsx` `MarketRow` shows “Yes bid … · ask …” and “No bid … · ask …” in USDC per share, with “no quote” for an empty side and a separate loading/error state with “Reload prices”. Row content and sort order are unchanged. Settled rows show their result only.
2. **Phone header (medium), fixed.** `web/src/styles.css` 360–760px navigation padding goes from 7px to 5px. Connected at 390×844: header 121px, order button bottom 838.6px (asserted in `browser.mjs`).
3. **Refresh claim (medium), fixed.** `web/src/context.tsx` refetches with `throwOnError`. The status stays confirmed, and the message only says “Balances refreshed.” when every refetch succeeded. Otherwise it says the refresh failed and balances may be out of date. Covered by the DOM test via the mock's `failReadsAfterSend`.
4. **Unit tracking (low), fixed.** `.position-values dd small` has `letter-spacing: normal`; computed `normal` at 320 and 1440.

Board prices are the head of each book side as stored on chain, the same source as the Order book section. An expired head is shown as-is, as it is there.

## Requirement boundaries

- Root `DESIGN.md` is outside the overriding write allowlist; the requested design record is in `docs/DESIGN.md`.
- PimdMarkets2/Up-Down is a documented limitation of the deployed commit and handoff. No contract changes or redeployments are authorized here.
- The approved workflow forbids every v1 call. The Old contract page explains why it has no reads, Cancel or Withdraw controls.
- There are no unset owner configuration values to invent. The on-chain role holders get the available admin controls.
- The full contract fork suite and Up/Down fee examples cannot be claimed from these frontend tests. Above's published worked example is tested. No receipt from a real wallet, oracle proof, bond dispute, transfer, swap or claim was produced.
- A final domain/CID is supplied after delivery. The relative Open Graph URL is pending the publisher's naming decision; it references a complete local PNG.
- The write scope, ABI binding and byte inventory are checked independently of this behavior report. Source delivery does not imply publication checks have run.
