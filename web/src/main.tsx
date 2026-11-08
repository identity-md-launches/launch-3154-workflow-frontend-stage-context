import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { loadRuntime } from "./config";
import { RuntimeContext, TransactionProvider } from "./context";
import { App } from "./App";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="boot" role="status">
    <h1>(p)IMD</h1>
    <p>Verifying deployment configuration…</p>
  </main>,
);
loadRuntime()
  .then((runtime) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
    });
    root.render(
      <RuntimeContext.Provider value={runtime}>
        <WagmiProvider config={runtime.config} reconnectOnMount={false}>
          <QueryClientProvider client={queryClient}>
            <TransactionProvider>
              <App />
            </TransactionProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </RuntimeContext.Provider>,
    );
  })
  .catch((error) => {
    root.render(
      <main className="boot">
        <h1>Configuration unavailable</h1>
        <p role="alert">{error.message}</p>
        <button onClick={() => location.reload()}>Retry loading</button>
      </main>,
    );
  });
