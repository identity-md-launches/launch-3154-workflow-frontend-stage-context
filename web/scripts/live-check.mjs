// Read-only diagnostics against the final runtime configuration. Never sends transactions.
import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const read = async (p) =>
  JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const manifest = await read("../../dist/imd-deployment.json");
const contracts = Object.fromEntries(
  await Promise.all(
    manifest.contracts.map(async (c) => [
      c.name,
      { ...c, abi: await read("../../dist/" + c.abiPath) },
    ]),
  ),
);
const quoter = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);
const report = {
  at: new Date().toISOString(),
  readOnly: true,
  sourceCommit: manifest.sourceCommit,
  results: [],
};
for (const url of manifest.network.rpcUrls) {
  const client = createPublicClient({
    transport: http(url, { timeout: 15000, retryCount: 0 }),
  });
  const result = { url };
  try {
    result.chainId = await client.getChainId();
    if (result.chainId !== manifest.chainId) throw Error("Wrong chain ID");
    result.contracts = await Promise.all(
      manifest.contracts.map(async (c) => ({
        name: c.name,
        address: c.address,
        codeBytes:
          ((await client.getCode({ address: c.address }))?.length ?? 2) / 2 - 1,
      })),
    );
    if (result.contracts.some((c) => c.codeBytes <= 0))
      throw Error("Missing deployed code");
    const a = contracts.PimdAbove,
      g = contracts.PimdRegistry;
    const names = [
      "marketCount",
      "admin",
      "owner",
      "takerRate",
      "makerRate",
      "registry",
      "oracle",
    ];
    result.above = Object.fromEntries(
      await Promise.all(
        names.map(async (functionName) => [
          functionName,
          String(
            await client.readContract({
              address: a.address,
              abi: a.abi,
              functionName,
            }),
          ),
        ]),
      ),
    );
    result.assetCount = String(
      await client.readContract({
        address: g.address,
        abi: g.abi,
        functionName: "assetCount",
      }),
    );
    result.periodCount = String(
      await client.readContract({
        address: g.address,
        abi: g.abi,
        functionName: "periodCount",
      }),
    );
    if (
      result.above.registry.toLowerCase() !== g.address.toLowerCase() ||
      result.above.oracle.toLowerCase() !==
        contracts.BoundaryOracle.address.toLowerCase()
    )
      throw Error("Wiring mismatch");
    if (manifest.poolKey) {
      try {
        const input = manifest.network.pairToken;
        const response = await client.simulateContract({
          address: manifest.network.uniswapV4.quoter,
          abi: quoter,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: manifest.poolKey,
              zeroForOne:
                input.address.toLowerCase() ===
                manifest.poolKey.currency0.toLowerCase(),
              exactAmount: 10n ** BigInt(input.decimals),
              hookData: "0x",
            },
          ],
        });
        result.quote = {
          input: `1 ${input.symbol}`,
          output: `${formatUnits(response.result[0], 18)} pIMD`,
          method: "eth_call",
          simulatedGas: String(response.result[1]),
        };
      } catch (e) {
        result.quote = { error: e.shortMessage ?? e.message };
      }
    }
    result.passed = true;
  } catch (e) {
    result.passed = false;
    result.error = e.shortMessage ?? e.message;
  }
  report.results.push(result);
}
await writeFile(
  new URL("../../docs/frontend/live-rpc.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (report.results.every((r) => !r.passed)) process.exitCode = 1;
