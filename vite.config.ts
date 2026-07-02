import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
