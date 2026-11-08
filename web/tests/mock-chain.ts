// Deterministic test fixtures only. No provider in this file broadcasts to a network.
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  numberToHex,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from "viem";
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
export const manifest = read("../../dist/imd-deployment.json");
export const ACCOUNT = "0x1111111111111111111111111111111111111111" as Address;
export const ADMIN = "0x8ad18e99f4c8d8406f9ba8899cf308000518a981" as Address;
export const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
export const MID = ("0x" + "ab".repeat(32)) as Hex;
const HASH = ("0x" + "cd".repeat(32)) as Hex;
const BLOCK = ("0x" + "ef".repeat(32)) as Hex;
const ABI: Record<string, Abi> = {};
const names: Record<string, string> = {};
for (const c of manifest.contracts) {
  ABI[c.address.toLowerCase()] = read("../../dist/" + c.abiPath);
  names[c.address.toLowerCase()] = c.name;
}
const protocol = manifest.network.uniswapV4;
ABI[protocol.permit2] = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
ABI[protocol.quoter] = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
ABI[protocol.universalRouter] = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const address = (name: string) =>
  manifest.contracts.find((c: { name: string }) => c.name === name)
    .address as Address;
export function createMockChain() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const state = {
    account: ACCOUNT,
    chain: "0xa",
    connected: false,
    unknownChain: true,
    failSwitch: false,
    reject: false,
    revert: false,
    missingCode: false,
    rpcError: false,
    empty: false,
    settled: false,
    ended: false,
    oracleClose: 0n,
    allowance: 0n,
    permit: 0n,
    free: 100_000_000n,
    balance: 200_000_000n,
    yes: 20_000_000n,
    no: 20_000_000n,
    nonce: 0,
    writes: [] as {
      to: Address;
      functionName: string;
      args: readonly unknown[];
      value?: Hex;
    }[],
    requests: [] as { method: string; params: unknown[] }[],
    lastTo: address("PimdAbove"),
    cancelled: false,
    now,
  };
  const listeners = new Map<string, Set<(v: unknown) => void>>();
  const emit = (type: string, v: unknown) => {
    listeners.get(type)?.forEach((cb) => cb(v));
  };
  const path = [
    {
      currency0: ZERO,
      currency1: manifest.network.pairToken.address,
      fee: 10000,
      tickSpacing: 200,
      hooks: ZERO,
    },
    {
      currency0: ZERO,
      currency1: USDC,
      fee: 500,
      tickSpacing: 10,
      hooks: ZERO,
    },
    { currency0: ZERO, currency1: ZERO, fee: 0, tickSpacing: 0, hooks: ZERO },
  ];
  const getOrder = (id: bigint) => ({
    market: MID,
    trader: state.account,
    yes: id === 1n,
    buy: true,
    resting: true,
    expiry: now + 86400n,
    previous: 0n,
    next: 0n,
    fills: 0,
    price: id === 1n ? 400000n : 620000n,
    remaining: id === 1n ? 10000000n : 2n ** 128n - 1n,
    lock: id === 1n ? 4000000n : 6000000n,
  });
  const block = () => ({
    number: "0x1929f00",
    hash: BLOCK,
    parentHash: BLOCK,
    nonce: "0x0000000000000000",
    sha3Uncles: BLOCK,
    logsBloom: "0x" + "00".repeat(256),
    transactionsRoot: BLOCK,
    stateRoot: BLOCK,
    receiptsRoot: BLOCK,
    miner: ACCOUNT,
    difficulty: "0x0",
    totalDifficulty: "0x0",
    extraData: "0x",
    size: "0x200",
    gasLimit: "0x1c9c380",
    gasUsed: "0x10000",
    timestamp: numberToHex(now),
    transactions: [],
    uncles: [],
    baseFeePerGas: "0x3b9aca00",
    mixHash: BLOCK,
  });
  function decode(to: string, data: Hex) {
    const abi = ABI[to.toLowerCase()] ?? erc20Abi;
    return { abi, ...decodeFunctionData({ abi, data }) };
  }
  function contractCall(to: string, data: Hex) {
    const { abi, functionName: fn, args = [] } = decode(to, data);
    const name = names[to.toLowerCase()];
    const item = abi.find(
      (a: any) => a.type === "function" && a.name === fn,
    ) as any;
    const write =
      item?.stateMutability === "nonpayable" ||
      item?.stateMutability === "payable";
    if (state.revert && write)
      throw Object.assign(Error("execution reverted: InvalidOrder"), {
        code: 3,
      });
    let result: any;
    if (fn === "quoteExactInputSingle") result = [200n * 10n ** 18n, 100000n];
    else if (fn === "marketCount") result = state.empty ? 0n : 1n;
    else if (fn === "assetCount") result = 1n;
    else if (fn === "assetVersionCount" || fn === "currentVersion") result = 1;
    else if (fn === "assets") result = manifest.network.pairToken.address;
    else if (fn === "asset")
      result = {
        token: manifest.network.pairToken.address,
        unitsPerShare: 10n ** 18n,
        maxOpenPairs: 0n,
        hops: 2,
        path,
      };
    else if (fn === "admin" || fn === "assetAdmin") result = ADMIN;
    else if (fn === "owner")
      result = "0x3c587eff6c96eacf7e3dcc2cff6416161386e48c";
    else if (fn === "registry") result = address("PimdRegistry");
    else if (fn === "oracle") result = address("BoundaryOracle");
    else if (fn === "balance") result = state.free;
    else if (fn === "takerRate") result = 500n;
    else if (fn === "makerRate") result = 100n;
    else if (fn === "periodCount") result = 4n;
    else if (fn === "periods") result = [3600, 0, false];
    else if (fn === "symbol")
      result =
        to.toLowerCase() === USDC
          ? "USDC"
          : name === "LaunchToken"
            ? "pIMD"
            : "IMD";
    else if (fn === "decimals") result = to.toLowerCase() === USDC ? 6 : 18;
    else if (fn === "balanceOf")
      result = to.toLowerCase() === USDC ? state.balance : 1000n * 10n ** 18n;
    else if (fn === "totalSupply") result = 1_000_000_000n * 10n ** 18n;
    else if (fn === "allowance")
      result =
        to.toLowerCase() === protocol.permit2
          ? [state.permit, Number(now + 3600n), 0]
          : state.allowance;
    else if (
      fn === "marketIds" ||
      fn === "marketId" ||
      fn === "proposalId" ||
      fn === "key"
    )
      result = MID;
    else if (fn === "market")
      result = {
        version: 1,
        period: 1,
        end: state.settled || state.ended ? now - 3600n : now + 86400n,
        threshold: 3n * 10n ** 18n,
        close: state.settled ? 4n * 10n ** 18n : 0n,
        pairs: 50000000n,
        outcome: state.settled ? 1 : 0,
      };
    else if (fn === "positions") result = [state.yes, state.no];
    else if (fn === "ordersOf") result = state.cancelled ? [] : [1n];
    else if (fn === "order") result = getOrder(BigInt(args[0] as bigint));
    else if (fn === "best") result = args[2] ? (args[1] ? 1n : 2n) : 0n;
    else if (fn === "price")
      result = name === "BoundaryOracle" ? state.oracleClose : 0n;
    else if (fn === "oracleCost")
      result = [500000000000000000n, 1000000000000000000n];
    else if (fn === "BOND") result = 10n ** 19n;
    else if (fn === "PROOF_WINDOW") result = 97200n;
    else if (fn === "TIMEOUT") result = 259200n;
    else if (fn === "REQUEST_TTL") result = 86400n;
    else if (fn === "isBoundary") result = true;
    else if (fn === "credit") result = 0n;
    else if (fn === "pending")
      result = {
        requester: ZERO,
        firstBlock: 0n,
        boundary: 0n,
        requestedAt: 0n,
        version: 1,
        received: 0,
        open: false,
        anchorHash: MID,
        answers: [0n, 0n, 0n],
        requests: [MID, MID, MID],
      };
    else if (fn === "proposal")
      result = {
        proposer: ZERO,
        challenger: ZERO,
        feePayer: ZERO,
        deadline: 0n,
        firstBlock: 0n,
        boundary: 0n,
        version: 1,
        received: 0,
        finished: false,
        requested: false,
        proposed: 0n,
        cost: 0n,
        anchorHash: MID,
        answers: [0n, 0n, 0n],
        requests: [MID, MID, MID],
      };
    else if (fn === "approve" || fn === "transfer" || fn === "transferFrom")
      result = true;
    else if (
      fn === "place" ||
      fn === "matchMarket" ||
      fn === "claim" ||
      fn === "exactOutput" ||
      fn === "exactOutputAsset"
    )
      result = 1n;
    else if (fn === "createMarket") result = MID;
    else if (fn === "addPeriod" || fn === "configureAsset") result = 2;
    else if (item?.outputs?.length === 0) return "0x";
    else throw Error("Unhandled mock read " + name + "." + fn);
    return encodeFunctionResult({ abi, functionName: fn, result } as never);
  }
  async function rpc({
    method,
    params = [],
  }: {
    method: string;
    params?: any[];
  }): Promise<any> {
    state.requests.push({ method, params });
    if (state.rpcError && ["eth_call", "eth_getCode"].includes(method))
      throw Error("Mock RPC unavailable");
    switch (method) {
      case "eth_chainId":
        return state.chain;
      case "eth_accounts":
        return state.connected ? [state.account] : [];
      case "eth_requestAccounts":
        if (state.reject)
          throw Object.assign(Error("User rejected the request"), {
            code: 4001,
          });
        state.connected = true;
        return [state.account];
      case "wallet_switchEthereumChain":
        if (state.failSwitch)
          throw Object.assign(Error("User rejected network switch"), {
            code: 4001,
          });
        if (state.unknownChain)
          throw Object.assign(Error("Unknown chain"), { code: 4902 });
        state.chain = params[0].chainId;
        emit("chainChanged", state.chain);
        return null;
      case "wallet_addEthereumChain":
        state.unknownChain = false;
        return null;
      case "eth_getCode":
        return state.missingCode ? "0x" : "0x6001600055";
      case "eth_getBlockByNumber":
      case "eth_getBlockByHash":
        return block();
      case "eth_blockNumber":
        return "0x1929f00";
      case "eth_gasPrice":
        return "0x3b9aca00";
      case "eth_maxPriorityFeePerGas":
        return "0x1";
      case "eth_estimateGas":
        return "0x186a0";
      case "eth_call":
        return contractCall(params[0].to, params[0].data);
      case "wallet_getCapabilities":
        return {};
      case "eth_getTransactionCount":
        return "0x0";
      case "eth_sendTransaction": {
        if (state.reject)
          throw Object.assign(Error("User rejected the request"), {
            code: 4001,
          });
        const { functionName: fn, args = [] } = decode(
          params[0].to,
          params[0].data,
        );
        state.writes.push({
          to: params[0].to,
          functionName: fn,
          args,
          value: params[0].value,
        });
        state.lastTo = params[0].to;
        state.nonce++;
        if (fn === "approve") {
          if (params[0].to.toLowerCase() === protocol.permit2)
            state.permit = BigInt(args[2] as bigint);
          else state.allowance = BigInt(args[1] as bigint);
        }
        if (fn === "deposit") {
          state.free += BigInt(args[0] as bigint);
          state.balance -= BigInt(args[0] as bigint);
        }
        if (fn === "withdraw") state.free -= BigInt(args[0] as bigint);
        if (fn === "cancel") state.cancelled = true;
        if (fn === "settle") state.settled = true;
        if (fn === "claim") {
          state.free += state.yes;
          state.yes = 0n;
          state.no = 0n;
        }
        return HASH;
      }
      case "eth_getTransactionReceipt":
        return {
          transactionHash: HASH,
          transactionIndex: "0x0",
          blockHash: BLOCK,
          blockNumber: "0x1929f00",
          from: state.account,
          to: state.lastTo,
          cumulativeGasUsed: "0x186a0",
          gasUsed: "0x186a0",
          effectiveGasPrice: "0x3b9aca00",
          contractAddress: null,
          logs: [],
          logsBloom: "0x" + "00".repeat(256),
          status: "0x1",
          type: "0x2",
        };
      default:
        throw Error("Unhandled mock RPC " + method);
    }
  }
  const provider = {
    request: rpc,
    on: (event: string, cb: (v: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    removeListener: (event: string, cb: (v: unknown) => void) =>
      listeners.get(event)?.delete(cb),
  };
  return {
    state,
    provider,
    rpc,
    emit,
    publicRpc: (args: any) =>
      args.method === "eth_chainId" ? Promise.resolve("0x1") : rpc(args),
  };
}
