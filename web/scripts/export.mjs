import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  copyFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { keccak256, stringToHex } from "viem";
const root = fileURLToPath(new URL("../../", import.meta.url));
const out = resolve(root, "dist");
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
const hashAbi = (a) => keccak256(stringToHex(canonical(a))).slice(2);
const handoff = await read(resolve(root, "web/deployment/handoff.json"));
const network = await read(resolve(root, "web/deployment/network.json"));
const check = process.argv.includes("--check");
const contracts = [];
for (const c of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(c.name)) throw Error("Invalid contract name");
  const source = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:docs/abi/${c.name}.json`],
    { cwd: root, encoding: "utf8" },
  );
  const abi = JSON.parse(source);
  if (!Array.isArray(abi) || hashAbi(abi) !== c.abiHash)
    throw Error(`Pinned ABI mismatch: ${c.name}`);
  if (
    canonical(await read(resolve(root, `docs/abi/${c.name}.json`))) !==
    canonical(abi)
  )
    throw Error(`Working ABI changed: ${c.name}`);
  const abiPath = `abi/${c.name}.json`;
  if (!check) {
    await mkdir(resolve(out, "abi"), { recursive: true });
    await writeFile(resolve(out, abiPath), source);
  }
  if (hashAbi(await read(resolve(out, abiPath))) !== c.abiHash)
    throw Error(`Export ABI mismatch: ${c.name}`);
  contracts.push({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath,
  });
}
async function walk(dir) {
  const files = [];
  for (const name of (await readdir(dir)).sort()) {
    const p = resolve(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) files.push(...(await walk(p)));
    else {
      if (s.size > 8388608) throw Error("Oversize asset");
      files.push(p);
    }
  }
  return files;
}
const paths = (await walk(out)).filter(
  (p) => relative(out, p) !== "imd-deployment.json",
);
if (paths.length > 128) throw Error("Too many assets");
const assets = await Promise.all(
  paths.map(async (p) => ({
    path: relative(out, p).split("\\").join("/"),
    sha256: createHash("sha256")
      .update(await readFile(p))
      .digest("hex"),
  })),
);
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: network.network,
  ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
};
if (check) {
  if (
    canonical(await read(resolve(out, "imd-deployment.json"))) !==
    canonical(manifest)
  )
    throw Error("Manifest differs from validated handoff or final files");
} else
  await writeFile(
    resolve(out, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
const bytes = (
  await Promise.all(paths.map(async (p) => (await stat(p)).size))
).reduce((a, b) => a + b, 0);
console.log(
  `${check ? "Verified" : "Exported"} ${contracts.length} pinned ABIs, ${assets.length} assets, ${bytes} bytes; exact handoff, pool key and network.`,
);
