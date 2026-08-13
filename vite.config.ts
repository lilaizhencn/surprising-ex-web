import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const websocketTarget = (name: string, fallbackPort: number) =>
    env[name] || `ws://localhost:${fallbackPort}`

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/ws/spot": {
          target: websocketTarget("VITE_WS_SPOT_PROXY_TARGET", 9097),
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/spot/, "/ws"),
        },
        "/ws/linear-perpetual": {
          target: websocketTarget("VITE_WS_LINEAR_PERPETUAL_PROXY_TARGET", 9197),
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/linear-perpetual/, "/ws"),
        },
        "/ws/inverse-perpetual": {
          target: websocketTarget("VITE_WS_INVERSE_PERPETUAL_PROXY_TARGET", 9297),
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/inverse-perpetual/, "/ws"),
        },
        "/ws/linear-delivery": {
          target: websocketTarget("VITE_WS_LINEAR_DELIVERY_PROXY_TARGET", 9397),
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/linear-delivery/, "/ws"),
        },
        "/ws/inverse-delivery": {
          target: websocketTarget("VITE_WS_INVERSE_DELIVERY_PROXY_TARGET", 9497),
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/inverse-delivery/, "/ws"),
        },
        "/ws/option": {
          target: websocketTarget("VITE_WS_OPTION_PROXY_TARGET", 9597),
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/ws\/option/, "/ws"),
        },
        "/api": {
          target: "http://localhost:9094",
          changeOrigin: true,
        },
        "/ws": {
          target: websocketTarget("VITE_WS_PROXY_TARGET", 9097),
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
