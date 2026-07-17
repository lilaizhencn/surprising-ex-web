# Surprising EX Web

[English](README.md) | [简体中文](README_CN.md)

用户交易 Web 终端，独立于后端 `surprising-ex` 仓库。

## 功能

- 用户名 + 密码注册和登录，邮箱字段后端保留但当前不要求输入。
- JWT access token + refresh token，本地持久化 session。
- 交易工作台：U本位合约、币本位合约、现货市场列表、K线、盘口、成交、下单、资产、当前委托、合约持仓和风险快照。
- REST 接入 `surprising-gateway-provider`。
- WebSocket 接入 `surprising-websocket-provider`，订阅行情和私有推送。止盈止损下单固定使用标记价格触发；状态快照会立即更新开放条件单列表，私有 WebSocket 重连后主动执行一次 REST 全量刷新补偿漏消息。
- 后端不可用时，行情和账户模块进入降级展示；下单不会伪造成交。

## 本地开发

```bash
pnpm install
pnpm dev
```

Vite 默认把 `/api` 代理到 `http://localhost:9094`，所以本地不需要配置 `VITE_API_BASE_URL`。

```bash
VITE_WS_BASE_URL=ws://localhost:9093/ws/v1
```

## 后端依赖

需要启动：

- `surprising-gateway-provider`：认证和 REST gateway
- `surprising-websocket-provider`：实时推送
- 行情、交易、账户、风控相关 provider

核心路径：

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

## 部署配置

```bash
VITE_API_BASE_URL=https://api.example.com
VITE_WS_BASE_URL=wss://ws.example.com/ws/v1
```

生产环境应只暴露 gateway 和 websocket，不直接暴露内部 provider。

## 许可证

MIT
