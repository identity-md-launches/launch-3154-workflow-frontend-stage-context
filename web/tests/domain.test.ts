import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeAbiParameters,
  parseAbiParameters,
  keccak256,
  stringToHex,
  type Address,
} from "viem";
import {
  amount,
  feePreview,
  previewMatch,
  marketLabel,
  type Order,
} from "../src/domain";
import { swapPayload } from "../src/swap";
const handoff = JSON.parse(
  readFileSync(new URL("../deployment/handoff.json", import.meta.url), "utf8"),
);
test("amounts reject rounding, scientific notation, negative, zero and unsafe bounds", () => {
  assert.equal(amount("1.000001"), 1000001n);
  for (const v of [
    "1.0000001",
    "1e6",
    "-1",
    "0",
    "NaN",
    "01",
    "1,000",
    "Infinity",
  ])
    assert.throws(() => amount(v));
  assert.equal(amount("0.000000000000000001", 18), 1n);
});
test("fee estimates keep fee inside the lock and respect clamped q", () => {
  const p = feePreview(10000000n, 400000n, 500n, true);
  assert.equal(p.lock, 4000000n);
  assert.equal(p.shares, 9700000n);
  assert.equal(p.fee, 120000n);
  assert.equal(feePreview(10000000n, 400000n, 500n, false).proceeds, 3880000n);
});
test("approved Above Vika/Bob example to four decimals, including refund and fees", () => {
  const maker = {
    id: 1n,
    price: 400000n,
    remaining: 10000000n,
    lock: 4000000n,
    buy: true,
    yes: true,
  } as Order;
  const taker = {
    id: 2n,
    price: 620000n,
    remaining: 2n ** 128n - 1n,
    lock: 6000000n,
    buy: true,
    yes: false,
  } as Order;
  const fill = previewMatch([maker, undefined, taker, undefined], 500n, 100n)!;
  const four = (n: bigint) => (Number(n) / 1e6).toFixed(4);
  assert.equal(four(fill.shares), "9.8000");
  assert.equal(four(fill.takerFee), "0.1200");
  assert.equal(four(fill.makerFee), "0.0237");
  assert.equal(four(fill.makerAmount), "3.9437");
  assert.equal(four(maker.lock - fill.makerAmount), "0.0563");
  assert.equal(four(fill.makerFee + fill.takerFee), "0.1437");
  assert.equal(fill.gap, 0n);
});
test("threshold display converts USD per U to USD per token", () => {
  assert.equal(
    marketLabel({
      version: 1,
      threshold: 10n ** 18n,
      unitsPerShare: 10000n * 10n ** 18n,
      tokenDecimals: 18,
      symbol: "YOLO",
    } as any),
    "YOLO above $0.0001",
  );
});
for (const extended of [false, true])
  test(`router encoding matches exact attested pool, ${extended ? "six" : "five"} fields`, () => {
    const k = handoff.poolKey;
    const data = swapPayload(k, k.currency1, 10n, 8n, extended);
    assert.equal(data.commands, "0x10");
    assert.equal(data.zeroForOne, false);
    const [actions, params] = decodeAbiParameters(
      parseAbiParameters("bytes,bytes[]"),
      data.inputs[0],
    );
    assert.equal(actions, "0x060c0f");
    const [swap] = decodeAbiParameters(
      parseAbiParameters(
        `((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,${extended ? "uint256 extra," : ""}bytes hookData)`,
      ),
      params[0],
    ) as any;
    assert.equal(swap.poolKey.hooks.toLowerCase(), k.hooks);
    assert.equal(swap.amountIn, 10n);
    assert.equal(swap.amountOutMinimum, 8n);
    if (extended) assert.equal(swap.extra, 0n);
    const [inCurrency] = decodeAbiParameters(
      parseAbiParameters("address,uint256"),
      params[1],
    );
    assert.equal(inCurrency.toLowerCase(), k.currency1);
    const [outCurrency, min] = decodeAbiParameters(
      parseAbiParameters("address,uint256"),
      params[2],
    );
    assert.equal(outCurrency.toLowerCase(), k.currency0);
    assert.equal(min, 8n);
  });
test("pool direction follows currency ordering on either side", () => {
  const k = handoff.poolKey;
  assert.equal(swapPayload(k, k.currency0, 1n, 1n).zeroForOne, true);
  assert.throws(() =>
    swapPayload(k, "0x1111111111111111111111111111111111111111", 1n, 1n),
  );
});
