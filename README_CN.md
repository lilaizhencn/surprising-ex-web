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

### 交易页合约信息与下单

`TradePage` 的合约栏添加 24 小时交易币成交量、计价币成交额和交易币持仓量；指数价格后的图标打开 `IndexPriceDetails`，显示筛选、权重计算说明与当前真实来源。信息保持单行，窄屏横向滚动，不将价格拆行。

衍生品下单以开仓/平仓区分，下面选择全仓/逐仓与杠杆。`TradingTicketControls` 读取并保存服务端有效杠杆，中央弹窗只在成功响应后更新按钮；当前后端同币对同保证金模式的多空共用杠杆。未登录仍能打开提示弹窗，下单区只显示一个绿色登录入口。

`orderCapacity` 对 U 本位合约按结算整数单位估算可开多/可开空，包含初始保证金、吃单费和已有敞口限制；最终准入由核心负责。平仓请求使用 `reduceOnly`，双向持仓按被平仓方向发送 positionSide。费率从登录用户的有效费率接口读取。
