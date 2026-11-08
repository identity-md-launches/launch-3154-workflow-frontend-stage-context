import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { numberToHex, type EIP1193Provider } from "viem";
import { useRuntime } from "./context";
import { errorMessage, short } from "./domain";
import { Modal, AddressText } from "./ui";
export const openIn = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export async function switchNetwork(
  provider: EIP1193Provider,
  r: ReturnType<typeof useRuntime>,
) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(r.chain.id) }],
    });
  } catch (e) {
    const err = e as {
      code?: number;
      message?: string;
      cause?: { code?: number };
    };
    if (
      err.code !== 4902 &&
      err.cause?.code !== 4902 &&
      !/unknown chain|unrecognized chain|chain.*not.*added/i.test(
        err.message ?? "",
      )
    )
      throw e;
    if (!r.deployment.walletAddChain)
      throw Error(
        "This chain is missing from your wallet. No add-chain configuration was supplied.",
      );
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [r.deployment.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: numberToHex(r.chain.id) }],
    });
  }
}
export function Wallet() {
  const r = useRuntime(),
    account = useAccount(),
    { connectors, connectAsync, isPending, variables } = useConnect(),
    { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [switching, setSwitching] = useState(false);
  const wrong = account.isConnected && account.chainId !== r.chain.id;
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as unknown as { ethereum?: unknown }).ethereum &&
    !named;
  const listed = connectors.filter(
    (c) =>
      !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  async function change() {
    setSwitching(true);
    setError("");
    try {
      await switchNetwork(
        (await account.connector!.getProvider()) as EIP1193Provider,
        r,
      );
    } catch (e) {
      setError(errorMessage(e));
      setOpen(true);
    } finally {
      setSwitching(false);
    }
  }
  return (
    <>
      <button
        className={!account.isConnected ? "connect" : ""}
        onClick={() => (wrong ? void change() : setOpen(true))}
        disabled={switching}
      >
        {switching
          ? "Switching…"
          : wrong
            ? `Switch to ${r.chain.name}`
            : account.address
              ? short(account.address)
              : "Connect wallet"}
      </button>
      {open && (
        <Modal
          title={account.address ? "Your wallet" : "Connect a wallet"}
          close={() => setOpen(false)}
        >
          {account.address ? (
            <>
              <AddressText address={account.address} />
              <p>
                {wrong
                  ? `Wrong network. Switch to ${r.chain.name} to continue.`
                  : r.chain.name}
              </p>
              {wrong && (
                <button onClick={() => void change()} disabled={switching}>
                  Switch network
                </button>
              )}
              <button
                className="full"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="muted">Your wallet signs every transaction.</p>
              {mobile &&
                openIn.map((w) => (
                  <a
                    className="wallet-row"
                    href={w.href(location.href)}
                    key={w.id}
                  >
                    <img
                      src={`./wallets/${w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    Open in {w.name}
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  disabled={isPending}
                  onClick={async () => {
                    setError("");
                    try {
                      if (
                        c.id === "injected" &&
                        !(window as unknown as { ethereum?: unknown })
                          .ethereum &&
                        !named
                      )
                        throw Error(
                          "No browser wallet found. Install a browser wallet or choose Coinbase Smart Wallet.",
                        );
                      await connectAsync({ connector: c });
                      await switchNetwork(
                        (await c.getProvider()) as EIP1193Provider,
                        r,
                      );
                      setOpen(false);
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  <img
                    src={
                      c.icon?.startsWith("data:")
                        ? c.icon
                        : `./wallets/${c.type === "coinbaseWallet" ? "coinbase" : "browser"}.svg`
                    }
                    width="28"
                    height="28"
                    alt=""
                  />
                  {c.id === "injected"
                    ? "Browser wallet"
                    : c.type === "coinbaseWallet"
                      ? "Coinbase Smart Wallet"
                      : c.name}
                  {isPending && variables?.connector === c ? " · opening…" : ""}
                </button>
              ))}
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
