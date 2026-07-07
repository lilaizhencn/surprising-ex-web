import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:9094",
        changeOrigin: true
      }
    }
  },
  build: {
    target: "es2022",
    sourcemap: true
  }
});