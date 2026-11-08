import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import {
  useRuntime,
  useSession,
  useToken,
  read,
  useTx,
  type TxSpec,
} from "./context";
import { erc20Abi, permit2Abi, quoterAbi, routerAbi } from "./config";
import { amount, fmt, errorMessage } from "./domain";
import { swapPayload } from "./swap";
import { Action, Field, Notice, AddressText } from "./ui";
import type { LaunchState } from "./Above";
export function Token({ launch }: { launch: LaunchState }) {
  const r = useRuntime(),
    s = useSession(),
    tx = useTx(),
    network = r.deployment.network,
    key = r.deployment.poolKey;
  const token = r.contract("LaunchToken").address;
  const pair = key
    ? key.currency0.toLowerCase() === token.toLowerCase()
      ? key.currency1
      : key.currency0
    : undefined;
  const [buy, setBuy] = useState(true),
    [value, setValue] = useState(""),
    [slippage, setSlippage] = useState("0.5"),
    [quoting, setQuoting] = useState(false),
    [error, setError] = useState(""),
    [quote, setQuote] = useState<{
      out: bigint;
      amount: bigint;
      minimum: bigint;
      at: number;
      input: Address;
      account: Address;
      slippage: bigint;
    }>();
  const input = buy ? pair : token,
    output = buy ? token : pair;
  const inToken = useToken(input, network.uniswapV4.permit2),
    outToken = useToken(output);
  const ready = !!launch.data && !launch.isError && s.correctChain;
  const p2 = useQuery({
    queryKey: ["permit2", s.address, input],
    enabled: !!s.address && !!input && ready,
    refetchInterval: 15000,
    retry: 1,
    queryFn: () =>
      read<readonly [bigint, number, number]>(
        s.client,
        { address: network.uniswapV4.permit2, abi: permit2Abi },
        "allowance",
        [s.address, input, network.uniswapV4.universalRouter],
      ),
  });
  useEffect(() => {
    setQuote(undefined);
    setError("");
  }, [buy, value, slippage, s.address, s.chainId]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  let n = 0n,
    bps = 0n;
  try {
    if (inToken.data) n = amount(value, inToken.data.decimals);
    if (/^\d+(\.\d{1,2})?$/.test(slippage))
      bps = BigInt(Math.round(Number(slippage) * 100));
  } catch {}
  const validSlip =
    /^\d+(\.\d{1,2})?$/.test(slippage) && bps >= 0n && bps <= 500n;
  const allowance = inToken.data?.allowance ?? 0n;
  const ercApproved = n > 0n && allowance >= n;
  const permitApproved =
    !!p2.data && p2.data[0] >= n && Number(p2.data[1]) > now / 1000 + 60;
  const fresh =
    !!quote &&
    now - quote.at < 60000 &&
    quote.amount === n &&
    quote.input === input &&
    quote.account === s.address &&
    quote.slippage === bps;
  const sufficient = !!inToken.data && n <= inToken.data.balance;
  async function getQuote() {
    setQuoting(true);
    setQuote(undefined);
    setError("");
    try {
      if (!key || !input || !ready || !s.address)
        throw Error("Connect on Ethereum and verify the deployment first.");
      if (!n || !validSlip)
        throw Error("Enter a positive amount and slippage from 0% to 5%.");
      const codes = await Promise.all(
        [
          network.uniswapV4.quoter,
          network.uniswapV4.universalRouter,
          network.uniswapV4.permit2,
        ].map((address) => s.client.getCode({ address })),
      );
      if (codes.some((c) => !c || c === "0x"))
        throw Error("The configured swap protocol is unavailable.");
      const zeroForOne = input.toLowerCase() === key.currency0.toLowerCase();
      const sim = await s.client.simulateContract({
        address: network.uniswapV4.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [{ poolKey: key, zeroForOne, exactAmount: n, hookData: "0x" }],
        account: s.address,
      });
      const out = sim.result[0];
      if (!out)
        throw Error(
          "No output quoted. The pool may have insufficient liquidity.",
        );
      const minimum = (out * (10000n - bps)) / 10000n;
      if (minimum <= 0n || minimum >= 2n ** 128n)
        throw Error("The quote is outside supported limits.");
      setQuote({
        out,
        minimum,
        amount: n,
        input,
        account: s.address,
        slippage: bps,
        at: Date.now(),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setQuoting(false);
    }
  }
  let spec: TxSpec | undefined;
  if (input && key && n) {
    if (!ercApproved)
      spec = {
        address: input,
        abi: erc20Abi,
        fn: "approve",
        args: [network.uniswapV4.permit2, n],
        label: `Approve ${inToken.data?.symbol ?? "token"} to Permit2`,
        summary: `Allow Permit2 to spend exactly ${fmt(n, inToken.data?.decimals)} ${inToken.data?.symbol}. This is approval 1 of 2; no swap yet.`,
      };
    else if (!permitApproved)
      spec = {
        address: network.uniswapV4.permit2,
        abi: permit2Abi,
        fn: "approve",
        args: [
          input,
          network.uniswapV4.universalRouter,
          n,
          Math.floor(now / 1000) + 1800,
        ],
        label: "Approve router in Permit2",
        summary: `Authorize the configured Universal Router for ${fmt(n, inToken.data?.decimals)} ${inToken.data?.symbol} for 30 minutes. This is approval 2 of 2; no swap yet.`,
      };
    else if (fresh && quote) {
      const payload = swapPayload(
        key,
        input,
        n,
        quote.minimum,
        network.uniswapV4.extendedSwapParams,
      );
      spec = {
        address: network.uniswapV4.universalRouter,
        abi: routerAbi,
        fn: "execute",
        args: [
          payload.commands,
          payload.inputs,
          BigInt(Math.floor(now / 1000) + 900),
        ],
        value: BigInt(input) === 0n ? n : 0n,
        label: `Swap ${inToken.data?.symbol} for ${outToken.data?.symbol}`,
        summary: `Spend ${fmt(n, inToken.data?.decimals)} ${inToken.data?.symbol}; receive at least ${fmt(quote.minimum, outToken.data?.decimals)} ${outToken.data?.symbol}. Slippage ${slippage}%. Deadline 15 minutes. Pool fee ${key.fee / 10000}%.`,
      };
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Trade pIMD<span className="heading-dot">.</span>
          </h1>
          <p>The launch token, paired with IMD.</p>
        </div>
      </div>
      {!key ? (
        <Notice>
          Swap unavailable: this handoff has no attested pool key.
        </Notice>
      ) : (
        <div className="content-grid">
          <section className="trade-panel">
            <h2>Swap tokens</h2>
            <div className="segmented">
              <button
                aria-pressed={buy}
                className={buy ? "selected" : ""}
                onClick={() => setBuy(true)}
              >
                Buy pIMD
              </button>
              <button
                aria-pressed={!buy}
                className={!buy ? "selected" : ""}
                onClick={() => setBuy(false)}
              >
                Sell pIMD
              </button>
            </div>
            <div className="label-row">
              <label htmlFor="swap-amount">
                You pay (
                {inToken.data?.symbol ??
                  (buy ? network.pairToken.symbol : "pIMD")}
                )
              </label>
              <button
                className="text-button"
                disabled={!inToken.data}
                onClick={() =>
                  setValue(fmt(inToken.data?.balance, inToken.data?.decimals))
                }
              >
                Max
              </button>
            </div>
            <input
              id="swap-amount"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            <p className="balance-line">
              Wallet: {fmt(inToken.data?.balance, inToken.data?.decimals)}{" "}
              {inToken.data?.symbol}
            </p>
            <Field
              label="Slippage (%)"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              inputMode="decimal"
              hint="From 0% to 5%. The minimum received is enforced on chain."
            />
            <button
              className="full"
              disabled={!ready || quoting || !n || !validSlip || tx.busy}
              onClick={() => void getQuote()}
            >
              {quoting ? "Quoting…" : "Get quote"}
            </button>
            <dl className="trade-summary">
              <div>
                <dt>You receive · quote</dt>
                <dd>
                  {quote
                    ? `${fmt(quote.out, outToken.data?.decimals)} ${outToken.data?.symbol}`
                    : "Not quoted"}
                </dd>
              </div>
              <div>
                <dt>Minimum received</dt>
                <dd>
                  {quote
                    ? `${fmt(quote.minimum, outToken.data?.decimals)} ${outToken.data?.symbol}`
                    : "Not quoted"}
                </dd>
              </div>
              <div>
                <dt>Exchange rate</dt>
                <dd>
                  {quote
                    ? `1 ${inToken.data?.symbol} ≈ ${(Number(fmt(quote.out, outToken.data?.decimals)) / Number(fmt(n, inToken.data?.decimals))).toPrecision(6)} ${outToken.data?.symbol}`
                    : "Not quoted"}
                </dd>
              </div>
            </dl>
            {quote && !fresh && (
              <Notice>Quote expired. Get a new quote before swapping.</Notice>
            )}
            {n > 0n && !sufficient && inToken.data && (
              <p className="error">Amount exceeds your wallet balance.</p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {(inToken.isError || p2.isError) && (
              <p className="error">
                Unable to read balances or approvals. Refresh the page to retry.
              </p>
            )}
            {spec ? (
              <Action
                primary
                spec={spec}
                disabled={
                  !ready ||
                  !fresh ||
                  !sufficient ||
                  inToken.isError ||
                  p2.isError ||
                  quoting
                }
              >
                {spec.label}
              </Action>
            ) : (
              <button className="primary full" disabled>
                Review swap
              </button>
            )}
            <p className="muted">
              Two token approvals precede your first swap. Every step requires
              its own wallet confirmation. USD context is unavailable.
            </p>
          </section>
          <section className="section prose">
            <h2>The (p)IMD token</h2>
            <p>
              Fixed supply of 1,000,000,000 pIMD, with 18 decimals. No owner,
              mint, burn function, fee, pause or upgrade.
            </p>
            <AddressText address={token} />
            <h3>Launch allocation</h3>
            <dl className="facts">
              <div>
                <dt>Pool</dt>
                <dd>35%</dd>
              </div>
              <div>
                <dt>Swarm</dt>
                <dd>10%</dd>
              </div>
              <div>
                <dt>Owner at launch</dt>
                <dd>55%</dd>
              </div>
              <div>
                <dt>Owner retains</dt>
                <dd>5%</dd>
              </div>
              <div>
                <dt>Owner transfers to burn address</dt>
                <dd>50%</dd>
              </div>
            </dl>
            <p>
              The owner’s post-launch burn is a separate transfer. This app does
              not claim it has occurred.
            </p>
            <h3>Attested pool</h3>
            <p>
              Fee {key.fee / 10000}%; tick spacing {key.tickSpacing}. Opening
              market cap: 2,500 IMD. Current quotes come from the configured
              Uniswap v4 quoter.
            </p>
            <p className="muted">
              pIMD is separate from the USDC collateral used by Above markets.
            </p>
            <details>
              <summary>Transfer pIMD</summary>
              <TransferToken ready={ready} />
            </details>
          </section>
        </div>
      )}
    </>
  );
}
function TransferToken({ ready }: { ready: boolean }) {
  const r = useRuntime();
  const [recipient, setRecipient] = useState(""),
    [value, setValue] = useState("");
  const data = useToken(r.contract("LaunchToken").address);
  let n = 0n;
  try {
    n = amount(value, data.data?.decimals ?? 18);
  } catch {}
  const valid =
    isAddress(recipient, { strict: false }) && BigInt(recipient) !== 0n;
  return (
    <>
      <Field
        label="Recipient address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value.trim())}
        autoComplete="off"
        hint="Paste the full Ethereum address. Check it carefully before confirming."
      />
      <Field
        label="pIMD to transfer"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
      />
      <p>Wallet: {fmt(data.data?.balance, data.data?.decimals)} pIMD</p>
      <Action
        disabled={
          !ready ||
          !valid ||
          !n ||
          !data.data ||
          n > data.data.balance ||
          data.isError
        }
        spec={{
          contract: "LaunchToken",
          fn: "transfer",
          args: [recipient, n],
          label: "Transfer pIMD",
          summary: `Send ${fmt(n, 18)} pIMD to ${recipient}. Transfers cannot be reversed.`,
        }}
      >
        Review transfer
      </Action>
    </>
  );
}
