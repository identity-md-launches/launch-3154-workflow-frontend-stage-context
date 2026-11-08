import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import { useRuntime, useSession, useToken, read, type TxSpec } from "./context";
import { erc20Abi } from "./config";
import { amount, fmt, utc, errorMessage } from "./domain";
import { Action, Field, Notice, AddressText } from "./ui";
import type { LaunchState } from "./Above";
export function PaidAction({
  spec,
  token,
  amount: n,
  decimals = 18,
  ready,
}: {
  spec: TxSpec;
  token?: Address;
  amount: bigint;
  decimals?: number;
  ready: boolean;
}) {
  const r = useRuntime(),
    spender = spec.contract ? r.contract(spec.contract).address : spec.address;
  const allowance = useToken(token, spender);
  const needs = !!allowance.data && allowance.data.allowance < n;
  return (
    <>
      <p className="muted">
        Wallet: {fmt(allowance.data?.balance, decimals)}{" "}
        {allowance.data?.symbol} · Required: {fmt(n, decimals)}{" "}
        {allowance.data?.symbol}
      </p>
      <Action
        disabled={
          !ready ||
          !allowance.data ||
          allowance.isError ||
          allowance.data.balance < n
        }
        spec={
          needs
            ? {
                address: token,
                abi: erc20Abi,
                fn: "approve",
                args: [spender, n],
                label: `Approve ${allowance.data?.symbol} for ${spec.contract}`,
                summary: `Authorize exactly ${fmt(n, decimals)} ${allowance.data?.symbol} for ${spec.contract}. The action is a separate transaction.`,
              }
            : spec
        }
      >
        {needs ? `Approve ${allowance.data?.symbol}` : spec.label}
      </Action>
      {allowance.isError && (
        <p className="error">
          Approval read failed. Reload state before continuing.
        </p>
      )}
    </>
  );
}
type Proposal = {
  proposer: Address;
  challenger: Address;
  deadline: bigint;
  finished: boolean;
  requested: boolean;
  firstBlock: bigint;
  proposed: bigint;
  cost: bigint;
};
type Pending = {
  open: boolean;
  requestedAt: bigint;
  received: number;
  requester: Address;
};
export function Tools({ launch }: { launch: LaunchState }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            Oracle & tools<span className="heading-dot">.</span>
          </h1>
          <p>Record boundary prices and manage asset paths.</p>
        </div>
      </div>
      <OracleTools launch={launch} />
      <details className="section">
        <summary>Swap along a registered asset path</summary>
        <PathSwap launch={launch} />
      </details>
      <Admin launch={launch} />
    </>
  );
}
function OracleTools({ launch }: { launch: LaunchState }) {
  const r = useRuntime(),
    s = useSession();
  const [version, setVersion] = useState(""),
    [boundary, setBoundary] = useState(""),
    [firstBlock, setFirstBlock] = useState(""),
    [price, setPrice] = useState(""),
    [proofs, setProofs] = useState("");
  const ver = Number(version || launch.data?.assets[0]?.version || 0);
  const b = /^\d+$/.test(boundary) ? BigInt(boundary) : 0n;
  const fb = /^\d+$/.test(firstBlock) ? BigInt(firstBlock) : 0n;
  let proposed = 0n;
  try {
    proposed = amount(price, 18);
  } catch {}
  const ready = !!launch.data && !launch.isError && s.correctChain;
  const q = useQuery({
    queryKey: ["oracle", s.address, ver, b.toString()],
    enabled: ready && ver > 0 && b > 0n && b < 2n ** 64n,
    refetchInterval: 15000,
    retry: 1,
    queryFn: async () => {
      const oracle = r.contract("BoundaryOracle"),
        start = r.contract("StartOracle");
      const [
        cost,
        close,
        strike,
        pending,
        bond,
        proofWindow,
        timeout,
        ttl,
        boundaryValid,
        credit,
        id,
      ] = await Promise.all([
        read<readonly [bigint, bigint]>(s.client, oracle, "oracleCost", [ver]),
        read<bigint>(s.client, oracle, "price", [ver, b]),
        read<bigint>(s.client, start, "price", [ver, b]),
        read<Pending>(s.client, start, "pending", [ver, b]),
        read<bigint>(s.client, oracle, "BOND"),
        read<bigint>(s.client, oracle, "PROOF_WINDOW"),
        read<bigint>(s.client, oracle, "TIMEOUT"),
        read<bigint>(s.client, start, "REQUEST_TTL"),
        read<boolean>(s.client, r.contract("PimdRegistry"), "isBoundary", [b]),
        read<bigint>(s.client, oracle, "credit", [s.address]),
        read<Hex>(s.client, oracle, "proposalId", [ver, b]),
      ]);
      const proposal = await read<Proposal>(s.client, oracle, "proposal", [id]);
      return {
        cost: cost[1],
        close,
        strike,
        pending,
        bond,
        proofWindow,
        timeout,
        ttl,
        boundaryValid,
        credit,
        proposal,
      };
    },
  });
  const data = q.data,
    now = launch.data?.now ?? 0n,
    valid = ready && !!data && !q.isError && data.boundaryValid;
  const late = !!data && now >= b + data.proofWindow;
  const hasProposal = data && BigInt(data.proposal.proposer) !== 0n;
  const challenged = data && BigInt(data.proposal.challenger) !== 0n;
  const requestReady =
    valid &&
    late &&
    fb > 0n &&
    fb + 2n < (launch.data?.block ?? 0n) &&
    data!.strike === 0n &&
    (!data!.pending.open || now >= data!.pending.requestedAt + data!.ttl);
  let proofArray: unknown;
  try {
    proofArray = JSON.parse(proofs);
    if (!Array.isArray(proofArray) || proofArray.length !== 3)
      proofArray = undefined;
  } catch {}
  return (
    <section className="section">
      <h2>Record a price</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="oracle-version">Asset version</label>
          <input
            id="oracle-version"
            inputMode="numeric"
            value={version || String(launch.data?.assets[0]?.version ?? "")}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="Registry version"
          />
        </div>
        <Field
          label="Boundary (Unix seconds, UTC)"
          value={boundary}
          onChange={(e) => setBoundary(e.target.value)}
          inputMode="numeric"
          hint={
            b > 0n && b < 253402300800n
              ? utc(b)
              : "The exact registry boundary to record."
          }
        />
        <Field
          label="First block at or after boundary"
          value={firstBlock}
          onChange={(e) => setFirstBlock(e.target.value)}
          inputMode="numeric"
          hint="Use a verified mainnet block number. A wrong block is refused."
        />
      </div>
      {q.isFetching && !data && <p role="status">Loading oracle state…</p>}
      {q.isError && (
        <Notice error>
          {errorMessage(q.error)}{" "}
          <button onClick={() => void q.refetch()}>Retry oracle reads</button>
        </Notice>
      )}
      {data && (
        <>
          <dl className="facts">
            <div>
              <dt>Closing price (USD / U)</dt>
              <dd>{data.close ? fmt(data.close, 18) : "Not recorded"}</dd>
            </div>
            <div>
              <dt>Start price (USD / U)</dt>
              <dd>
                {data.strike
                  ? fmt(data.strike, 18)
                  : data.pending.open
                    ? "Waiting for oracle"
                    : "Start price not recorded"}
              </dd>
            </div>
            <div>
              <dt>Oracle fee</dt>
              <dd>{fmt(data.cost, 18)} IMD + gas</dd>
            </div>
            <div>
              <dt>Proposal bond</dt>
              <dd>{fmt(data.bond, 18)} IMD</dd>
            </div>
            <div>
              <dt>Refund credit</dt>
              <dd>{fmt(data.credit, 18)} IMD</dd>
            </div>
          </dl>
          {!data.boundaryValid && (
            <Notice error>This timestamp is not a registered boundary.</Notice>
          )}
        </>
      )}
      <div className="lower-grid">
        <div>
          <h3>Start price, after 27 hours</h3>
          <p>
            Request a start price from the oracle. You pay the displayed fee. An
            unanswered request can be replaced after 24 hours; its fee is not
            refunded.
          </p>
          <PaidAction
            ready={!!requestReady}
            token={launch.data?.imd}
            amount={data?.cost ?? 0n}
            spec={{
              contract: "StartOracle",
              fn: "request",
              args: [ver, b, fb],
              label: "Record start price",
              summary: `Request asset version ${ver} at ${b > 0n && b < 253402300800n ? utc(b) : boundary}. Pay ${fmt(data?.cost, 18)} IMD and gas. This records an oracle price; Up/Down market activation is unavailable in this deployment.`,
            }}
          />
          {data && data.pending.open && (
            <p role="status">
              Waiting for oracle · {data.pending.received} hop answers received.
              Requested {utc(data.pending.requestedAt)}.
            </p>
          )}
          {!late && b > 0n && (
            <p className="muted">
              StartOracle accepts requests from 27 hours after the boundary.
              Earlier prices require a boundary proof.
            </p>
          )}
        </div>
        <div>
          <h3>Closing price & proposals</h3>
          <p>
            Within 27 hours, submit verified block proofs. Later, a proposal
            locks an IMD bond and opens a one-hour dispute window.
          </p>
          <Field
            label="Proposed price (USD per U)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
          />
          <PaidAction
            ready={
              !!(
                valid &&
                late &&
                now < b + (data?.timeout ?? 0n) &&
                !hasProposal &&
                !data?.close &&
                fb > 0n &&
                proposed > 0n
              )
            }
            token={launch.data?.imd}
            amount={data?.bond ?? 0n}
            spec={{
              contract: "BoundaryOracle",
              fn: "propose",
              args: [ver, b, proposed, fb],
              label: "Propose closing price",
              summary: `Propose ${fmt(proposed, 18)} USD per U for version ${ver}; lock ${fmt(data?.bond, 18)} IMD. A successful challenge can forfeit the bond.`,
            }}
          />
        </div>
      </div>
      <details>
        <summary>Boundary proofs and dispute actions</summary>
        <div className="field">
          <label htmlFor="block-proofs">Three block proofs (JSON array)</label>
          <textarea
            id="block-proofs"
            rows={5}
            value={proofs}
            onChange={(e) => setProofs(e.target.value)}
            placeholder="Paste verifier-compatible block proofs"
          />
          <small>
            Each proof needs header, accountProof and storageProofs. No proof is
            fabricated by this site.
          </small>
        </div>
        <Action
          disabled={!valid || late || now < b || !proofArray || !!data?.close}
          spec={{
            contract: "BoundaryOracle",
            fn: "prove",
            args: [ver, b, proofArray],
            label: "Submit boundary proof",
            summary:
              "Submit three supplied block proofs to the fixed verifier. The wallet pays gas; a failed verification reverts.",
          }}
        >
          Submit boundary proof
        </Action>
        {hasProposal && (
          <>
            <h3>Current proposal</h3>
            <dl className="facts">
              <div>
                <dt>Proposed price</dt>
                <dd>{fmt(data?.proposal.proposed, 18)} USD / U</dd>
              </div>
              <div>
                <dt>Dispute deadline</dt>
                <dd>{utc(data!.proposal.deadline)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {data!.proposal.finished
                    ? "Finished"
                    : challenged
                      ? "Disputed"
                      : "Open"}
                </dd>
              </div>
            </dl>
            <AddressText address={data!.proposal.proposer} />
          </>
        )}
        <div className="action-row">
          <PaidAction
            ready={
              !!(
                valid &&
                hasProposal &&
                !challenged &&
                !data?.proposal.finished &&
                now < data!.proposal.deadline &&
                now < b + data!.timeout &&
                data!.proposal.proposer.toLowerCase() !==
                  s.address?.toLowerCase()
              )
            }
            token={launch.data?.imd}
            amount={(data?.bond ?? 0n) + (data?.cost ?? 0n)}
            spec={{
              contract: "BoundaryOracle",
              fn: "dispute",
              args: [ver, b, data?.cost ?? 0n],
              label: "Dispute proposal",
              summary: `Lock a ${fmt(data?.bond, 18)} IMD challenge bond and authorize up to ${fmt(data?.cost, 18)} IMD oracle cost. The losing bond funds resolution.`,
            }}
          />
          <PaidAction
            ready={
              !!(
                valid &&
                challenged &&
                !data?.proposal.finished &&
                !data?.proposal.requested &&
                now < b + data!.timeout
              )
            }
            token={launch.data?.imd}
            amount={data?.cost ?? 0n}
            spec={{
              contract: "BoundaryOracle",
              fn: "retryResolution",
              args: [ver, b, data?.cost ?? 0n],
              label: "Retry resolution",
              summary: `Fund another oracle attempt with at most ${fmt(data?.cost, 18)} IMD. Check refundable credit afterward.`,
            }}
          />
        </div>
        <div className="action-row">
          <Action
            disabled={
              !(
                valid &&
                hasProposal &&
                !challenged &&
                !data?.proposal.finished &&
                now >= data!.proposal.deadline
              )
            }
            spec={{
              contract: "BoundaryOracle",
              fn: "finalize",
              args: [ver, b],
              label: "Finalize proposal",
              summary:
                "Finalize the unchallenged price after its dispute window. This can determine market settlement.",
            }}
          >
            Finalize proposal
          </Action>
          <Action
            disabled={
              !(
                valid &&
                challenged &&
                !data?.proposal.finished &&
                now >= b + data!.timeout
              )
            }
            spec={{
              contract: "BoundaryOracle",
              fn: "timeout",
              args: [ver, b],
              label: "Release timed-out bonds",
              summary:
                "Close the disputed proposal after the three-day timeout and return bonds as oracle credit.",
            }}
          >
            Release timed-out bonds
          </Action>
          <Action
            disabled={!valid || !data?.credit}
            spec={{
              contract: "BoundaryOracle",
              fn: "withdrawCredit",
              label: "Withdraw oracle credit",
              summary: `Return ${fmt(data?.credit, 18)} IMD of your oracle credit to your wallet.`,
            }}
          >
            Withdraw oracle credit
          </Action>
        </div>
      </details>
      <p className="muted">
        USD / U means USD per the version’s unitsPerShare. Start prices never
        settle Above markets.
      </p>
    </section>
  );
}
function PathSwap({ launch }: { launch: LaunchState }) {
  const r = useRuntime(),
    s = useSession();
  const [version, setVersion] = useState(""),
    [toUSDC, setToUSDC] = useState(true),
    [out, setOut] = useState(""),
    [max, setMax] = useState("");
  const asset =
    launch.data?.assets.find((a) => String(a.version) === version) ??
    launch.data?.assets[0];
  const input = toUSDC ? asset?.token : launch.data?.usdc;
  let outN = 0n,
    maxN = 0n;
  try {
    outN = amount(out, toUSDC ? 6 : (asset?.decimals ?? 18));
    maxN = amount(max, toUSDC ? (asset?.decimals ?? 18) : 6);
  } catch {}
  return (
    <>
      <p>
        Get an exact output through PimdSwap2. Its immutable registry path is
        used. Unspent input is refunded in the same transaction.
      </p>
      <div className="field">
        <label htmlFor="path-version">Registered asset version</label>
        <select
          id="path-version"
          value={String(asset?.version ?? "")}
          onChange={(e) => setVersion(e.target.value)}
        >
          {launch.data?.assets.map((a) => (
            <option key={a.version} value={a.version}>
              {a.symbol} · version {a.version}
            </option>
          ))}
        </select>
      </div>
      <div className="segmented">
        <button aria-pressed={toUSDC} onClick={() => setToUSDC(true)}>
          Receive USDC
        </button>
        <button aria-pressed={!toUSDC} onClick={() => setToUSDC(false)}>
          Receive asset
        </button>
      </div>
      <div className="form-row">
        <Field
          label={`Exact output (${toUSDC ? "USDC" : (asset?.symbol ?? "asset")})`}
          value={out}
          onChange={(e) => setOut(e.target.value)}
          inputMode="decimal"
        />
        <Field
          label={`Maximum input (${toUSDC ? (asset?.symbol ?? "asset") : "USDC"})`}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          inputMode="decimal"
        />
      </div>
      {asset && (
        <p className="muted">
          Version {asset.version} · {asset.hops} pools. Simulation checks the
          supplied maximum; it is not a live price quote. USD context is
          unavailable.
        </p>
      )}
      <PaidAction
        ready={
          !!launch.data &&
          !launch.isError &&
          s.correctChain &&
          outN > 0n &&
          maxN > 0n
        }
        token={input}
        amount={maxN}
        decimals={toUSDC ? asset?.decimals : 6}
        spec={{
          contract: "PimdSwap2",
          fn: toUSDC ? "exactOutput" : "exactOutputAsset",
          args: [asset?.version, outN, maxN],
          label: "Swap exact output",
          summary: `Receive ${out} ${toUSDC ? "USDC" : asset?.symbol} for at most ${max} ${toUSDC ? asset?.symbol : "USDC"} through the selected registry path. Unused input is refunded.`,
        }}
      />
    </>
  );
}
function Admin({ launch }: { launch: LaunchState }) {
  const r = useRuntime(),
    s = useSession();
  const admin =
      !!s.address &&
      launch.data?.admin.toLowerCase() === s.address.toLowerCase(),
    registryAdmin =
      !!s.address &&
      launch.data?.assetAdmin.toLowerCase() === s.address.toLowerCase();
  const ready = !!launch.data && !launch.isError && s.correctChain;
  const [version, setVersion] = useState(""),
    [period, setPeriod] = useState(""),
    [end, setEnd] = useState(""),
    [threshold, setThreshold] = useState(""),
    [taker, setTaker] = useState(""),
    [maker, setMaker] = useState(""),
    [nextAdmin, setNextAdmin] = useState(""),
    [duration, setDuration] = useState(""),
    [offset, setOffset] = useState(""),
    [assetJson, setAssetJson] = useState("");
  let thresholdN = 0n,
    asset: unknown;
  try {
    thresholdN = amount(threshold, 18);
  } catch {}
  try {
    asset = JSON.parse(assetJson, (_k, v) =>
      typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : v,
    );
  } catch {}
  const num = (v: string) => (/^\d+$/.test(v) ? BigInt(v) : 0n);
  const addressValid =
    isAddress(nextAdmin, { strict: false }) && BigInt(nextAdmin) !== 0n;
  const tr = Number(taker),
    mr = Number(maker);
  const validRates =
    /^0(\.\d{1,4})?$/.test(taker) &&
    /^0(\.\d{1,4})?$/.test(maker) &&
    tr <= 0.1 &&
    mr <= 0.05;
  return (
    <section className="section">
      <h2>Administration</h2>
      {!ready ? (
        <p className="muted">Connect to check your roles.</p>
      ) : !admin && !registryAdmin ? (
        <p className="muted">
          This wallet has no administration role. No owner setup is required.
        </p>
      ) : (
        <>
          <p>
            Settings are restricted to the roles read from this launch. Existing
            asset versions cannot be changed.
          </p>
          {admin && (
            <details open>
              <summary>Create Above markets and set rates</summary>
              <div className="form-grid">
                <Field
                  label="Market asset version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  inputMode="numeric"
                />
                <Field
                  label="Registry period ID"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  inputMode="numeric"
                />
                <Field
                  label="Market end (Unix seconds, UTC)"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  inputMode="numeric"
                />
                <Field
                  label="Threshold (USD per U)"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <Action
                disabled={
                  !ready ||
                  !num(version) ||
                  period === "" ||
                  num(period) >= launch.data!.periodCount ||
                  num(end) <= launch.data!.now ||
                  !thresholdN
                }
                spec={{
                  contract: "PimdAbove",
                  fn: "createMarket",
                  args: [Number(version), Number(period), num(end), thresholdN],
                  label: "Create Above market",
                  summary: `Create asset version ${version}, period ${period}, end ${end}, threshold ${threshold} USD per U. This setting is permanent.`,
                }}
              >
                Create Above market
              </Action>
              <p>
                Current K = {fmt(launch.data?.taker, 4)}; Km ={" "}
                {fmt(launch.data?.maker, 4)}. Only later fills use new rates.
              </p>
              <div className="form-row">
                <Field
                  label="Taker K (0 to 0.10)"
                  value={taker}
                  onChange={(e) => setTaker(e.target.value)}
                  inputMode="decimal"
                />
                <Field
                  label="Maker Km (0 to 0.05)"
                  value={maker}
                  onChange={(e) => setMaker(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <Action
                disabled={!ready || !validRates}
                spec={{
                  contract: "PimdAbove",
                  fn: "setRates",
                  args: [
                    BigInt(Math.round((tr || 0) * 10000)),
                    BigInt(Math.round((mr || 0) * 10000)),
                  ],
                  label: "Set future fee rates",
                  summary: `Set K to ${taker} and Km to ${maker} for later fills only. No retroactive fees.`,
                }}
              >
                Set future fee rates
              </Action>
            </details>
          )}
          {registryAdmin && (
            <details>
              <summary>Add an asset version or period</summary>
              <div className="field">
                <label htmlFor="asset-json">Asset configuration (JSON)</label>
                <textarea
                  id="asset-json"
                  rows={7}
                  value={assetJson}
                  onChange={(e) => setAssetJson(e.target.value)}
                  placeholder="Paste the complete Asset tuple"
                />
                <small>
                  Fields: token, unitsPerShare (base units, decimal string),
                  maxOpenPairs (0), hops (1–3), path (three PoolKey objects).
                  Each key has currency0, currency1, fee, tickSpacing, hooks.
                  Unused entries must follow the contract ABI.
                </small>
              </div>
              <Action
                disabled={!ready || !asset}
                spec={{
                  contract: "PimdRegistry",
                  fn: "configureAsset",
                  args: [asset],
                  label: "Add asset version",
                  summary:
                    "Append this supplied asset configuration permanently. Existing markets keep their pinned version. Verify every address and unit in your wallet.",
                }}
              >
                Add asset version
              </Action>
              <div className="form-row">
                <Field
                  label="Period duration (seconds)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  inputMode="numeric"
                />
                <Field
                  label="Period offset (seconds)"
                  value={offset}
                  onChange={(e) => setOffset(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <Action
                disabled={
                  !ready ||
                  num(duration) < 300n ||
                  num(duration) > 31622400n ||
                  offset === "" ||
                  num(offset) >= num(duration)
                }
                spec={{
                  contract: "PimdRegistry",
                  fn: "addPeriod",
                  args: [Number(duration), Number(offset)],
                  label: "Add registry period",
                  summary: `Append a ${duration}-second period with ${offset}-second offset. Maximum 32 total periods; duplicates revert.`,
                }}
              >
                Add registry period
              </Action>
            </details>
          )}
          <details>
            <summary>Transfer administration role</summary>
            <Field
              label="New admin address"
              value={nextAdmin}
              onChange={(e) => setNextAdmin(e.target.value.trim())}
              hint="This hands away your role. Check the full address."
            />
            {admin && (
              <Action
                disabled={!ready || !addressValid}
                spec={{
                  contract: "PimdAbove",
                  fn: "transferAdmin",
                  args: [nextAdmin],
                  label: "Transfer market admin role",
                  summary: `Hand the Above market admin role to ${nextAdmin}. You lose control of market creation and fee settings.`,
                }}
              >
                Transfer market admin role
              </Action>
            )}
            {registryAdmin && (
              <Action
                disabled={!ready || !addressValid}
                spec={{
                  contract: "PimdRegistry",
                  fn: "transferAssetAdmin",
                  args: [nextAdmin],
                  label: "Transfer asset admin role",
                  summary: `Hand the registry asset admin role to ${nextAdmin}. You lose control of new asset versions and periods.`,
                }}
              >
                Transfer asset admin role
              </Action>
            )}
          </details>
        </>
      )}
    </section>
  );
}
