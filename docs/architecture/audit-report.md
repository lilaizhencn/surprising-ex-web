# Surprising EX 前端工程化审计报告

审计日期：2026-08-12

## 项目边界

| 项目 | 角色 | 处理方式 |
|---|---|---|
| `stitch_surprising_ex` | 新前端视觉基线 | 新工程从此目录开始，不复制旧前端代码 |
| `surprising-ex` | Java 后端 | 只读分析，真实 API 以 Gateway/Edge 为入口 |
| `surprising-ex-web` | 废弃旧前端 | 只读参考 Git remote、Cloudflare、协议和已实现能力 |

实际工作区中的后端路径为 `/Users/atomex/Desktop/surprising/surprising-ex`；用户提示中的 `/Users/a123/Desktop/workspace/noah/cz_services_deploy` 在当前机器不存在。

## Stitch 前端审计

- 技术形态：19 个静态 `code.html` + 19 张 `screen.png`，无 `package.json`、无路由运行时、无真实 API 层。
- 视觉：Stitch 自带 Tailwind CDN 配置，Hanken Grotesk、JetBrains Mono、Material Symbols；浅色交易/资产页面与黑底 auth 页面并存。
- 页面入口：home、markets、spot trading、USD-M perpetual、Coin-M perpetual、delivery futures、options、asset overview、deposit、withdraw、transfer、login、register、reset password、identity verification、identity verification flow、security、transactions、notifications。
- 重复模式：多份 Header、Asset Sidebar、Footer、Card、表格和交易页导航各自内联；缺少共享 loading/empty/error/success 组件。
- 交互状态：少量页面有内联 `onclick`/下拉切换；没有真实请求、认证状态、请求取消、刷新和错误边界。
- 响应式风险：交易页主要按桌面截图导出；订单簿、图表、资产表、侧栏需要移动端重排；登录页背景图形需要避免遮挡表单。

## 旧前端审计（只读）

- Git remote：`https://github.com/lilaizhencn/surprising-ex-web.git`；分支 `main`；当前 HEAD `3d39f46`。
- 技术栈：React 19 + TypeScript + Vite 8；已有 lightweight-charts、lucide-react、qrcode.react；Node >=22.16.0。
- API：`VITE_API_BASE_URL`、`VITE_WS_BASE_URL`；REST 前缀 `/api/v1/auth`、`/api/v1/gateway`；JWT access/refresh token；请求附带 `Authorization`、`X-User-Id`、`X-Product-Line`。
- Cloudflare：Workers Static Assets，`dist` 输出，`not_found_handling: single-page-application`；配置文件为 `wrangler.jsonc`。
- GitHub Actions：旧目录未发现 workflow；Cloudflare 更像 GitHub 集成或外部构建触发，需要在目标仓库上重新确认。
- 已实现真实能力：认证、行情 instrument/candles/mark、公共与私有 WebSocket、现货/永续订单、条件单、账户余额、仓位风险、产品划转、部分 KYC/安全/API Key、钱包充值提现。
- 不迁移：旧 `App.tsx`、旧组件样式、旧 mock 数据和品牌布局。仅迁移已核实的协议、请求头、精度/单位规则和部署变量名。

工作区状态：旧前端存在未跟踪的本地工具目录和其他用户改动；后端存在两处已修改 Java 文件及 `.omo/evidence` 未跟踪文件。均不触碰、不提交。

## 后端审计

- Gateway/Edge 服务：认证、Gateway proxy、Binance-compatible API、Custody Wallet、KYC、安全、API Key、产品划转。
- 领域 Provider：instrument、candlestick、index/mark price、market data、order、trigger、leverage、account、risk、funding、liquidation、insurance、ADL。
- 真实公共查询：instrument list/latest/version、candles/latest、mark latest/history、exchange-rate、market data（由 Gateway 路由配置决定）。
- 真实用户能力：`/api/v1/auth/*`、`/api/v1/security/*`、`/api/v1/compliance/kyc*`、Gateway account balances/product-balances/transfers/positions、trading order/cancel/open/algo/trigger、wallet chains/address/deposits/withdrawals。
- 实时：WebSocket provider，公共 `candles`/`depth`/`trades`/`index`/`mark`/`funding`，私有 `orders`/`matches`/`executionReports`/`positions`/`accountRisk`/`positionRisk`/`triggerOrders`。产品线切换必须重载 REST snapshot 并重新订阅。
- 精度：后端响应大量使用 units/ticks/steps/ppm；前端必须依据 instrument 的 price/quantity scale 转换，不能用浮点数猜精度。
- 幂等/安全：订单使用 client order ID；资金划转和提现使用幂等 key；未知结果必须进入确认中，不能自动重试造成重复资金动作。

## 明确缺口

- 用户通知/公告/帮助/客服：未找到用户端 Gateway controller。
- 用户设备管理/登录历史：当前只看到安全场景、MFA、API Key，不足以支持完整设备页。
- 资金历史分页/导出：领域数据存在，但用户端 Gateway 适配不完整。
- 期权组合策略、期权独立行情链、完整期权历史：未发现可直接对接的用户端契约。
- 充值/提现地址簿、白名单和完整网络规则：需要 Gateway/Walet 的最终用户 DTO 明确字段。

## 结论

新工程应优先完成：统一壳层与 Design Tokens → 类型化 API Client → 公开行情 → 认证 → 资产/划转 → 交易 workspace → 安全/KYC。缺口页面只提供明确的“后端待补充”状态，不消费静态假数据。
