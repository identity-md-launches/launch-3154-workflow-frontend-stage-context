import { useEffect, useState, useRef } from "react";
import { useAccount } from "wagmi";
import { useRuntime, useLaunch } from "./context";
import { Wallet } from "./wallet";
import { Above } from "./Above";
import { Token } from "./Token";
import { Tools } from "./Tools";
import { AddressText, Notice } from "./ui";
export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "above");
  const launch = useLaunch(),
    r = useRuntime(),
    account = useAccount(),
    main = useRef<HTMLElement>(null);
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || "above");
      window.scrollTo(0, 0);
      requestAnimationFrame(() => main.current?.focus());
    };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  const pages = [
    ["above", "Above"],
    ["up-down", "Up/Down"],
    ["token", "pIMD"],
    ["tools", "Tools"],
    ["old", "Old contract"],
    ["docs", "Docs"],
  ];
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a href="#above" className="brand" aria-label="(p)IMD home">
          <img src="./favicon.svg" alt="" width="34" height="34" />
          <span>(p)IMD</span>
        </a>
        <nav aria-label="Primary">
          {pages.map(([id, name]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={route === id ? "page" : undefined}
            >
              {name}
            </a>
          ))}
        </nav>
        <div className="wallet-control">
          <Wallet />
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}>
        {route === "above" ? (
          <Above launch={launch} />
        ) : route === "token" ? (
          <Token launch={launch} />
        ) : route === "tools" ? (
          <Tools launch={launch} />
        ) : route === "up-down" ? (
          <>
            <div className="page-heading">
              <div>
                <h1>
                  Up/Down markets<span className="heading-dot">.</span>
                </h1>
                <p>Availability for this deployment.</p>
              </div>
            </div>
            <section className="section prose">
              <h2>Up/Down is not deployed</h2>
              <p>
                Up/Down trading, collateral deposits and market activation are
                unavailable for this launch. Its Up/Down market contract has not
                been deployed.
              </p>
              <p>
                The registry and start-price oracle are deployed. Their
                available controls are in Tools.
              </p>
              <a className="button" href="#above">
                Trade Above markets
              </a>
              <a className="button" href="#tools">
                Open oracle tools
              </a>
            </section>
          </>
        ) : route === "old" ? (
          <>
            <div className="page-heading">
              <div>
                <h1>
                  Old contract<span className="heading-dot">.</span>
                </h1>
                <p>Version 1 remains separate.</p>
              </div>
            </div>
            <section className="section prose">
              <h2>No v1 interaction</h2>
              <p>
                Version 1 is not connected to this site. Its balances,
                cancellations and withdrawals are unavailable here.
              </p>
              <p>
                Funds remain in their original contracts. This launch does not
                change or migrate v1 contracts or their token.
              </p>
              <a className="button" href="#docs">
                View this launch’s contracts
              </a>
            </section>
          </>
        ) : route === "docs" ? (
          <Docs />
        ) : (
          <section className="section">
            <h1>Page not found</h1>
            <a href="#above">Return to Above markets</a>
          </section>
        )}
      </main>
      <footer>
        <a className="brand" href="#above">
          (p)IMD
        </a>
        <p>On-chain prediction markets · Ethereum</p>
        <a href="#docs">Rules & contracts ↗</a>
      </footer>
    </>
  );
}
function Docs() {
  const r = useRuntime();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Rules & contracts<span className="heading-dot">.</span>
          </h1>
          <p>What this deployment can do.</p>
        </div>
      </div>
      <div className="docs-grid">
        <article className="prose">
          <h2>Above markets</h2>
          <p>
            Each threshold and end date is its own market. A pair of one Yes and
            one No share is backed by exactly 1 USDC. Shares and USDC have six
            decimals. Prices range from 0.0001 to 0.9999 USDC in steps of
            0.0001.
          </p>
          <p>
            Yes wins if the boundary close is above the threshold; No wins if
            below. The winner redeems 1 USDC and the loser zero. A tie, or no
            close three days after the end, pays 0.5 USDC per share. A
            finalizable proposal is used before a market is voided.
          </p>
          <p>
            The threshold and close use USD per unitsPerShare (U), at 18
            decimals. For version 1, U is 1 IMD. A version with U = 10,000
            tokens uses the price of all 10,000 tokens.
          </p>
          <h2>Orders and fees</h2>
          <p>
            Buy orders lock exactly price × shares with fees inside. Sell orders
            lock shares. Minimum notional is 1 USDC. Limit orders expire at
            least five minutes ahead at execution; allow time for wallet
            signing. Market orders return any unfilled rest in the same
            transaction.
          </p>
          <p>
            Fee = k × (1 − q) of the amount, with actual fill price q clamped to
            0.01–0.99. Initial taker K = 0.05 and maker Km = 0.01; live rates
            are read on chain. The admin can set K up to 0.10 and Km up to 0.05
            for later fills. No rebate. All market fees go to the immutable
            owner.
          </p>
          <p>
            Cancel, expiry, split, merge and claim have no market fee. Network
            gas still applies. The gap between the taker’s limit and actual fill
            goes to the transaction sender. A closing order’s unspent lock
            returns to its owner. Up to 64 fills occur per transaction and 1,024
            per order.
          </p>
          <Notice>
            Orders can fill after the end until someone settles the market, even
            when the close is known. Cancel orders or settle when eligible.
          </Notice>
          <h2>Worked example</h2>
          <p>
            Vika buys 10 Yes at 0.4, locking 4 USDC. Bob buys No with 6 USDC and
            worst price 0.62. Bob receives 9.8 No, paying 0.1200 fee. Vika
            receives 9.8 Yes, pays 3.9437 including 0.0237 fee, and gets her
            0.0563 rest back. The owner receives 0.1437 USDC. At threshold 3,
            close 3.01 pays Vika 9.8 USDC; close 3 pays 4.9 each.
          </p>
          <h2>Tokenomics</h2>
          <p>
            (p)IMD, symbol pIMD: 1,000,000,000 tokens, 18 decimals. At launch:
            35% pool, 10% swarm and 55% owner. The stated post-launch allocation
            is 5% kept by the owner and 50% transferred by the owner to the burn
            address 0x000000000000000000000000000000000000dEaD. This transfer is
            the owner’s responsibility and is not asserted as completed here.
          </p>
          <p>
            The pIMD/IMD pool has fee 12500 (1.25%), tick spacing 60, and
            opening market cap 2,500 IMD. The token has no owner, mint, burn
            function, fee, pause or upgrade.
          </p>
          <h2>Available scope</h2>
          <p>
            PimdMarkets2 is absent from the deployed source and handoff. Up/Down
            trading and its activation flow are unavailable. v1 is never called.
            Oracle tools operate only against this launch’s BoundaryOracle and
            StartOracle. Callbacks are reserved for the contracts that invoke
            them.
          </p>
          <h2>Wallet and privacy</h2>
          <p>
            The site is static. Wallets sign and broadcast their own
            transactions. There is no app backend, relay, analytics, remote font
            or third-party script before Connect. Account data stays in memory
            and is cleared on reload. Public RPC providers receive read
            requests; your selected wallet provider is the fallback on the
            correct chain.
          </p>
          <p>
            Every write is simulated before review and again before signing. RPC
            checks establish chain ID, nonempty contract code and the Above
            registry/oracle bindings. ABI hashes bind to the pinned source
            exports; these checks are not a bytecode audit.
          </p>
          <p>
            No external USD price feed is configured. Oracle prices are USD per
            U at a boundary, not live wallet valuations. The explorer links
            below leave this site.
          </p>
        </article>
        <aside className="contract-list">
          <h2>This deployment</h2>
          {r.deployment.contracts.map((c) => (
            <div key={c.name} className="contract-entry">
              <h3>{c.name}</h3>
              <AddressText address={c.address} />
              <a href={`./${c.abiPath}`}>View verified ABI JSON ↗</a>
            </div>
          ))}
          <h3>Source commit</h3>
          <code>{r.deployment.sourceCommit}</code>
          <h3>Attestation hash</h3>
          <code>{r.deployment.attestationHash}</code>
          <a className="button" href="./imd-deployment.json">
            View runtime deployment JSON
          </a>
        </aside>
      </div>
    </>
  );
}
