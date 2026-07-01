# Surprising EX Web

React front end for the Surprising EX perpetual futures trading interface.

## Stack

- React 19
- Vite 8
- TypeScript 6
- TradingView Lightweight Charts 5
- Mock-first data layer, aligned with the backend paths:
  - `/api/v1/instruments`
  - `/api/v1/trading/market`
  - `/api/v1/trading/orders`
  - `/api/v1/candlestick`
  - `/api/v1/accounts`
  - websocket channels: `candles`, `trades`, `depth`, `mark`, `funding`, `orders`, `positions`

## Scripts

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

## Cloudflare Pages

Use these settings:

- Build command: `pnpm build`
- Build output directory: `dist`
- Node.js compatibility: Node 24 or newer

When the backend is deployed, set:

```bash
VITE_API_BASE_URL=https://your-api-domain
VITE_WS_BASE_URL=wss://your-ws-domain/ws
```
