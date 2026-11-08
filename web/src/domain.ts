import { formatUnits, parseUnits, type Address, type Hex } from "viem";
export const SHARE = 1_000_000n;
export function amount(text: string, decimals = 6): bigint {
  text = text.trim();
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text))
    throw Error("Enter a positive amount using digits and a decimal point.");
  const frac = text.split(".")[1]?.length ?? 0;
  if (frac > decimals)
    throw Error(`Use no more than ${decimals} decimal places.`);
  const n = parseUnits(text, decimals);
  if (n <= 0n || n >= 2n ** 128n)
    throw Error(
      "Enter an amount greater than zero within the supported range.",
    );
  return n;
}
export const fmt = (n: bigint | undefined, decimals = 6) =>
  n === undefined ? "Not loaded" : formatUnits(n, decimals);
export const min = (a: bigint, b: bigint) => (a < b ? a : b);
export const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
export const utc = (s: bigint | number) =>
  new Date(Number(s) * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
export function feePreview(
  quantity: bigint,
  price: bigint,
  rate: bigint,
  buy: boolean,
  spend?: bigint,
) {
  const q = price < 10000n ? 10000n : price > 990000n ? 990000n : price;
  const r = rate * (SHARE - q),
    R = 10_000_000_000n;
  const lock = spend ?? (quantity * price) / SHARE;
  let shares = buy
    ? min(
        spend ? 2n ** 128n - 1n : quantity,
        (((lock * (R - r)) / R) * SHARE) / price,
      )
    : quantity;
  let base = (shares * price + SHARE - 1n) / SHARE;
  let fee = buy
    ? (base * r + R - r - 1n) / (R - r)
    : (((quantity * price) / SHARE) * r + R - 1n) / R;
  while (buy && shares > 0n && base + fee > lock) {
    shares--;
    base = (shares * price + SHARE - 1n) / SHARE;
    fee = (base * r + R - r - 1n) / (R - r);
  }
  return { lock, shares, fee, proceeds: (quantity * price) / SHARE - fee };
}
export type Market = {
  id: Hex;
  version: number;
  period: number;
  end: bigint;
  threshold: bigint;
  close: bigint;
  pairs: bigint;
  outcome: number;
  token?: Address;
  symbol?: string;
  unitsPerShare?: bigint;
  tokenDecimals?: number;
};
export type Order = {
  id: bigint;
  market: Hex;
  trader: Address;
  yes: boolean;
  buy: boolean;
  resting: boolean;
  expiry: bigint;
  previous: bigint;
  next: bigint;
  fills: number;
  price: bigint;
  remaining: bigint;
  lock: bigint;
};
export const errorMessage = (e: unknown) => {
  const x = e as { shortMessage?: string; message?: string };
  const t = x.shortMessage || x.message || String(e);
  if (/rejected|denied|4001/i.test(t))
    return "Request declined in your wallet. No new transaction was submitted.";
  const names: Record<string, string> = {
    InsufficientBalance:
      "Your free balance is too low. Deposit funds or reduce the amount.",
    InvalidOrder: "Check the price tick, minimum order and expiry, then retry.",
    InvalidMarket:
      "This market is unavailable for that action. Refresh its state.",
    MissingPrice:
      "The closing price is not recorded yet. Retry after the oracle resolves.",
    Unauthorized:
      "This wallet does not hold the required role or own this order.",
    InvalidState:
      "The oracle or market is not ready for this action. Refresh its state and check the timing.",
    InvalidPayment: "The oracle payment changed. Reload the current cost.",
    InvalidConfiguration: "Check the asset path, units and pool parameters.",
    InvalidRate: "Use a taker rate at most 0.10 and a maker rate at most 0.05.",
  };
  for (const [k, v] of Object.entries(names)) if (t.includes(k)) return v;
  return t.length > 350 ? t.slice(0, 350) + "…" : t;
};

export function marketLabel(m: Market) {
  const perToken =
    m.unitsPerShare && m.tokenDecimals !== undefined
      ? (m.threshold * 10n ** BigInt(m.tokenDecimals) * 10n ** 24n) /
        m.unitsPerShare
      : undefined;
  return perToken === undefined
    ? `Version ${m.version} above ${fmt(m.threshold, 18)} USD / U`
    : `${m.symbol} above $${fmt(perToken, 42)}`;
}
export function previewMatch(
  book: (Order | undefined)[],
  takerRate: bigint,
  makerRate: bigint,
) {
  const [yb, ys, nb, ns] = book;
  let pair: Order[] | undefined;
  if (yb && ys && yb.price >= ys.price) pair = [yb, ys];
  else if (nb && ns && nb.price >= ns.price) pair = [nb, ns];
  else if (yb && nb && yb.price + nb.price >= SHARE) pair = [yb, nb];
  else if (ys && ns && ys.price + ns.price <= SHARE) pair = [ys, ns];
  if (!pair) return undefined;
  const [mk, tk] = pair.sort((a, b) => (a.id < b.id ? -1 : 1)),
    mint = mk.buy && tk.buy,
    burn = !mk.buy && !tk.buy;
  const mp = mk.price,
    tp = mint || burn ? SHARE - mp : mp,
    R = 10_000_000_000n;
  const rate = (p: bigint, k: bigint) =>
    k * (SHARE - (p < 10000n ? 10000n : p > 990000n ? 990000n : p));
  const mr = rate(mp, makerRate),
    tr = rate(tp, takerRate);
  const cost = (n: bigint, p: bigint, r: bigint) => {
    const base = (n * p + SHARE - 1n) / SHARE;
    const fee = (base * r + R - r - 1n) / (R - r);
    return { amount: base + fee, fee };
  };
  const affordable = (o: Order, p: bigint, r: bigint) => {
    if (!o.buy) return o.remaining;
    let n = (((o.lock * (R - r)) / R) * SHARE) / p;
    while (n > 0n && cost(n, p, r).amount > o.lock) n--;
    return min(n, o.remaining);
  };
  const n = min(affordable(mk, mp, mr), affordable(tk, tp, tr));
  if (!n)
    return {
      shares: 0n,
      gap: 0n,
      makerFee: 0n,
      takerFee: 0n,
      makerAmount: 0n,
      takerAmount: 0n,
    };
  const mc = mk.buy
    ? cost(n, mp, mr)
    : { amount: (n * mp) / SHARE, fee: (((n * mp) / SHARE) * mr + R - 1n) / R };
  const base = mint
    ? n - (mc.amount - mc.fee)
    : burn
      ? n - mc.amount
      : (n * tp) / SHARE;
  const tc = tk.buy
    ? mint
      ? {
          amount: base + (base * tr + R - tr - 1n) / (R - tr),
          fee: (base * tr + R - tr - 1n) / (R - tr),
        }
      : cost(n, tp, tr)
    : { amount: base, fee: (base * tr + R - 1n) / R };
  const limit = (n * tk.price) / SHARE;
  const gap = tk.buy
    ? tk.remaining === 2n ** 128n - 1n
      ? 0n
      : limit > tc.amount
        ? min(limit - tc.amount, tk.lock - tc.amount)
        : 0n
    : tc.amount - tc.fee > limit
      ? tc.amount - tc.fee - limit
      : 0n;
  return {
    shares: n,
    gap,
    makerFee: mc.fee,
    takerFee: tc.fee,
    makerAmount: mc.amount,
    takerAmount: tc.amount,
  };
}
