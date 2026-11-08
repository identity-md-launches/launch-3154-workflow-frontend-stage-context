import { encodeAbiParameters, parseAbiParameters, type Address } from "viem";
import { type PoolKey } from "./config";
export function swapPayload(
  poolKey: PoolKey,
  input: Address,
  amountIn: bigint,
  minimum: bigint,
  extended = false,
) {
  const zeroForOne = input.toLowerCase() === poolKey.currency0.toLowerCase();
  if (!zeroForOne && input.toLowerCase() !== poolKey.currency1.toLowerCase())
    throw Error("Input token is not in the attested pool.");
  const output = zeroForOne ? poolKey.currency1 : poolKey.currency0;
  const type = `((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 minHopPriceX36," : ""}bytes hookData)`;
  const swap = encodeAbiParameters(parseAbiParameters(type), [
    extended
      ? {
          poolKey,
          zeroForOne,
          amountIn,
          amountOutMinimum: minimum,
          minHopPriceX36: 0n,
          hookData: "0x",
        }
      : {
          poolKey,
          zeroForOne,
          amountIn,
          amountOutMinimum: minimum,
          hookData: "0x",
        },
  ] as never);
  const settle = encodeAbiParameters(
    parseAbiParameters("address currency,uint256 amount"),
    [input, amountIn],
  );
  const take = encodeAbiParameters(
    parseAbiParameters("address currency,uint256 amount"),
    [output, minimum],
  );
  return {
    commands: "0x10" as const,
    inputs: [
      encodeAbiParameters(parseAbiParameters("bytes actions,bytes[] params"), [
        "0x060c0f",
        [swap, settle, take],
      ]),
    ],
    zeroForOne,
    output,
  };
}
