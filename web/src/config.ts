import { createConfig, http, fallback } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import {
  createPublicClient,
  custom,
  defineChain,
  keccak256,
  stringToHex,
  erc20Abi,
  parseAbi,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  poolKey?: PoolKey;
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken: {
      address: Address;
      symbol: string;
      name: string;
      decimals: number;
    };
    otherPairTokens?: { address: Address; symbol: string; decimals: number }[];
  };
  walletAddChain?: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
export function canonical(v: unknown): string {
  return JSON.stringify(sort(v));
}
function sort(v: unknown): unknown {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, sort(x)]),
        )
      : v;
}
const safePath = (p: string) =>
  !!p &&
  !p.startsWith("/") &&
  !p.includes("..") &&
  !p.includes(":") &&
  !p.includes("\\");
export async function loadRuntime() {
  const fetchJson = async (path: string) => {
    const r = await fetch(new URL(path, document.baseURI));
    if (!r.ok)
      throw Error(`Cannot load ${path}. Retry or check the static export.`);
    return r.json();
  };
  const deployment = (await fetchJson("imd-deployment.json")) as Deployment;
  const allowed = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ];
  if (
    Object.keys(deployment).some((k) => !allowed.includes(k)) ||
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network?.chainId ||
    !deployment.contracts?.length ||
    deployment.assets.length > 128
  )
    throw Error(
      "The deployment configuration is invalid. Transactions are unavailable.",
    );
  const abis: Record<string, Abi> = {};
  for (const c of deployment.contracts) {
    if (!safePath(c.abiPath)) throw Error("Unsafe ABI path.");
    const a = await fetchJson(c.abiPath);
    if (
      !Array.isArray(a) ||
      keccak256(stringToHex(canonical(a))).slice(2) !== c.abiHash
    )
      throw Error(`ABI verification failed for ${c.name}.`);
    abis[c.name] = a;
  }
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: "Explorer", url: deployment.network.explorer },
    },
    testnet: deployment.network.testnet,
  });
  const rpc = () =>
    deployment.network.rpcUrls.map((url) =>
      http(url, { timeout: 10000, retryCount: 0, batch: false }),
    );
  const client = (provider?: EIP1193Provider) =>
    createPublicClient({
      chain,
      transport: fallback(
        [...rpc(), ...(provider ? [custom(provider, { retryCount: 0 })] : [])],
        { rank: false, retryCount: 0 },
      ),
      batch: { multicall: false },
    });
  const config = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    storage: null,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: "(p)IMD Prediction markets",
        preference: "smartWalletOnly",
      }),
    ],
    transports: { [chain.id]: fallback(rpc()) },
  });
  const contract = (name: string) => {
    const c = deployment.contracts.find((c) => c.name === name);
    if (!c) throw Error(`${name} is not in this deployment.`);
    return { address: c.address, abi: abis[name] };
  };
  return { deployment, chain, client, config, contract };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
// Protocol interfaces, with no addresses; all targets come from the runtime manifest or registry reads.
export { erc20Abi };
export const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
