// Computes contrast from declared CSS tokens; this is not a rendered measurement.
import { readFile, writeFile } from "node:fs/promises";
const css = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const tokens = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{3,6}|var\(--[\w-]+\))/gi)].map(
    (m) => [m[1], m[2]],
  ),
);
const resolve = (x) =>
  x.startsWith("#")
    ? x.length === 4
      ? "#" + [...x.slice(1)].map((c) => c + c).join("")
      : x
    : resolve(tokens[x.replace(/^var\(--|\)$/g, "")]);
const lum = (x) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(x.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
const pairs = [
  ["text", "page"],
  ["text", "surface"],
  ["muted", "page"],
  ["muted", "surface"],
  ["accent-text", "accent"],
  ["error", "error-bg"],
  ["error", "surface"],
  ["info", "info-bg"],
].map(([foreground, background]) => {
  const a = resolve(tokens[foreground]),
    b = resolve(tokens[background]),
    l = [lum(a), lum(b)].sort((a, b) => b - a);
  const ratio = (l[0] + 0.05) / (l[1] + 0.05);
  return {
    foreground,
    background,
    colors: [a, b],
    ratio: Number(ratio.toFixed(2)),
    passed: ratio >= 4.5,
  };
});
const result = {
  basis: "Declared opaque CSS tokens only; not rendered browser contrast.",
  pairs,
  typeSizes: [13, 14, 16, 20, 28, 36],
  weights: [400, 600, 700],
  transitionAll: /transition\s*:\s*all/.test(css),
  reducedMotionGuard: css.includes("prefers-reduced-motion: no-preference"),
};
await writeFile(
  new URL("../../docs/frontend/design-check.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
if (
  pairs.some((p) => !p.passed) ||
  result.transitionAll ||
  !result.reducedMotionGuard
)
  process.exitCode = 1;
