import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import {
  createMockChain,
  manifest,
  address,
  ACCOUNT,
  ADMIN,
} from "./mock-chain";

test("wallet, order, deposit, swap, oracle and error interactions with mocked EIP-1193 / RPC", async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: "http://localhost/preview/" },
  );
  const w = dom.window;
  for (const k of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLDialogElement",
    "HTMLInputElement",
    "HTMLSelectElement",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "MutationObserver",
    "getComputedStyle",
    "location",
    "localStorage",
  ])
    Object.defineProperty(globalThis, k, {
      value:
        k === "getComputedStyle" ? w.getComputedStyle.bind(w) : (w as any)[k],
      configurable: true,
      writable: true,
    });
  (globalThis as any).requestAnimationFrame = (cb: () => void) =>
    setTimeout(cb, 0);
  (globalThis as any).cancelAnimationFrame = clearTimeout;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).addEventListener = w.addEventListener.bind(w);
  (globalThis as any).removeEventListener = w.removeEventListener.bind(w);
  w.scrollTo = () => {};
  w.matchMedia = () =>
    ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }) as any;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const chain = createMockChain();
  (w as any).ethereum = chain.provider;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init: any) => {
    const url =
      typeof input === "string" ? input : (input.url ?? input.toString());
    if (
      manifest.network.rpcUrls.some(
        (rpc: string) => url === rpc || url === rpc + "/",
      )
    ) {
      const body = JSON.parse(init.body);
      try {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: await chain.publicRpc(body),
          }),
          { headers: { "content-type": "application/json" } },
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: (e as any).code ?? -32000,
              message: (e as Error).message,
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
    }
    const path = new URL(url).pathname.replace("/preview/", "");
    return new Response(
      await readFile(new URL("../../dist/" + path, import.meta.url)),
      { headers: { "content-type": "application/json" } },
    );
  };
  const React = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup, act } =
    await import("@testing-library/react");
  const user = (await import("@testing-library/user-event")).default.setup({
    document: w.document,
  });
  const { loadRuntime } = await import("../src/config");
  const { RuntimeContext, TransactionProvider } =
    await import("../src/context");
  const { WagmiProvider } = await import("wagmi");
  const { QueryClient, QueryClientProvider } =
    await import("@tanstack/react-query");
  const { App } = await import("../src/App");
  const runtime = await loadRuntime();
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  render(
    <RuntimeContext.Provider value={runtime}>
      <WagmiProvider config={runtime.config} reconnectOnMount={false}>
        <QueryClientProvider client={query}>
          <TransactionProvider>
            <App />
          </TransactionProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </RuntimeContext.Provider>,
  );
  const wait = async (fn: () => void) => waitFor(fn, { timeout: 12000 });
  const button = (name: string | RegExp) =>
    screen.getByRole("button", { name });
  async function confirmed() {
    await wait(() => assert.ok(screen.getByText(/Confirmed in block/)));
    await user.click(button(/^Dismiss/));
  }
  async function confirm() {
    await wait(() => assert.ok(button("Confirm in wallet")));
    await user.click(button("Confirm in wallet"));
    await confirmed();
  }
  async function navigate(hash: string) {
    await act(async () => {
      w.location.hash = hash;
      w.dispatchEvent(new w.HashChangeEvent("hashchange"));
    });
  }
  try {
    assert.equal(chain.state.requests.length, 0, "no RPC before connection");
    assert.ok((button("Review buy Yes") as HTMLButtonElement).disabled);
    await user.click(button("Connect wallet"));
    assert.ok(screen.getByRole("dialog"));
    await user.click(button("Browser wallet"));
    await wait(() =>
      assert.ok(screen.getAllByText("IMD above $3", { exact: false }).length),
    );
    assert.ok(
      chain.state.requests.some((x) => x.method === "wallet_addEthereumChain"),
      "unknown chain prompts add",
    );
    assert.deepEqual(
      chain.state.requests.find((x) => x.method === "wallet_addEthereumChain")
        ?.params[0],
      manifest.walletAddChain,
    );
    await user.type(screen.getByLabelText("Limit price (USDC)"), "0.4");
    await user.type(screen.getByLabelText("Shares"), "10");
    assert.ok(!(button("Review buy Yes") as HTMLButtonElement).disabled);
    await user.click(button("Review buy Yes"));
    await wait(() => assert.ok(screen.getByRole("dialog")));
    assert.ok(screen.getByText(/Locks 4 USDC/));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "place");
    assert.equal(
      (chain.state.writes.at(-1)?.args[1] as any).quantity,
      10000000n,
    );
    await user.clear(screen.getByLabelText("Shares"));
    await user.type(screen.getByLabelText("Shares"), "99999");
    assert.ok((button("Review buy Yes") as HTMLButtonElement).disabled);
    assert.ok(screen.getByText(/Amount exceeds your available balance/));
    await user.clear(screen.getByLabelText("Shares"));
    await user.type(screen.getByLabelText("Shares"), "10");
    await user.selectOptions(screen.getByLabelText("Direction"), "sell");
    await user.click(button("No ↓"));
    await user.click(button("Review sell No"));
    await confirm();
    assert.equal((chain.state.writes.at(-1)?.args[1] as any).yes, false);
    assert.equal((chain.state.writes.at(-1)?.args[1] as any).buy, false);
    await user.selectOptions(screen.getByLabelText("Direction"), "buy");
    await user.selectOptions(screen.getByLabelText("Order type"), "market");
    await user.selectOptions(screen.getByLabelText("Size by"), "usdc");
    await user.clear(screen.getByLabelText("Budget (USDC)"));
    await user.type(screen.getByLabelText("Budget (USDC)"), "6");
    await user.click(button("Review buy No"));
    await confirm();
    assert.equal((chain.state.writes.at(-1)?.args[1] as any).amount, 6000000n);
    assert.equal((chain.state.writes.at(-1)?.args[1] as any).quantity, 0n);
    await user.type(screen.getByLabelText("Amount (USDC)"), "5");
    await user.click(button("Approve USDC deposit"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "approve");
    assert.equal(
      (chain.state.writes.at(-1)?.args[0] as string).toLowerCase(),
      address("PimdAbove"),
    );
    await user.click(button("Deposit USDC"));
    await confirm();
    assert.equal(chain.state.free, 105000000n);
    await user.click(button("Withdraw"));
    await user.click(button("Withdraw USDC"));
    await confirm();
    assert.equal(chain.state.free, 100000000n);
    await user.type(screen.getByLabelText("Pairs to split or merge"), "2");
    await user.click(button("Split pairs"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "split");
    await user.click(button("Merge pairs"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "merge");
    await user.click(button("Match"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "matchMarket");
    chain.state.reject = true;
    await user.click(button("Cancel #1"));
    await wait(() => assert.ok(button("Confirm in wallet")));
    await user.click(button("Confirm in wallet"));
    await wait(() =>
      assert.ok(screen.getByText(/Request declined in your wallet/)),
    );
    chain.state.reject = false;
    await user.click(button(/^Dismiss/));
    chain.state.revert = true;
    const before = chain.state.writes.length;
    await user.click(button("Cancel #1"));
    await wait(() => assert.ok(screen.getByText(/Check the price tick/)));
    assert.equal(chain.state.writes.length, before);
    chain.state.revert = false;
    await user.click(button(/^Dismiss/));
    await user.click(button("Cancel #1"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "cancel");
    chain.state.ended = true;
    chain.state.oracleClose = 4n * 10n ** 18n;
    await user.click(button("Refresh state"));
    await wait(() =>
      assert.ok(!(button("Settle market") as HTMLButtonElement).disabled),
    );
    await user.click(button("Settle market"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "settle");
    await user.click(button("Claim payout"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "claim");
    assert.ok((button("Review buy No") as HTMLButtonElement).disabled);
    await navigate("token");
    await wait(() => assert.ok(screen.getByLabelText("You pay (IMD)")));
    await user.type(screen.getByLabelText("You pay (IMD)"), "10");
    await user.click(button("Get quote"));
    await wait(() => assert.ok(button("Approve IMD to Permit2")));
    await user.click(button("Approve IMD to Permit2"));
    await confirm();
    assert.equal(
      (chain.state.writes.at(-1)?.args[0] as string).toLowerCase(),
      manifest.network.uniswapV4.permit2,
    );
    await user.click(button("Approve router in Permit2"));
    await confirm();
    assert.equal(
      chain.state.writes.at(-1)?.to.toLowerCase(),
      manifest.network.uniswapV4.permit2,
    );
    await user.click(button("Swap IMD for pIMD"));
    await confirm();
    assert.equal(
      chain.state.writes.at(-1)?.to.toLowerCase(),
      manifest.network.uniswapV4.universalRouter,
    );
    assert.equal(chain.state.writes.at(-1)?.args[0], "0x10");
    assert.equal(chain.state.writes.at(-1)?.value, "0x0");
    await user.clear(screen.getByLabelText("Slippage (%)"));
    await user.type(screen.getByLabelText("Slippage (%)"), "0.8");
    assert.ok(
      (button("Review swap") as HTMLButtonElement).disabled,
      "editing slippage invalidates quote",
    );
    await navigate("tools");
    await user.type(
      screen.getByLabelText("Boundary (Unix seconds, UTC)"),
      String(chain.state.now - 100000n),
    );
    await user.type(
      screen.getByLabelText("First block at or after boundary"),
      "26000000",
    );
    await wait(() => assert.ok(screen.getByText("Start price not recorded")));
    await user.click(button("Record start price"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "request");
    assert.equal(
      chain.state.writes.at(-1)?.to.toLowerCase(),
      address("StartOracle"),
    );
    await navigate("up-down");
    assert.ok(screen.getByText("Up/Down is not deployed"));
    await navigate("old");
    assert.ok(screen.getByText("No v1 interaction"));
    assert.equal(
      chain.state.writes.filter(
        (x) =>
          !manifest.contracts.some(
            (c: any) => c.address === x.to.toLowerCase(),
          ) &&
          ![
            manifest.network.uniswapV4.permit2,
            manifest.network.uniswapV4.universalRouter,
            manifest.network.pairToken.address,
            "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          ].includes(x.to.toLowerCase()),
      ).length,
      0,
    );
    await navigate("above");
    await act(async () => {
      chain.state.chain = "0xa";
      chain.emit("chainChanged", "0xa");
    });
    await wait(() => assert.ok(button("Switch to Ethereum")));
    assert.ok((button("Review buy Yes") as HTMLButtonElement).disabled);
    chain.state.failSwitch = true;
    await user.click(button("Switch to Ethereum"));
    await wait(() => assert.ok(screen.getByText(/Request declined/)));
    chain.state.failSwitch = false;
    await user.click(button("Close dialog"));
    await user.click(button("Switch to Ethereum"));
    await wait(() => assert.ok(button(/0x1111/)));
    await act(async () => {
      chain.state.account = ADMIN;
      chain.emit("accountsChanged", [ADMIN]);
    });
    await navigate("tools");
    await wait(() =>
      assert.ok(screen.getByText("Create Above markets and set rates")),
    );
    await user.type(screen.getByLabelText("Taker K (0 to 0.10)"), "0.11");
    await user.type(screen.getByLabelText("Maker Km (0 to 0.05)"), "0.01");
    assert.ok((button("Set future fee rates") as HTMLButtonElement).disabled);
    await user.clear(screen.getByLabelText("Taker K (0 to 0.10)"));
    await user.type(screen.getByLabelText("Taker K (0 to 0.10)"), "0.05");
    await user.click(button("Set future fee rates"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "setRates");
    await user.type(screen.getByLabelText("Market asset version"), "1");
    await user.type(screen.getByLabelText("Registry period ID"), "1");
    await user.type(
      screen.getByLabelText("Market end (Unix seconds, UTC)"),
      String(chain.state.now + 86400n),
    );
    await user.type(screen.getByLabelText("Threshold (USD per U)"), "4");
    await user.click(button("Create Above market"));
    await confirm();
    assert.equal(chain.state.writes.at(-1)?.functionName, "createMarket");
    console.log(
      `Mock interaction coverage: ${chain.state.writes.length} wallet transactions validated; no network broadcast.`,
    );
  } finally {
    cleanup();
    query.clear();
    runtime.config._internal.mipd?.destroy();
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
