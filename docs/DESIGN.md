# Implemented design: (p)IMD

## Overview

This is a wallet-operated prediction-market tool. The visual approach is a quiet trading board: warm neutral canvas, dark green text and actions, compact order controls, and no promotional hero ahead of trading. The initial page names Above markets, explains USDC trading in one line, and presents the wallet control and order form. It never fills an empty board with sample prices.

The source of truth is `web/src/styles.css`, then `ui.tsx`, `wallet.tsx` and the page components. This document describes the implementation, not a rendered certification. Browser startup failed during this worker run; the mobile fold, font fallback, overlap, focus appearance and zoom behavior remain unverified in a real engine. See `docs/frontend/VALIDATION.md`.

This document is intentionally under `docs/`: the assignment's higher-priority write allowlist does not permit root `DESIGN.md`.

## Colors

The root declarations in `web/src/styles.css:1` define primitives and semantic aliases. Reuse the semantic names in components.

| Semantic token | Resolved value | Role |
| --- | --- | --- |
| `--page` | `#f5f5ef` | Warm canvas |
| `--surface` | `#ffffff` | Form, field and dialog surfaces |
| `--text` | `#202d25` | Primary text |
| `--muted` | `#59635c` | Supporting text and labels |
| `--border` | `#d4d9cf` | Structural separators and controls |
| `--accent` | `#243f30` | Primary transaction action |
| `--accent-text` | `#d8ee96` | Label on primary action |
| `--selected` | `#e9eee3` | Active navigation and neutral selection |
| `--error` / `--error-bg` | `#913d33` / `#fbe9e4` | Recoverable error text and notice |
| `--info` / `--info-bg` | `#244b73` / `#eaf0f6` | Informational notice |
| `--focus` | `#385e9d` | Two-pixel focus outline, three-pixel offset |

Outcome selections also have explicit, localized state colors: Yes uses `#34521f` on `#e8f1da`, No uses `#7f3824` on `#f7e7e0`, always with a word and arrow. Disabled controls use `#626a62` on `#eef0e9`; disabled primary actions use `#57634e` on `#dce3d5`. These are state treatments, not additional primary accents.

The interface is intentionally light-only; there is no inert theme switch or invented dark palette. Eight declared text/background token pairs were calculated by `web/scripts/design-check.mjs`, all at least 4.5:1. Examples: primary text/canvas 13.11:1, muted/canvas 5.70:1, primary-action label/fill 9.07:1. These are mathematical source-token results, not observed rendered contrast.

## Typography

The local system stack is `Arial, Helvetica, sans-serif`; addresses and hashes use `ui-monospace, SFMono-Regular, Consolas, monospace`. No font file or third-party font request is required. Actual fallback face availability is unverified.

| Token | Size at the 16px root | Use |
| --- | --- | --- |
| `--sm` | 13px | Fine labels, compact mobile navigation, estimates |
| `--label` | 14px | Controls and supporting text |
| `--body` | 16px | Body, fields and third-level headings |
| `--subhead` | 20px | Section headings and brand |
| `--title` | 28px | Mobile page heading and balance numerals |
| `--display` | 36px | Desktop page heading |

Authored weights are 400, 600 and 700. Page headings and branding use 700; section headings and buttons use 600. Body line height is 1.5, long prose 1.65 and headings 1.2. Only display headings and balance numerals have negative tracking; the small USDC unit beside a balance resets to normal tracking. Prose is limited to 70ch. Inputs remain 16px on mobile. Numeric displays use tabular numerals. Full addresses, hashes and numeric balances wrap rather than being clipped. The wallet button uses a short address, with the full checksummed address and copy/explorer actions in its dialog. A selected market's full label and timestamp are also available in its details and transaction review.

## Layout

`main` is limited to 1280px with 40px desktop padding. The header is limited to 1440px. Shared spacing uses 8/12/16/20/24/28/32/40/48/64px values according to grouping; section gaps are larger than control gaps.

- Above uses `.market-layout`: a flexible market board and a 388px order panel, separated by 48px. At 1100px the panel is 360px and the gap is 28px.
- At 760px and below the order panel comes first, followed by the market board. Main padding becomes 20px. Lower two-column sections and docs become one column. The book changes from four to two columns.
- At 1100px the navigation moves to its own header row. At 360–760px its type is 13px with 5px inline padding, so all six links fit one row at 390px; below 360px it uses three columns across two rows. No horizontal navigation scroller is required.
- At 359px and below main padding and the order panel use 16px insets; form-row gaps shrink to 8px. Text containers have `min-width: 0` where appropriate, and long critical strings wrap.
- The expiry field is in a disclosure below the primary order action. Its default is 60 minutes, with the contract's five-minute execution minimum unchanged.
- Wallet/review dialogs are centered at larger widths. Below 640px they align to the bottom, use a rounded top edge, respect the bottom safe area, and scroll internally if needed.

The rendered test (`web/tests/browser.mjs`) passed at 320, 390 and 1440 with no sideways scroll. With a mock wallet connected at 390×844 the header is 121px tall and the order button ends at 838.6px, inside the first screen.

## Elevation & Depth

The page is predominantly flat. The trade panel uses a one-pixel structural border and no shadow. Lists use separators instead of a card for every row. Dialogs use a shadow (`0 20px 80px #0003`) with no border and a dimmed `#14271ab3` backdrop. Transaction notifications are fixed near the lower edge with a structural border. Their visibility persists until dismissal after completion or error.

## Shapes

Controls use 8px radii; the 24px-padded desktop trade panel and dialogs use 16px. Notices have a three-pixel leading border and an eight-pixel trailing radius. Tags use four-pixel radii; status dots are circles. Text is never hidden by the product containers. Native selects retain their platform presentation; full selected-market details can be expanded.

## Components

| Component / pattern | Source | Use and states |
| --- | --- | --- |
| `Modal` | `web/src/ui.tsx:11` | Native `dialog.showModal()`, backdrop/Escape/close button, focus restoration. Used for wallet selection and review. Real-engine focus containment is unverified. |
| `Field` | `web/src/ui.tsx:88` | Visible bound label, optional descriptive hint, native input behavior. Decimal and integer inputs choose an appropriate keyboard. |
| `Action` | `web/src/ui.tsx:107` | Shared preparation entrypoint; only the active action changes its label. All transaction controls are disabled while another write is pending. |
| `Notice`, `Empty` | `web/src/ui.tsx:146` | Persistent information/error and explicit disconnected/loading/empty market states. No sample data. |
| `AddressText` | `web/src/ui.tsx:58` | Full checksummed address, explorer link and copy state. No ENS lookup is implemented. |
| `Wallet` | `web/src/wallet.tsx:70` | EIP-6963 names/icons; generic browser fallback, mobile app rows and Coinbase Smart Wallet. Connected address dialog, disconnect, wrong-network switch and recoverable rejection. |
| Order form | `web/src/Above.tsx` | Native outcome/direction/type controls, Max, balance validation, locks and estimates, review action, expiry disclosure. No control relies only on color. |
| Market/book/order rows | `web/src/Above.tsx` | Shared aligned numeric data. Each open market row has a full-width `.row-prices` line: Yes and No best bid and ask in USDC per share, 14px tabular numerals, side names at 600 weight, “no quote” for an empty side, plus loading and error text. The token filter preserves markets pinned to old versions. Open orders retain their locks and expiry states until chain reads change. |
| Swap panel | `web/src/Token.tsx` | Quote/loading/error/expired states; one approval or swap action at a time; minimum output and rate in token units. |
| `TransactionProvider` | `web/src/context.tsx:363` | Simulation → review → signing → submitted → receipt/refetch. Persistent rejection/revert/timeout/replacement messages and explorer link. |

Hover treatments are gated by `(hover: hover)`. Motion is gated by `(prefers-reduced-motion: no-preference)` and limited to named color/border/transform transitions of 120ms, with scale 0.96 on press. No autoplay, marquee, entrance animation, infinite animation or `transition: all` is used. Forced-colors mode preserves a system-highlight focus/selection outline.

## Do's and Don'ts

- Start another page with `.page-heading` and the existing `.section`, `.content-grid` or `.prose` patterns. Keep the task ahead of explanations.
- Use `Field`, `Action` and `TransactionProvider` for writes. Keep approval, simulation and confirmation separate; do not add a direct-sign shortcut.
- Display amounts in their contract's units and retain exact integer arithmetic. Explain estimates; never substitute a static price for a failed read.
- Reuse semantic colors, the six type sizes and native controls. Keep the page heading the heaviest content heading.
- Preserve word labels for outcome, status and error states. Keep long addresses and amounts accessible in full.
- Do not add remote fonts, analytics, frames or scripts before Connect, local persistence of orders, an invented Up/Down deployment, or a call to v1.
- After any source/export change rebuild the manifest and run `npm test`, `npm run test:browser` and the taste probe.
