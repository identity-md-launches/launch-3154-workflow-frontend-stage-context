import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("../../dist/", import.meta.url)));
test("export paths and runtime ABIs resolve under a gateway subpath with exact hashes", async () => {
  // Resolve gateway URLs to their static files. This is not an HTTP/browser test.
  const base = new URL("https://static.invalid/ipfs/fixture/");
  async function asset(relative: string) {
    const url = new URL(relative, base);
    assert.equal(url.origin, base.origin);
    assert.ok(
      url.pathname.startsWith(base.pathname),
      "asset stays under export mount",
    );
    const file = resolve(
      root,
      decodeURIComponent(url.pathname.slice(base.pathname.length)) ||
        "index.html",
    );
    assert.ok(file.startsWith(root + sep), "asset stays under export root");
    return readFile(file);
  }
  const html = (await asset("./")).toString();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(match[1].startsWith("./"), "relative built asset URL");
    assert.ok((await asset(match[1])).length > 0);
  }
  for (const name of ["description", "og:title", "og:image"])
    assert.ok(html.includes(`"${name}"`));
  const m = JSON.parse((await asset("imd-deployment.json")).toString());
  assert.equal(m.contracts.length, 6);
  assert.ok(m.poolKey);
  assert.ok(m.assets.length <= 128);
  const declared = m.assets.map((a: any) => a.path).sort();
  async function walk(dir: string, prefix = ""): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((e) =>
          e.isDirectory()
            ? walk(resolve(dir, e.name), prefix + e.name + "/")
            : Promise.resolve([prefix + e.name]),
        ),
      )
    ).flat();
  }
  assert.deepEqual(
    declared,
    (await walk(root)).filter((f) => f !== "imd-deployment.json").sort(),
  );
  for (const a of m.assets) {
    const bytes = await asset(a.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      a.sha256,
      a.path,
    );
    assert.ok(bytes.length <= 8388608);
  }
  for (const c of m.contracts)
    assert.ok(Array.isArray(JSON.parse((await asset(c.abiPath)).toString())));
});
