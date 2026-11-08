import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "serve-runtime-deployment",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = new URL(req.url ?? "/", "http://localhost").pathname;
          if (
            path !== "/imd-deployment.json" &&
            !/^\/abi\/[A-Za-z0-9_]+\.json$/.test(path)
          )
            return next();
          try {
            const content = await readFile(
              fileURLToPath(new URL(`../dist${path}`, import.meta.url)),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(content);
          } catch {
            res.statusCode = 503;
            res.end(
              "Run npm run build in web/ to generate the deployment files.",
            );
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
