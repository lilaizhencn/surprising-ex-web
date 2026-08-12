# Surprising EX Web

[English](README.md) | [简体中文](README_CN.md)

Stitch 驱动的用户交易 Web 终端，独立于后端 `surprising-ex` 仓库；`surprising-ex-web` 仅作为旧项目参考。

## 功能

- 邮箱 + 密码注册和登录，支持邮箱验证与密码找回。
- JWT access token + refresh token，本地持久化 session。
- 交易工作台：U本位合约、币本位合约、现货市场列表、K线、盘口、成交、下单、资产、当前委托、合约持仓和风险快照。
- 统一 API Client 接入 REST，使用 Zod 校验外部 DTO，并通过 mapper 转为页面模型。
- 预留 WebSocket 行情和私有推送边界，协议未确认的能力不会在页面伪造成功。
- 后端不可用时，行情和账户模块进入降级展示；下单不会伪造成交。

## 本地开发

```bash
bun install
bun run dev
```

Vite 默认把 `/api` 代理到 `http://localhost:9094`。需要覆盖时复制 `.env.example` 为 `.env.local`。

```bash
VITE_WS_BASE_URL=ws://localhost:9093/ws/v1
VITE_ENABLE_DEMO_DATA=false
```

## 检查命令

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

## API 文档

完整审计、接口契约、OpenAPI 草案和后端待补清单位于 [`docs/api/README.md`](docs/api/README.md)。已确认的核心路径包括：

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `/api/v1/gateway/instrument`
- `/api/v1/gateway/candlestick`
- `/api/v1/gateway/instrument`
- `/api/v1/gateway/candlestick`
- `/api/v1/gateway/account/product-balances`
- `/api/v1/gateway/account/transfers`
- `/api/v1/gateway/trading/orders`
- `ws://localhost:9093/ws/v1`

## 部署配置

Cloudflare Workers 配置位于 [`wrangler.jsonc`](wrangler.jsonc)，构建输出为 `dist`，深层路由使用 SPA fallback。不要提交 `.env`、Token 或其他敏感信息。

## 许可证

MIT
