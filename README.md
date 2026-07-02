# Surprising EX Web

[English](README.md) | [简体中文](README_CN.md)

User-facing trading web terminal for Surprising EX, maintained separately from the backend `surprising-ex` repository.

## Features

- Username and password registration/login. The backend keeps the email field reserved, but the current flow does not require it.
- JWT access token and refresh token session persistence.
- Trading workspace for USDT-margined perpetuals, coin-margined perpetuals, and spot markets: market list, candlesticks, order book, trades, order entry, assets, open orders, contract positions, and risk snapshots.
- REST integration through `surprising-gateway-provider`.
- WebSocket integration through `surprising-websocket-provider` for public market data and private account updates.
- Market and account modules fall back to demo data when the backend is unavailable. Order submission is never faked as filled.

## Local Development

```bash
pnpm install
pnpm dev
```

Vite proxies `/api` to `http://localhost:9094` by default, so `VITE_API_BASE_URL` is not required for local development.

```bash
VITE_WS_BASE_URL=ws://localhost:9093/ws/v1
```

## Backend Dependencies

Required services:

- `surprising-gateway-provider`: authentication and REST gateway
- `surprising-websocket-provider`: realtime fanout
- Market data, trading, account, and risk providers

Core paths:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `/api/v1/gateway/instrument`
- `/api/v1/gateway/candlestick`
- `/api/v1/gateway/trading-market`
- `/api/v1/gateway/trading`
- `/api/v1/gateway/account`
  - `/product-balances?accountType=SPOT|USDT_PERPETUAL|COIN_PERPETUAL`
- `/api/v1/gateway/risk`
- `ws://localhost:9093/ws/v1`

## Deployment

```bash
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://ws.example.com/ws/v1
```

Production deployments should expose only the gateway and websocket services, not internal providers.

## License

MIT
