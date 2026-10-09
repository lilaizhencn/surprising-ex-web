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

Cloudflare Workers 配置位于 [`wrangler.jsonc`](wrangler.jsonc)，构建输出为 `dist`，深层路由使用 SPA fallback。生产 REST 和 WebSocket 地址由已跟踪的 `.env.production` 提供，分别连接 `https://ex-api.tokdou.com` 和 `wss://ex-api.tokdou.com/ws/v1`。静态资源托管不会把 `/api` 或 `/ws` 自动代理到 API 服务；部署后应检查浏览器请求的主机名仍为 `ex-api.tokdou.com`。`.env.production` 只放公开端点，Token 和其他敏感信息不得提交。

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

蜡烛图影线保留真实 OHLC：价格区上下各留 8% 空间，默认蜡烛间距 10px，影线使用主题专用的 62% 透明颜色，减少稀疏行情下的纵向拉伸感。缩放和切换周期仍由价格轴统一映射，不截断高低价、不改写 K 线。

### 登录和安全验证

认证页面共享顶部导航。登录只输入账号密码；收到后端 `requiresVerification` 挑战后，由 `LoginVerificationDialog` 展示服务器要求的全部验证码。第二步通过之前不保存登录会话。
用户中心的安全设置展示邮箱、手机、Google 绑定状态和开关。绑定/开启先校验密码，再验证目标和其他已绑定方式（包括登录开关关闭的方式）；关闭校验密码及目标验证码。Google 首次绑定弹窗显示二维码和密钥，取消/完成后清除本页密钥状态。
短信服务商暂未接入时显示不可用提示。接口约定见后端 `surprising-gateway/README.md`，前后端必须一起更新。


### K 线价格轴自适应与局部缩放（2026-10-09）

`src/components/trading/PriceChart.tsx` 的价格轴没有固定 500U 间隔；自动模式由图表根据可见 K 线的
真实最高/最低价、面板高度及合约最小价格步长选择刻度。上下留白从各 18% 缩为各 8%，价格标签密度
从默认 2.5 调为 2，让相同数据的价格区得到更多垂直空间，真实 OHLC 和交易价格步长保持原值。
可见范围确实很大时，自动模式仍会保留全部高低价，不能保证始终显示小间隔。

图表右上角 `− / +` 只缩放价格轴，每次将范围扩大 1.5 倍或缩小为 1/1.5；最窄范围不小于两档
合约价格步长。按钮不改变时间窗口、K 线数据或成交量，也不设置交易盘口聚合粒度。
手动缩放在实时重绘期间保留；点击“自适应”按当前可见 K 线重新缩放，切换周期或币对也恢复自动。
极端影线导致主体蜡烛很小时，可以先横向放大近期区间，或用价格轴 `+` 聚焦局部；手动视口之外的
高低价没有被删除。空数据时禁用缩放按钮。控件支持键盘和中文/英文、深浅主题及手机布局。

验证使用本机 Chrome 和测试服务器真实 HTTP 行情，只读连接；WebSocket 在浏览器测试中隔离。
1440px 桌面及 390px 手机深浅主题通过；实际 120 根 K 线的价格范围 80345–83133.6，经一次放大
变为 80809.7667–82668.8333；原 OHLC、成交量及时间窗口不变，自适应恢复、重绘保留手动视口、
切换 1m 周期恢复自动及键盘 Enter 操作通过，无页面脚本异常或整页横向溢出。

本轮只包含图表改动的 main（基线 `23b121e`）隔离验证：113 项测试全部通过，lint 与 build 通过，
保留既有 info 和 bundle 大小提示。共享工作区的图表专项 7 项测试与文件 lint 通过，完整 build 通过。
首次全量测试的一项资金费 Schema 用例失败，其他任务提交 `1144a18` 后重跑，全量 115 项测试通过。
共享工作区完整 lint 仍有其他未提交文件的 4 个格式/导入错误和 1 个警告；本轮未改写这些文件，
也未把共享工作区完整 lint 标为通过。本次提交仅包含图表、独立样式、四条中文翻译及本文档。

本轮本地 Chrome、Vite 和只读 SSH 转发均已停止，临时隔离目录、截图及测试日志已清理；保留常规构建产物。

### 杠杆滑条、错误提示与价格时效（2026-10-09）

`TradingTicketControls.tsx` 增加 1× 至合约上限的原生滑条，精度与输入框一致为 0.01×；拖动、键盘及快捷倍数共用 draft，保存期间禁用。数值不变时确认仅关闭弹窗。业务拒绝后保留原杠杆与弹窗，不自动启用全仓持仓保证金重算。

`api/errors.ts` 统一映射结构化业务 code 与已登记文案。`api/client.ts` 的 JSON 和下载错误共用提示规则，保留状态/原始响应供排查；未识别的内部异常、HTML、SQL/连接错误不直接展示。下单及止盈止损在 HTTP 成功但业务拒绝时也使用该映射。网络失败、写请求 5xx、明确 RESULT_UNKNOWN 均提示先核查结果，REQUEST_NOT_ACCEPTED 单独提示尚未受理，写请求不自动重试，AbortError 保留取消语义。

`ReferencePrice.tsx` 独立检查指数/标记价 eventTime：连接不正常或超过 5 秒则隐藏旧数字并提示“行情已延迟”，收到新鲜更新后恢复。此状态只影响显示，不更改估值、委托、行情数据或后端风控。

验证：共享工作区 128 项测试及 build 通过；全工作区 lint 存在其他未提交文件的 4 个错误及 1 个警告，未混入本次提交。本次改动文件检查通过；从 HEAD 加入本次暂存改动的隔离副本完整 lint、127 项测试和 build 均通过（共享目录另含其他任务的一项测试）。

Chrome 真实组件交互，桌面 1440×1000 / 手机 390×844、暗色/亮色：拖动、12.34× 输入同步、20× 快捷键及左方向键到 19.99×、未修改确认不发请求、失败保持 10× 与中文业务提示、成功关闭弹窗、保存禁用控件、产品/币对/保证金模式及 product header 均正确，无横向溢出和页面异常。使用隔离副本重复验证；接口为受控响应，未修改真实账户。模拟时间经过 6 秒验证价格过期，刷新 eventTime 后恢复，断连隐藏数字。截图检查通过；原始临时证据清理后以本文为记录。

后端测试机两轮各 90 秒只读采样确认指数/标记约每秒更新，几十 U 差异符合标记价公式，完整证据在后端 `docs/validation/price-leverage-errors-20261009.md`。推送探针运行在服务器，不代表用户浏览器的完整网络路径。前后端源码推送与线上发布是两个步骤；本次未部署或重启交易服务器，尚未验证线上网页已发布本次改动。
