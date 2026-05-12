import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL || "http://localhost:3100";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        shared: fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: "es2022",
      sourcemap: true,
      chunkSizeWarningLimit: 800,
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
