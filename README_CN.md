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

合约栏按剩余宽度均匀分配指标间距，资金费率靠右，空间不足时保留最小间距并横向滚动。`PriceChart` 容器隔离内部层级，币对菜单可以正常覆盖图表标识。合约信息的最大杠杆按接口 `maxLeveragePpm / 1_000_000` 展示，不读取不存在的 `maxLeverage` 接口字段。

本轮验证：78 项前端测试、lint、build 通过（保留既有 info 和 bundle 大小提示）；390～1920px 七种宽度无整页溢出，1440px 以上指标用满可用宽度。Chrome 检查 20 个币对涨跌幅、菜单遮挡图表标识、搜索切币及桌面/移动端 BTC 最大杠杆 100×。仅前端数据映射与展示变更，未修改后端资金或撮合逻辑。

持续行情演示使用 `npm run build` 后 `npm run preview`；开发模式 React 的渲染追踪在展开多币对列表时开销明显。`react-scan`/`react-grab` 改为显式设置 `VITE_ENABLE_RENDER_DEBUG=true` 才加载。2026-09-27 本机同样展开 20 币对的 10 秒 Chrome 采样：开发版脚本时间约 8.73 秒，批处理优化后的生产版约 1.08 秒；100ms 探针最大迟延 394ms → 15ms。该结果是本机页面响应验证，不代表后端交易吞吐基准。

### 本地币种图标

`AssetIcon` 通过 `src/lib/assetLogos.ts` 读取 `public/assets/coins/` 原始素材，交易页、币对选择、市场表格和资产页共用。已覆盖上线的 20 个交易币及 USDT、USDC，共 22 个图标，约 178 KiB。大小由现有布局控制，以 contain 保持比例，并提供中性背景保证深浅主题可辨。未登记的币种保留中性文字标识，不请求外站图片。

素材来源页、下载 URL 和 SHA-256 见 [来源说明](public/assets/coins/SOURCES.md) 与 `sources.json`；XRP 为原始社区符号仓库，其余为项目官网或官网链接仓库。Chrome 已验证 22 个文件均可解码、20 个菜单图标全部加载且请求均同源，以及桌面/390px 手机、亮色/深色显示。79 项测试、lint 和 build 通过；未修改后端业务逻辑。

### 行情页面内存与请求策略

`TradePage` 进入时加载当前合约，展开菜单才加载当前产品线币对列表；`PairMarketList` 与主交易页分离，列表行情每秒更新，盘口按 100ms 批次保持顺序。搜索不重新请求历史；关闭列表释放订阅并取消尚未完成的初始化请求。24 小时摘要每秒更新，分钟桶、最近成交、图表与事件队列均有界，价格使用最新值覆盖。协议细节见 [REALTIME.md](REALTIME.md)。

本轮 80 项测试、lint、build 通过。新增长历史用例验证 10000 个分钟桶只保留滚动窗口内 1441 桶，重复更新不增加容量，过期全部移除。浏览器实测与后端超时排查记录见 [页面稳定性验证](UI_STABILITY_20260927.md)。本次没有修改资金、撮合或 Java 运行逻辑；前端验证不代表后端命令超时已修复。
