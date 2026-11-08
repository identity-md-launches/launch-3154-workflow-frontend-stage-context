import {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWalletClient,
  custom,
  formatEther,
  type Address,
  type Abi,
  type Hex,
  type EIP1193Provider,
} from "viem";
import { type Runtime, erc20Abi } from "./config";
import { errorMessage, fmt, type Market, type Order } from "./domain";
import { Modal, AddressText } from "./ui";
export const RuntimeContext = createContext<Runtime>(null!);
export const useRuntime = () => useContext(RuntimeContext);
export function useSession() {
  const r = useRuntime();
  const account = useAccount();
  const [provider, setProvider] = useState<EIP1193Provider>();
  useEffect(() => {
    let current = true;
    setProvider(undefined);
    if (account.connector)
      void account.connector
        .getProvider()
        .then((p) => {
          if (current) setProvider(p as EIP1193Provider);
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [account.connector]);
  const client = useMemo(
    () => r.client(account.chainId === r.chain.id ? provider : undefined),
    [r, provider, account.chainId],
  );
  return {
    ...account,
    provider,
    client,
    correctChain: account.chainId === r.chain.id,
  };
}
export function read<T>(
  client: ReturnType<Runtime["client"]>,
  contract: { address: Address; abi: Abi },
  functionName: string,
  args: readonly unknown[] = [],
) {
  return client.readContract({
    ...contract,
    functionName,
    args,
  } as never) as Promise<T>;
}
export type Asset = {
  version: number;
  token: Address;
  unitsPerShare: bigint;
  hops: number;
  path: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  }[];
  symbol: string;
  decimals: number;
};
export function useLaunch() {
  const r = useRuntime(),
    s = useSession();
  return useQuery({
    queryKey: ["launch", s.address, s.chainId],
    enabled: !!s.address && s.correctChain,
    staleTime: 15000,
    refetchInterval: 20000,
    retry: 1,
    queryFn: async () => {
      const chainId = await s.client.getChainId();
      if (chainId !== r.chain.id)
        throw Error(
          "The RPC returned the wrong chain. Transactions are unavailable.",
        );
      const codes = await Promise.all(
        r.deployment.contracts.map((c) =>
          s.client.getCode({ address: c.address }),
        ),
      );
      if (codes.some((c) => !c || c === "0x"))
        throw Error(
          "Deployment verification failed: a contract has no code. Transactions are unavailable.",
        );
      const above = r.contract("PimdAbove"),
        registry = r.contract("PimdRegistry");
      const [
        marketCount,
        assetCount,
        admin,
        assetAdmin,
        owner,
        free,
        taker,
        maker,
        periodCount,
        reg,
        oracle,
        block,
      ] = await Promise.all([
        read<bigint>(s.client, above, "marketCount"),
        read<bigint>(s.client, registry, "assetCount"),
        read<Address>(s.client, above, "admin"),
        read<Address>(s.client, registry, "assetAdmin"),
        read<Address>(s.client, above, "owner"),
        read<bigint>(s.client, above, "balance", [s.address]),
        read<bigint>(s.client, above, "takerRate"),
        read<bigint>(s.client, above, "makerRate"),
        read<bigint>(s.client, registry, "periodCount"),
        read<Address>(s.client, above, "registry"),
        read<Address>(s.client, above, "oracle"),
        s.client.getBlock(),
      ]);
      if (
        reg.toLowerCase() !== registry.address.toLowerCase() ||
        oracle.toLowerCase() !==
          r.contract("BoundaryOracle").address.toLowerCase()
      )
        throw Error("Contract wiring does not match the deployment.");
      const tokens: Address[] = [];
      for (let start = 0; start < Number(assetCount); start += 10)
        tokens.push(
          ...(await Promise.all(
            Array.from(
              { length: Math.min(10, Number(assetCount) - start) },
              (_, j) =>
                read<Address>(s.client, registry, "assets", [
                  BigInt(start + j),
                ]),
            ),
          )),
        );
      const assets = await Promise.all(
        tokens.map(async (token) => {
          const version = await read<number>(
            s.client,
            registry,
            "currentVersion",
            [token],
          );
          return readAsset(r, s.client, version);
        }),
      );
      const base = await readAsset(r, s.client, 1);
      let cursor = base.token;
      for (const p of base.path.slice(0, base.hops))
        cursor =
          cursor.toLowerCase() === p.currency0.toLowerCase()
            ? p.currency1
            : p.currency0;
      const usdc = cursor;
      const [usdcSymbol, usdcDecimals, walletUsdc] = await Promise.all([
        read<string>(s.client, { address: usdc, abi: erc20Abi }, "symbol"),
        read<number>(s.client, { address: usdc, abi: erc20Abi }, "decimals"),
        read<bigint>(s.client, { address: usdc, abi: erc20Abi }, "balanceOf", [
          s.address,
        ]),
      ]);
      if (usdcSymbol !== "USDC" || usdcDecimals !== 6)
        throw Error("Registry collateral metadata does not match USDC.");
      return {
        marketCount,
        assets,
        admin,
        assetAdmin,
        owner,
        free,
        taker,
        maker,
        periodCount,
        usdc,
        walletUsdc,
        imd: base.token,
        block: block.number!,
        now: block.timestamp,
        verified: true,
        updated: Date.now(),
      };
    },
  });
}
export async function readAsset(
  r: Runtime,
  client: ReturnType<Runtime["client"]>,
  version: number,
): Promise<Asset> {
  const a = await read<Asset>(client, r.contract("PimdRegistry"), "asset", [
    version,
  ]);
  const [symbol, decimals] = await Promise.all([
    read<string>(client, { address: a.token, abi: erc20Abi }, "symbol"),
    read<number>(client, { address: a.token, abi: erc20Abi }, "decimals"),
  ]);
  return { ...a, version, symbol, decimals };
}
export function useMarkets(count: bigint | undefined, limit: number) {
  const r = useRuntime(),
    s = useSession();
  return useQuery({
    queryKey: ["markets", s.address, count?.toString(), limit],
    enabled: s.correctChain && !!s.address && count !== undefined,
    refetchInterval: 20000,
    retry: 1,
    queryFn: async () => {
      const n = Math.min(Number(count), limit);
      const items: Market[] = [];
      const versions = new Map<number, Promise<Asset>>();
      for (let i = 0; i < n; i += 10) {
        items.push(
          ...(await Promise.all(
            Array.from({ length: Math.min(10, n - i) }, async (_, j) => {
              const id = await read<Hex>(
                s.client,
                r.contract("PimdAbove"),
                "marketIds",
                [BigInt(i + j)],
              );
              const m = await read<Market>(
                s.client,
                r.contract("PimdAbove"),
                "market",
                [id],
              );
              if (!versions.has(m.version))
                versions.set(m.version, readAsset(r, s.client, m.version));
              const a = await versions.get(m.version)!;
              return {
                ...m,
                id,
                token: a.token,
                symbol: a.symbol,
                unitsPerShare: a.unitsPerShare,
                tokenDecimals: a.decimals,
              };
            }),
          )),
        );
      }
      return items.sort(
        (a, b) => Number(a.end - b.end) || Number(a.threshold - b.threshold),
      );
    },
  });
}
// Best resting price per side for every market on the board, in `best(id, yes, buy)` order:
// [Yes bid, Yes ask, No bid, No ask]. Settled markets have no book to quote.
export type BoardQuotes = Record<string, (bigint | undefined)[] | undefined>;
export function useBoardQuotes(markets?: Market[]) {
  const r = useRuntime(),
    s = useSession();
  const open = (markets ?? []).filter((m) => m.outcome === 0);
  return useQuery({
    queryKey: ["boardQuotes", s.address, open.map((m) => m.id).join()],
    enabled: s.correctChain && !!s.address && open.length > 0,
    refetchInterval: 20000,
    retry: 1,
    queryFn: async () => {
      const c = r.contract("PimdAbove"),
        out: BoardQuotes = {};
      for (let i = 0; i < open.length; i += 5)
        await Promise.all(
          open.slice(i, i + 5).map(async (m) => {
            out[m.id] = await Promise.all(
              [
                [true, true],
                [true, false],
                [false, true],
                [false, false],
              ].map(async (flags) => {
                const id = await read<bigint>(s.client, c, "best", [
                  m.id,
                  ...flags,
                ]);
                return id
                  ? (await read<Order>(s.client, c, "order", [id])).price
                  : undefined;
              }),
            );
          }),
        );
      return out;
    },
  });
}
export function useMarketDetail(market?: Market) {
  const r = useRuntime(),
    s = useSession();
  return useQuery({
    queryKey: ["marketDetail", s.address, market?.id],
    enabled: s.correctChain && !!s.address && !!market,
    refetchInterval: 12000,
    retry: 1,
    queryFn: async () => {
      const m = market!,
        c = r.contract("PimdAbove");
      const [position, ids, asset, close, ...heads] = await Promise.all([
        read<readonly [bigint, bigint]>(s.client, c, "positions", [
          m.id,
          s.address,
        ]),
        read<bigint[]>(s.client, c, "ordersOf", [m.id, s.address]),
        readAsset(r, s.client, m.version),
        read<bigint>(s.client, r.contract("BoundaryOracle"), "price", [
          m.version,
          m.end,
        ]),
        ...[
          [true, true],
          [true, false],
          [false, true],
          [false, false],
        ].map((flags) => read<bigint>(s.client, c, "best", [m.id, ...flags])),
      ]);
      const mine = await Promise.all(
        ids.map(async (id) => ({
          ...(await read<Order>(s.client, c, "order", [id])),
          id,
        })),
      );
      const book = await Promise.all(
        heads.map(async (id) =>
          id
            ? { ...(await read<Order>(s.client, c, "order", [id])), id }
            : undefined,
        ),
      );
      return { position, mine, asset, close, book };
    },
  });
}
export function useToken(token?: Address, spender?: Address) {
  const s = useSession();
  return useQuery({
    queryKey: ["token", token, spender, s.address, s.chainId],
    enabled: !!token && !!s.address && s.correctChain,
    refetchInterval: 15000,
    retry: 1,
    queryFn: async () => {
      const c = { address: token!, abi: erc20Abi };
      const [balance, allowance, decimals, symbol] = await Promise.all([
        read<bigint>(s.client, c, "balanceOf", [s.address]),
        spender
          ? read<bigint>(s.client, c, "allowance", [s.address, spender])
          : Promise.resolve(0n),
        read<number>(s.client, c, "decimals"),
        read<string>(s.client, c, "symbol"),
      ]);
      return { balance, allowance, decimals, symbol };
    },
  });
}
export type TxSpec = {
  label: string;
  summary: string;
  contract?: string;
  address?: Address;
  abi?: Abi;
  fn: string;
  args?: readonly unknown[];
  value?: bigint;
};
type TxState = {
  phase:
    | "idle"
    | "simulating"
    | "review"
    | "signing"
    | "pending"
    | "success"
    | "error";
  label: string;
  message?: string;
  hash?: Hex;
};
const TxContext = createContext<{
  state: TxState;
  busy: boolean;
  prepare: (spec: TxSpec) => Promise<void>;
  dismiss: () => void;
}>(null!);
export const useTx = () => useContext(TxContext);
export function TransactionProvider({ children }: { children: ReactNode }) {
  const r = useRuntime(),
    s = useSession(),
    query = useQueryClient();
  const [state, setState] = useState<TxState>({ phase: "idle", label: "" });
  const [review, setReview] = useState<{
    spec: TxSpec;
    gas: bigint;
    account: Address;
  }>();
  const lock = useRef(false);
  const busy = ["simulating", "review", "signing", "pending"].includes(
    state.phase,
  );
  async function ensure(account: Address) {
    if (
      !s.provider ||
      !s.correctChain ||
      s.address?.toLowerCase() !== account.toLowerCase()
    )
      throw Error(
        "Connect the same wallet on the configured chain, then try again.",
      );
    const chain = await s.provider.request({ method: "eth_chainId" });
    const accounts = await s.provider.request({ method: "eth_accounts" });
    if (
      Number(chain) !== r.chain.id ||
      !accounts.some((a) => a.toLowerCase() === account.toLowerCase())
    )
      throw Error(
        "The wallet account or network changed. Review the action again.",
      );
    if ((await s.client.getChainId()) !== r.chain.id)
      throw Error("The RPC returned the wrong chain.");
  }
  function target(spec: TxSpec) {
    return spec.contract
      ? r.contract(spec.contract)
      : { address: spec.address!, abi: spec.abi! };
  }
  async function prepare(spec: TxSpec) {
    if (lock.current) return;
    lock.current = true;
    setState({
      phase: "simulating",
      label: spec.label,
      message: "Checking current state and estimating gas…",
    });
    try {
      const account = s.address!;
      await ensure(account);
      const c = target(spec);
      if (
        !c.address ||
        !(await s.client.getCode({ address: c.address }))?.replace(/^0x$/, "")
      )
        throw Error("No contract code at this destination.");
      const simulation = await s.client.simulateContract({
        ...c,
        functionName: spec.fn,
        args: spec.args ?? [],
        account,
        value: spec.value ?? 0n,
      } as never);
      const [gas, price] = await Promise.all([
        s.client.estimateContractGas(simulation.request as never),
        s.client.getGasPrice(),
      ]);
      setReview({ spec, gas: gas * price, account });
      setState({ phase: "review", label: spec.label });
    } catch (e) {
      setState({ phase: "error", label: spec.label, message: errorMessage(e) });
      lock.current = false;
    }
  }
  async function submit() {
    if (!review) return;
    const { spec, account } = review;
    setReview(undefined);
    let hash: Hex | undefined;
    let replacedAction = false;
    try {
      setState({
        phase: "signing",
        label: spec.label,
        message: "Confirm in your wallet.",
      });
      await ensure(account);
      const simulation = await s.client.simulateContract({
        ...target(spec),
        functionName: spec.fn,
        args: spec.args ?? [],
        account,
        value: spec.value ?? 0n,
      } as never);
      await ensure(account);
      const wallet = createWalletClient({
        account,
        chain: r.chain,
        transport: custom(s.provider!),
      });
      hash = await wallet.writeContract({
        ...simulation.request,
        chain: r.chain,
        account,
      } as never);
      setState({
        phase: "pending",
        label: spec.label,
        hash,
        message: "Submitted. Waiting for on-chain confirmation…",
      });
      const receipt = await s.client.waitForTransactionReceipt({
        hash,
        timeout: 180000,
        onReplaced: (replacement) => {
          hash = replacement.transaction.hash;
          replacedAction = replacement.reason !== "repriced";
          setState({
            phase: "pending",
            label: spec.label,
            hash,
            message:
              replacement.reason === "cancelled"
                ? "Cancellation detected. Checking receipt…"
                : "Replacement detected. Checking receipt…",
          });
        },
      });
      if (replacedAction)
        throw Error(
          "This action was replaced or cancelled in your wallet. Check the replacement transaction before retrying.",
        );
      if (receipt.status !== "success")
        throw Error(
          "The transaction reverted on chain. Your wallet can show gas spent. Refresh and try again.",
        );
      if (receipt.to?.toLowerCase() !== target(spec).address.toLowerCase())
        throw Error(
          "The transaction was replaced or cancelled. Check the explorer before retrying.",
        );
      // A confirmed receipt stays confirmed; only claim fresh balances when every refetch succeeded.
      const refreshed = await query
        .invalidateQueries(undefined, { throwOnError: true })
        .then(
          () => true,
          () => false,
        );
      setState({
        phase: "success",
        label: spec.label,
        hash,
        message: refreshed
          ? `Confirmed in block ${receipt.blockNumber}. Balances refreshed.`
          : `Transaction confirmed in block ${receipt.blockNumber}. Balance refresh failed, so balances shown may be out of date. Retry the failed reads or reload the page.`,
      });
    } catch (e) {
      setState({
        phase: "error",
        label: spec.label,
        hash,
        message: hash
          ? `Transaction submitted. ${errorMessage(e)} Check its explorer status before retrying.`
          : errorMessage(e),
      });
    } finally {
      lock.current = false;
    }
  }
  const cancel = () => {
    setReview(undefined);
    setState({ phase: "idle", label: "" });
    lock.current = false;
  };
  return (
    <TxContext.Provider
      value={{
        state,
        busy,
        prepare,
        dismiss: () => setState({ phase: "idle", label: "" }),
      }}
    >
      {children}
      <div
        className={`tx-status ${state.phase}`}
        role={state.phase === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {state.phase !== "idle" && state.phase !== "review" && (
          <>
            <strong>{state.label}</strong>
            <p>{state.message}</p>
            {state.hash && (
              <a
                href={`${r.deployment.network.explorer}/tx/${state.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction ↗
              </a>
            )}
            {!busy && (
              <button
                aria-label="Dismiss transaction status"
                onClick={() => setState({ phase: "idle", label: "" })}
              >
                Dismiss
              </button>
            )}
          </>
        )}
      </div>
      {review && (
        <Modal title={`Review: ${review.spec.label}`} close={cancel}>
          <p>{review.spec.summary}</p>
          <dl className="facts">
            <div>
              <dt>Network</dt>
              <dd>{r.chain.name}</dd>
            </div>
            <div>
              <dt>Estimated gas cost</dt>
              <dd>{formatEther(review.gas)} ETH</dd>
            </div>
            <div>
              <dt>Native value</dt>
              <dd>{fmt(review.spec.value ?? 0n, 18)} ETH</dd>
            </div>
          </dl>
          <p className="muted">Destination</p>
          <AddressText address={target(review.spec).address} />
          <p className="muted">
            State may change before inclusion. Your wallet shows the final
            network fee.
          </p>
          <button className="primary full" onClick={() => void submit()}>
            Confirm in wallet
          </button>
        </Modal>
      )}
    </TxContext.Provider>
  );
}
