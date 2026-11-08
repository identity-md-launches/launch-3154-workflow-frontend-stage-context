import { useState, useEffect, type FormEvent } from "react";
import { useAccount } from "wagmi";
import {
  useLaunch,
  useMarkets,
  useMarketDetail,
  useBoardQuotes,
  useRuntime,
  useTx,
  useToken,
  type TxSpec,
} from "./context";
import { erc20Abi } from "./config";
import {
  amount,
  fmt,
  feePreview,
  min,
  utc,
  SHARE,
  type Market,
  errorMessage,
  marketLabel,
  previewMatch,
} from "./domain";
import { Action, Field, Notice, Empty } from "./ui";
export type LaunchState = ReturnType<typeof useLaunch>;
export function Above({ launch }: { launch: LaunchState }) {
  const r = useRuntime(),
    account = useAccount(),
    tx = useTx();
  const [limit, setLimit] = useState(20),
    [selected, setSelected] = useState(""),
    [assetFilter, setAssetFilter] = useState("all");
  const markets = useMarkets(launch.data?.marketCount, limit);
  const visible =
    markets.data?.filter(
      (m) =>
        assetFilter === "all" ||
        m.token?.toLowerCase() === assetFilter.toLowerCase(),
    ) || [];
  const market = visible.find((m) => m.id === selected) ?? visible[0];
  const detail = useMarketDetail(market);
  const quotes = useBoardQuotes(visible);
  const ready =
    !!launch.data && !launch.isError && account.chainId === r.chain.id;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Above markets<span className="heading-dot">.</span>
          </h1>
          <p>Trade the closing price with USDC.</p>
        </div>
        <div className="network-label">
          <span className={ready ? "status-dot live" : "status-dot"} />
          {ready ? `Ethereum · block ${launch.data!.block}` : "Ethereum"}
        </div>
      </div>
      {launch.isError && (
        <Notice error>
          {errorMessage(launch.error)}{" "}
          <button onClick={() => void launch.refetch()}>
            Retry connection
          </button>
        </Notice>
      )}
      {account.isConnected && account.chainId !== r.chain.id && (
        <Notice>
          Wrong network. Use “Switch to {r.chain.name}” above to load markets.
        </Notice>
      )}
      <div className="market-layout">
        <section className="market-browser">
          <div className="section-head">
            <h2>Market board</h2>
            <span className="muted">
              {launch.data
                ? `${launch.data.marketCount} markets`
                : "Awaiting connection"}
            </span>
          </div>
          <div className="field">
            <label htmlFor="asset-picker">Asset</label>
            <select
              id="asset-picker"
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
            >
              <option value="all">All registered assets</option>
              {launch.data?.assets.map((a) => (
                <option key={a.token} value={a.token}>
                  {a.symbol} · version {a.version}
                </option>
              ))}
            </select>
          </div>
          {markets.isError ? (
            <Notice error>
              {errorMessage(markets.error)}{" "}
              <button onClick={() => void markets.refetch()}>
                Reload markets
              </button>
            </Notice>
          ) : !account.isConnected ? (
            <Empty title="Find your next position">
              Connect your wallet to load the live market board.
            </Empty>
          ) : (launch.isFetching && !launch.data) ||
            (markets.isFetching && !markets.data) ? (
            <Empty title="Loading markets">
              Reading this launch’s contracts on Ethereum.
            </Empty>
          ) : visible.length === 0 ? (
            <Empty title="No markets to show">
              {launch.data?.marketCount === 0n
                ? "The market admin has not created an Above market yet."
                : "Change the asset filter or load more markets."}
            </Empty>
          ) : (
            <div className="market-rows">
              <p className="muted board-unit">
                Best Yes and No bid and ask in USDC per share. 0.4 means 40%.
              </p>
              {visible.map((m) => (
                <MarketRow
                  key={m.id}
                  market={m}
                  selected={m.id === market?.id}
                  select={() => setSelected(m.id)}
                  quotes={quotes}
                />
              ))}
            </div>
          )}
          {quotes.isError && (
            <Notice error>
              Board prices did not load. {errorMessage(quotes.error)}{" "}
              <button onClick={() => void quotes.refetch()}>
                Reload prices
              </button>
            </Notice>
          )}
          {launch.data && BigInt(limit) < launch.data.marketCount && (
            <button className="full" onClick={() => setLimit((v) => v + 20)}>
              Load 20 more markets ({markets.data?.length ?? 0} loaded)
            </button>
          )}
          <div className="rules-strip">
            <h3>One pair. One USDC.</h3>
            <p>
              A Yes share and a No share are backed by exactly 1 USDC. A winning
              share redeems 1 USDC.
            </p>
            <a href="#docs">Read settlement and fee rules ↗</a>
          </div>
        </section>
        <section className="trade-panel" aria-labelledby="trade-heading">
          <div className="section-head">
            <h2 id="trade-heading">Place an order</h2>
            <span className="label-tag">Above</span>
          </div>
          <div className="field">
            <label htmlFor="market-picker">Market</label>
            <select
              id="market-picker"
              value={market?.id ?? ""}
              disabled={!visible.length}
              onChange={(e) => setSelected(e.target.value)}
            >
              {!visible.length && (
                <option value="">
                  {account.isConnected
                    ? "No market available"
                    : "Connect to load markets"}
                </option>
              )}
              {visible.map((m) => (
                <option value={m.id} key={m.id}>
                  {marketLabel(m)} · {utc(m.end)}
                </option>
              ))}
            </select>
          </div>
          {market && (
            <p className="market-status">
              {market.outcome
                ? ["", "Yes wins", "No wins", "Tie / no close: 0.5 each"][
                    market.outcome
                  ]
                : market.end <= (launch.data?.now ?? 0n)
                  ? "Ended, result pending"
                  : "Trading open"}
              {market.outcome === 0 &&
                market.end <= (launch.data?.now ?? 0n) && (
                  <small>Orders remain live until settlement.</small>
                )}
            </p>
          )}
          <TradeForm
            market={market}
            launch={launch}
            detail={detail}
            ready={ready}
          />
        </section>
      </div>
      <div className="lower-grid">
        <Balances launch={launch} ready={ready} />
        <section className="section">
          <div className="section-head">
            <h2>Your position</h2>
            {market && <span className="muted">Version {market.version}</span>}
          </div>
          {detail.isError && (
            <Notice error>
              {errorMessage(detail.error)}{" "}
              <button onClick={() => void detail.refetch()}>
                Reload position
              </button>
            </Notice>
          )}
          <dl className="position-values">
            <div>
              <dt>Yes shares</dt>
              <dd>{fmt(detail.data?.position[0])}</dd>
            </div>
            <div>
              <dt>No shares</dt>
              <dd>{fmt(detail.data?.position[1])}</dd>
            </div>
          </dl>
          <PositionActions
            market={market}
            launch={launch}
            detail={detail}
            ready={ready}
          />
        </section>
      </div>
      <section className="section">
        <div className="section-head">
          <h2>Order book</h2>
          <button
            onClick={() => {
              void detail.refetch();
              void markets.refetch();
              void launch.refetch();
            }}
            disabled={!ready || detail.isFetching}
          >
            Refresh state
          </button>
        </div>
        <p className="muted">
          Best resting prices in USDC per share. A price of 0.40 represents 40%
          before fees.
        </p>
        <div className="book-grid">
          {["Yes bids", "Yes asks", "No bids", "No asks"].map((label, i) => (
            <div key={label}>
              <h3>{label}</h3>
              <strong>
                {detail.data?.book[i]
                  ? `${fmt(detail.data.book[i]!.price)} USDC`
                  : "No quote"}
              </strong>
              <p className="muted">
                {detail.data?.book[i]
                  ? `${fmt(detail.data.book[i]!.remaining)} shares`
                  : "No resting order loaded"}
              </p>
            </div>
          ))}
        </div>
        <MatchControl
          market={market}
          detail={detail}
          ready={ready}
          launch={launch}
        />
      </section>
      <section className="section">
        <div className="section-head">
          <h2>Your open orders</h2>
          <span className="muted">Selected market</span>
        </div>
        {!detail.data?.mine.length ? (
          <p className="muted">
            {ready
              ? "No resting orders loaded for this market."
              : "Connect to view your orders."}
          </p>
        ) : (
          <div className="orders">
            {detail.data.mine.map((o) => (
              <div className="order-row" key={String(o.id)}>
                <div>
                  <strong>
                    #{String(o.id)} · {o.buy ? "Buy" : "Sell"}{" "}
                    {o.yes ? "Yes" : "No"}
                  </strong>
                  <p>
                    {fmt(o.remaining)} shares at {fmt(o.price)} USDC
                  </p>
                  <small>
                    {o.expiry <= (launch.data?.now ?? 0n)
                      ? "Expired; lock released on cancel or matching"
                      : `Expires ${utc(o.expiry)}`}
                  </small>
                </div>
                <div>
                  <span>
                    {o.buy
                      ? `${fmt(o.lock)} USDC locked`
                      : `${fmt(o.remaining)} shares locked`}
                  </span>
                  <Action
                    disabled={!ready}
                    spec={{
                      contract: "PimdAbove",
                      fn: "cancel",
                      args: [o.id],
                      label: `Cancel order #${o.id}`,
                      summary:
                        "Cancel this resting order and return its unspent lock to your free balance. No cancellation fee.",
                    }}
                  >
                    Cancel #{String(o.id)}
                  </Action>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="footnote">
        {launch.data
          ? `State checked ${new Date(launch.data.updated).toLocaleTimeString()}. Refreshes every 20 seconds.`
          : "Balances and prices load after connection."}{" "}
        Market fees are inside the lock. Network gas is separate.
      </p>
    </>
  );
}
function MarketRow({
  market: m,
  selected,
  select,
  quotes,
}: {
  market: Market;
  selected: boolean;
  select: () => void;
  quotes: ReturnType<typeof useBoardQuotes>;
}) {
  return (
    <button
      className={`market-row ${selected ? "selected" : ""}`}
      onClick={select}
      aria-pressed={selected}
    >
      <span className="market-symbol">↑</span>
      <span>
        <strong>{marketLabel(m)}</strong>
        <small>
          Asset version {m.version} · {utc(m.end)}
        </small>
      </span>
      <span className="row-outcome">
        {["Open", "Yes wins", "No wins", "Half each"][m.outcome]}
        <span aria-hidden="true"> ↗</span>
      </span>
      {m.outcome === 0 && (
        <span className="row-prices">
          {(["Yes", "No"] as const).map((side, i) => (
            <span key={side}>
              <b className={side === "Yes" ? "yes" : "no"}>{side}</b>{" "}
              {quotes.isError
                ? "prices unavailable"
                : !quotes.data
                  ? "loading prices…"
                  : `bid ${quote(quotes.data[m.id]?.[i * 2])} · ask ${quote(quotes.data[m.id]?.[i * 2 + 1])}`}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
const quote = (p?: bigint) => (p ? fmt(p) : "no quote");
function TradeForm({
  market,
  launch,
  detail,
  ready,
}: {
  market?: Market;
  launch: LaunchState;
  detail: ReturnType<typeof useMarketDetail>;
  ready: boolean;
}) {
  const tx = useTx();
  const [yes, setYes] = useState(true),
    [buy, setBuy] = useState(true),
    [kind, setKind] = useState("limit"),
    [unit, setUnit] = useState("shares"),
    [size, setSize] = useState(""),
    [price, setPrice] = useState(""),
    [expiry, setExpiry] = useState("60"),
    [error, setError] = useState("");
  const amountMode = kind === "market" && buy && unit === "usdc";
  let p = 0n,
    n = 0n,
    preview: ReturnType<typeof feePreview> | undefined;
  try {
    p = amount(price);
    n = amount(size);
    if (launch.data)
      preview = feePreview(
        amountMode ? 0n : n,
        p,
        launch.data.taker,
        buy,
        amountMode ? n : undefined,
      );
  } catch {
    /* Incomplete input has no numeric preview. */
  }
  const balance = buy ? launch.data?.free : detail.data?.position[yes ? 0 : 1];
  const aboveBalance =
    balance !== undefined && preview && (buy ? preview.lock : n) > balance;
  const unavailable =
    !ready || !market || market.outcome !== 0 || !detail.data || detail.isError;
  function max() {
    if (balance === undefined) return;
    try {
      if (buy && !amountMode) {
        const priceUnits = amount(price);
        setSize(fmt((balance * SHARE) / priceUnits));
      } else setSize(fmt(balance));
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (unavailable)
        throw Error("Connect and select an active market first.");
      const priceUnits = amount(price),
        quantity = amount(size);
      if (priceUnits < 100n || priceUnits > 999900n || priceUnits % 100n !== 0n)
        throw Error("Price must be 0.0001 to 0.9999 USDC, in steps of 0.0001.");
      const lock = amountMode ? quantity : (quantity * priceUnits) / SHARE;
      if (lock < SHARE)
        throw Error(
          "The minimum order value is 1 USDC. Increase the amount or shares.",
        );
      if ((buy ? lock : quantity) > balance!)
        throw Error(
          buy
            ? "This order exceeds your free USDC balance. Deposit or lower the amount."
            : "This order exceeds your available shares. Lower the quantity.",
        );
      const minutes = /^\d+$/.test(expiry) ? BigInt(expiry) : 0n;
      const end = BigInt(Math.floor(Date.now() / 1000)) + minutes * 60n;
      if (kind === "limit" && (minutes < 5n || end >= 2n ** 64n))
        throw Error(
          "Expiry must be at least 5 minutes and fit the contract timestamp. Allow time for wallet signing.",
        );
      void tx.prepare({
        contract: "PimdAbove",
        fn: "place",
        args: [
          market!.id,
          {
            yes,
            buy,
            quantity: amountMode ? 0n : quantity,
            amount: amountMode ? quantity : 0n,
            price: priceUnits,
            expiry: kind === "limit" ? end : 0n,
            market: kind === "market",
          },
        ],
        label: `${buy ? "Buy" : "Sell"} ${yes ? "Yes" : "No"}`,
        summary: `${marketLabel(market!)} ending ${utc(market!.end)}. ${kind === "market" ? "Market" : "Limit"} ${buy ? "buy" : "sell"} ${yes ? "Yes" : "No"}: ${amountMode ? fmt(quantity) + " USDC budget" : fmt(quantity) + " shares"} at ${fmt(priceUnits)} USDC ${kind === "market" ? "worst price" : "limit"}. Locks ${buy ? fmt(lock) + " USDC" : fmt(quantity) + " shares"}. Fees are included. ${kind === "market" ? "Unfilled remainder returns in this transaction." : `Unfilled shares rest until cancelled or expiry at ${utc(end)}.`}`,
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <form onSubmit={submit} className="order-form">
      <div className="segmented" aria-label="Outcome">
        {[true, false].map((v) => (
          <button
            type="button"
            key={String(v)}
            className={yes === v ? (v ? "selected yes" : "selected no") : ""}
            aria-pressed={yes === v}
            onClick={() => setYes(v)}
          >
            {v ? "Yes ↑" : "No ↓"}
          </button>
        ))}
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="direction">Direction</label>
          <select
            id="direction"
            value={buy ? "buy" : "sell"}
            onChange={(e) => setBuy(e.target.value === "buy")}
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="order-kind">Order type</label>
          <select
            id="order-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="limit">Limit</option>
            <option value="market">Market</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <Field
          label={
            kind === "market" ? "Worst price (USDC)" : "Limit price (USDC)"
          }
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="0.4000"
        />
        <div className="field">
          <div className="label-row">
            <label htmlFor="order-size">
              {amountMode ? "Budget (USDC)" : "Shares"}
            </label>
            <button
              type="button"
              className="text-button"
              onClick={max}
              disabled={balance === undefined}
            >
              Max
            </button>
          </div>
          <input
            id="order-size"
            inputMode="decimal"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="10"
            aria-describedby="order-error"
            aria-invalid={!!aboveBalance}
          />
        </div>
      </div>
      <p className="balance-line">
        Available:{" "}
        <span>
          {fmt(balance)} {buy ? "USDC" : `${yes ? "Yes" : "No"} shares`}
        </span>
      </p>
      {kind === "market" && buy && (
        <div className="field">
          <label htmlFor="size-unit">Size by</label>
          <select
            id="size-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="shares">Shares</option>
            <option value="usdc">USDC amount</option>
          </select>
        </div>
      )}
      <dl className="trade-summary">
        <div>
          <dt>Locks</dt>
          <dd>
            {preview
              ? `${fmt(buy ? preview.lock : n)} ${buy ? "USDC" : "shares"}`
              : "Not entered"}
          </dd>
        </div>
        <div>
          <dt>Fee inside · estimate</dt>
          <dd>{preview ? `${fmt(preview.fee)} USDC` : "Not quoted"}</dd>
        </div>
        <div>
          <dt>
            {buy
              ? "Shares after fee · estimate"
              : "Proceeds after fee · estimate"}
          </dt>
          <dd>
            {preview
              ? `${fmt(buy ? preview.shares : preview.proceeds)} ${buy ? "shares" : "USDC"}`
              : "Not quoted"}
          </dd>
        </div>
      </dl>
      <div id="order-error" className="error" role="alert">
        {aboveBalance
          ? "Amount exceeds your available balance. Use Max or deposit funds."
          : error}
      </div>
      <button
        className="primary full"
        disabled={unavailable || tx.busy || !!aboveBalance}
        type="submit"
      >
        {tx.busy &&
        tx.state.label === `${buy ? "Buy" : "Sell"} ${yes ? "Yes" : "No"}`
          ? `${tx.state.label}…`
          : `Review ${buy ? "buy" : "sell"} ${yes ? "Yes" : "No"}`}
      </button>
      <p className="form-help">
        {!ready
          ? "Connect your wallet above to trade."
          : !market
            ? "An active market is required."
            : market.outcome !== 0
              ? "Settled. Claim or withdraw below."
              : "Estimates use your price and current taker rate. Actual fills and maker fees can differ."}
      </p>
      {kind === "limit" && (
        <details className="expiry-settings">
          <summary>Expiry: {expiry} minutes</summary>
          <Field
            label="Expiry (minutes)"
            inputMode="numeric"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </details>
      )}
      {market && (
        <details className="expiry-settings">
          <summary>Market details</summary>
          <p>
            {marketLabel(market)}
            <br />
            {utc(market.end)}
          </p>
          <p>
            Threshold: {fmt(market.threshold, 18)} USD per U. Version{" "}
            {market.version}.
          </p>
          <code>{market.id}</code>
        </details>
      )}
    </form>
  );
}
function Balances({ launch, ready }: { launch: LaunchState; ready: boolean }) {
  const r = useRuntime(),
    tx = useTx();
  const [mode, setMode] = useState("deposit"),
    [value, setValue] = useState("");
  const token = useToken(launch.data?.usdc, r.contract("PimdAbove").address);
  let n = 0n;
  try {
    n = amount(value);
  } catch {}
  const limit = mode === "deposit" ? token.data?.balance : launch.data?.free;
  const approved = token.data && token.data.allowance >= n;
  const disabled =
    !ready || !n || limit === undefined || n > limit || token.isError;
  const spec: TxSpec =
    mode === "deposit" && !approved
      ? {
          address: launch.data?.usdc,
          abi: erc20Abi,
          fn: "approve",
          args: [r.contract("PimdAbove").address, n],
          label: "Approve USDC deposit",
          summary: `Allow PimdAbove to spend exactly ${fmt(n)} USDC. Deposit is a separate transaction.`,
        }
      : {
          contract: "PimdAbove",
          fn: mode,
          args: [n],
          label: mode === "deposit" ? "Deposit USDC" : "Withdraw USDC",
          summary: `${mode === "deposit" ? "Move from your wallet to your free market balance" : "Return from your free market balance to your wallet"}: ${fmt(n)} USDC. No market fee.`,
        };
  return (
    <section className="section">
      <h2>Your balance</h2>
      <dl className="position-values">
        <div>
          <dt>Free in Above</dt>
          <dd>
            {fmt(launch.data?.free)} <small>USDC</small>
          </dd>
        </div>
        <div>
          <dt>In wallet</dt>
          <dd>
            {fmt(launch.data?.walletUsdc)} <small>USDC</small>
          </dd>
        </div>
      </dl>
      <div className="segmented">
        <button
          className={mode === "deposit" ? "selected" : ""}
          aria-pressed={mode === "deposit"}
          onClick={() => setMode("deposit")}
        >
          Deposit
        </button>
        <button
          className={mode === "withdraw" ? "selected" : ""}
          aria-pressed={mode === "withdraw"}
          onClick={() => setMode("withdraw")}
        >
          Withdraw
        </button>
      </div>
      <div className="label-row">
        <label htmlFor="balance-amount">Amount (USDC)</label>
        <button
          className="text-button"
          disabled={limit === undefined}
          onClick={() => setValue(fmt(limit))}
        >
          Max
        </button>
      </div>
      <input
        id="balance-amount"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="0.00"
      />
      {n > 0n && limit !== undefined && n > limit && (
        <p className="error">
          Amount exceeds your {mode === "deposit" ? "wallet" : "free"} USDC
          balance.
        </p>
      )}
      <div className="action-row">
        <Action spec={spec} disabled={disabled}>
          {spec.label}
        </Action>
      </div>
      <p className="muted">
        Deposits need a separate USDC approval. Only your free balance can be
        withdrawn.
      </p>
    </section>
  );
}
function PositionActions({
  market,
  launch,
  detail,
  ready,
}: {
  market?: Market;
  launch: LaunchState;
  detail: ReturnType<typeof useMarketDetail>;
  ready: boolean;
}) {
  const [value, setValue] = useState("");
  let n = 0n;
  try {
    n = amount(value);
  } catch {}
  const position = detail.data?.position;
  const active = market?.outcome === 0;
  const settleable =
    !!market &&
    !!launch.data &&
    market.end <= launch.data.now &&
    ((detail.data?.close ?? 0n) > 0n ||
      launch.data.now >= market.end + 259200n);
  const disabled = !ready || !market || !detail.data || detail.isError;
  return (
    <>
      <Field
        label="Pairs to split or merge"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder="1"
      />
      <div className="action-row">
        <Action
          disabled={disabled || !active || !n || n > (launch.data?.free ?? 0n)}
          spec={{
            contract: "PimdAbove",
            fn: "split",
            args: [market?.id, n],
            label: "Split pairs",
            summary: `Use ${fmt(n)} USDC from your free balance to create ${fmt(n)} Yes and ${fmt(n)} No shares. No market fee.`,
          }}
        >
          Split pairs
        </Action>
        <Action
          disabled={
            disabled ||
            !active ||
            !n ||
            !position ||
            n > min(position[0], position[1])
          }
          spec={{
            contract: "PimdAbove",
            fn: "merge",
            args: [market?.id, n],
            label: "Merge pairs",
            summary: `Return ${fmt(n)} Yes and ${fmt(n)} No shares for ${fmt(n)} USDC in your free balance. No market fee.`,
          }}
        >
          Merge pairs
        </Action>
      </div>
      <div className="action-row">
        <Action
          disabled={disabled || !active || !settleable}
          spec={{
            contract: "PimdAbove",
            fn: "settle",
            args: [market?.id],
            label: "Settle market",
            summary:
              "Finalize this market using its boundary oracle close, or half each if no close after 3 days. Trading stops at settlement.",
          }}
        >
          Settle market
        </Action>
        <Action
          disabled={
            disabled ||
            (!market?.outcome && !settleable) ||
            (!detail.data?.mine.length &&
              (!position || position[0] + position[1] === 0n))
          }
          spec={{
            contract: "PimdAbove",
            fn: "claim",
            args: [market?.id],
            label: "Claim payout",
            summary:
              "Settle if eligible, cancel your resting orders in this market and redeem your shares into your free USDC balance. Withdraw separately.",
          }}
        >
          Claim payout
        </Action>
      </div>
      <p className="muted">
        Split and merge are available until settlement. Claims include
        cancellation of your open orders.
      </p>
    </>
  );
}
function MatchControl({
  market,
  detail,
  ready,
  launch,
}: {
  market?: Market;
  detail: ReturnType<typeof useMarketDetail>;
  ready: boolean;
  launch: LaunchState;
}) {
  const b = detail.data?.book;
  const estimate =
    b && launch.data && b.every((o) => !o || o.expiry > launch.data!.now)
      ? previewMatch(b, launch.data.taker, launch.data.maker)
      : undefined;
  const crossed =
    b &&
    ((b[0] && b[1] && b[0].price >= b[1].price) ||
      (b[2] && b[3] && b[2].price >= b[3].price) ||
      (b[0] && b[2] && b[0].price + b[2].price >= SHARE) ||
      (b[1] && b[3] && b[1].price + b[3].price <= SHARE));
  return (
    <div className="match-line">
      <div>
        <h3>{crossed ? "Crossed orders available" : "Match resting orders"}</h3>
        <p>
          {estimate
            ? `First crossed fill estimate: ${fmt(estimate.gap)} USDC to you for ${fmt(estimate.shares)} shares. `
            : "Caller reward is not quoted. "}
          Per-fill price improvements go to the Match caller. The exact amount
          depends on execution; unspent locks return to each order’s owner.
        </p>
      </div>
      <Action
        disabled={
          !ready ||
          !market ||
          market.outcome !== 0 ||
          detail.isError ||
          !detail.data
        }
        spec={{
          contract: "PimdAbove",
          fn: "matchMarket",
          args: [market?.id],
          label: "Match orders",
          summary:
            "Match up to 64 resting fills. You pay gas and receive eligible per-fill gaps. The actual reward is determined on chain; no reward is guaranteed.",
        }}
      >
        Match
      </Action>
    </div>
  );
}
