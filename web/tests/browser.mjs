// Rendered production-export checks. Uses mock wallet/RPC; never broadcasts.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import { createMockChain, manifest, address } from "./mock-chain.ts";
const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = resolve(root, "dist"),
  out = resolve(root, "test/scratch/browser");
await mkdir(out, { recursive: true });
const report = {
  engine: process.env.BROWSER || "chromium",
  at: new Date().toISOString(),
  rendered: false,
  checks: [],
  limitations: [],
};
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname.replace(
      /^\/ipfs\/fixture\//,
      "/",
    );
    const file = resolve(
      dist,
      "." + pathname + (pathname.endsWith("/") ? "index.html" : ""),
    );
    if (!file.startsWith(dist + sep)) throw Error("Path rejected");
    res.setHeader(
      "content-type",
      mime[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await { chromium, firefox, webkit }[report.engine].launch({
    headless: true,
  });
  report.rendered = true;
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().startsWith(origin) && r.status() >= 400)
        errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(origin) || url.startsWith("data:"))
        return route.continue();
      external.push(url);
      return route.abort();
    });
    await page.goto(origin + "/ipfs/fixture/");
    await page.getByRole("heading", { name: "Above markets." }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${width}`,
    );
    assert.deepEqual(external, [], "no third-party requests before Connect");
    if (width === 390) {
      const box = await page
        .getByRole("button", { name: "Review buy Yes" })
        .boundingBox();
      assert.ok(
        box && box.y + box.height <= 844,
        "main action on first mobile screen",
      );
    }
    await page.screenshot({
      path: resolve(out, `${width}-above.png`),
      fullPage: false,
    });
    for (const hash of ["up-down", "token", "tools", "old", "docs"]) {
      await page.goto(origin + "/ipfs/fixture/#" + hash);
      await page.locator("h1").waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${hash}: overflow at ${width}`,
      );
    }
    await page.getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.deepEqual(errors, []);
    report.checks.push({
      name: `${width}px routes, resources, keyboard dialog, subpath`,
      passed: true,
    });
    await context.close();
  }
  const chain = createMockChain(),
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
  const page = await context.newPage();
  await page.exposeBinding("fixtureRpc", async (_source, request) => {
    try {
      return { result: await chain.rpc(request) };
    } catch (e) {
      return { error: { message: e.message, code: e.code } };
    }
  });
  await page.addInitScript(() => {
    const listeners = new Map();
    const provider = {
      request: async (request) => {
        const response = await window.fixtureRpc(request);
        if (response.error)
          throw Object.assign(
            new Error(response.error.message),
            response.error,
          );
        if (request.method === "wallet_switchEthereumChain")
          listeners
            .get("chainChanged")
            ?.forEach((cb) => cb(request.params[0].chainId));
        return response.result;
      },
      on: (name, cb) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(cb);
      },
      removeListener: (name, cb) => listeners.get(name)?.delete(cb),
    };
    window.ethereum = provider;
    const announce = () =>
      dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "a2316afa-f431-4d12-b869-012345678901",
              name: "Fixture wallet",
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
              rdns: "test.fixture.wallet",
            },
            provider,
          },
        }),
      );
    addEventListener("eip6963:requestProvider", announce);
    announce();
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:"))
      return route.continue();
    if (manifest.network.rpcUrls.some((r) => url === r || url === r + "/")) {
      const body = route.request().postDataJSON();
      try {
        return route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: body.id,
            result: await chain.publicRpc(body),
          },
        });
      } catch (e) {
        return route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: body.id,
            error: { code: e.code ?? -32000, message: e.message },
          },
        });
      }
    }
    return route.abort();
  });
  await page.goto(origin + "/ipfs/fixture/");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Fixture wallet" }).click();
  await page.getByRole("heading", { name: "Place an order" }).waitFor();
  await page.getByText("IMD above $3", { exact: true }).waitFor();
  await page.locator(".market-row", { hasText: "No bid 0.62" }).waitFor();
  const row = await page.locator(".market-row").first().innerText();
  assert.match(row, /Yes bid 0\.4 · ask no quote/);
  assert.match(row, /No bid 0\.62 · ask no quote/);
  await page.evaluate(() => scrollTo(0, 0));
  const firstScreen = await page.evaluate(() => ({
    header: document.querySelector("header").getBoundingClientRect().height,
    button: document
      .querySelector(".order-form button[type=submit]")
      .getBoundingClientRect().bottom,
  }));
  report.checks.push({
    name: `connected 390x844: header ${firstScreen.header}px, order button bottom ${firstScreen.button}px`,
    passed: firstScreen.button <= 844,
  });
  assert.ok(
    firstScreen.button <= 844,
    "connected order button on first screen",
  );
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "connected board overflow at 320",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Limit price (USDC)").fill("0.4");
  await page.getByLabel("Shares", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Review buy Yes" }).click();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await page.getByText(/Confirmed in block/).waitFor();
  assert.equal(chain.state.writes.at(-1).functionName, "place");
  assert.ok(
    chain.state.requests.some((r) => r.method === "wallet_addEthereumChain"),
  );
  await page
    .getByRole("button", { name: "Dismiss transaction status" })
    .click();
  await page.getByLabel("Shares", { exact: true }).fill("99999999999999");
  assert.equal(
    await page.getByRole("button", { name: "Review buy Yes" }).isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: resolve(out, "390-connected.png") });
  report.checks.push({
    name: "EIP-6963 connect, unknown-chain add, order simulation/sign/receipt, balance guard",
    passed: true,
  });
  await context.close();
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
  const mobile = await phone.newPage();
  await mobile.goto(origin + "/");
  await mobile.getByRole("button", { name: "Connect wallet" }).click();
  for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
    assert.ok(
      await mobile
        .getByRole("link", { name: "Open in " + name })
        .getAttribute("href"),
    );
  await mobile.screenshot({ path: resolve(out, "390-wallets.png") });
  report.checks.push({
    name: "four phone wallet links and bottom sheet",
    passed: true,
  });
  await phone.close();
} catch (error) {
  report.limitations.push(error.message.split("\n")[0]);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
