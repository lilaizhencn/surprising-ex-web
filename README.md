# Surprising EX Web

Surprising 交易用户 Web，使用 React、TypeScript 和 Vite，连接 `surprising-ex` 的 REST API 与 WebSocket。

## 倒计时撤单响应（2026-10-24）

倒计时响应删除无人消费的两项成功计数，保留用户、instrumentId、启用状态和触发/更新时间；原时长只属于SET输入，不再回显。当前页面只提交设置并显示操作反馈，不依赖被删字段；请求和布局不变。
本轮执行`npm run build`通过（2.903秒），未运行lint、测试、浏览器或真实撤单交互。

算法响应删除原始`completedAt`元数据，通用CSV自动省略该原始列；创建/更新时间及其专用格式化列继续导出，日期过滤与排序保留。算法行的symbol由实际instrumentId和本产品行情映射生成，不读取旧接口别名。

## 算法单请求（2026-10-24）

高级算法入口只构造算法实际字段，不再生成普通订单clientOrderId或携带其orderType、固定TIF和PostOnly。TWAP继续提交真实间隔，由后端按类型使用IOC；ICEBERG不发送无用间隔，当前入口采用原默认GTC。
本轮执行`npm run build`通过（2.855秒），未运行测试、浏览器或真实交易交互。

## 本地运行

```bash
bun install
cp .env.example .env.local
bun run dev
```

可选的本地演示数据必须显式设置 `VITE_ENABLE_DEMO_DATA=true`，并只用于后端不可用时的视觉开发。默认值为关闭。

## 检查命令

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

部署配置位于 [`wrangler.jsonc`](./wrangler.jsonc)，输出目录为 `dist`，深层路由使用 SPA fallback。API 接口文档位于 [`docs/api/README.md`](./docs/api/README.md)。

## 职责与异常恢复

交易页按业务组织：`TradePage` 负责市场选择与布局，`useTradeMarketData` 负责历史请求、实时行情和切换清理，`TradingOrderTicket` 持有表单与待确认状态，`orderSubmission` 校验精确单位并构造、提交原身份请求；图表、盘口、资金费和条件单复用独立展示组件。订单输入不再修改交易页的行情状态。成交历史请求失败显示错误；切换产生的主动取消不报错。

- 币对身份按后端六种 ContractType 精确映射（VANILLA_OPTION → OPTION）；缺失、未知或与 productLine/instrumentType 冲突时标为 UNKNOWN，禁止普通单与触发单，不凭名称片段或类别猜测产品。
- 私有快照必须包含完整账户与七组数组，逐行校验金额、身份、枚举和重复主键后才原子接纳围栏。坏快照或增量保留协议围栏并请求新基线；交易页清空不可用投影，账户失效或15秒新鲜度到期即隐藏余额/持仓并禁止新单，原待确认结果查询仍保留；未知金额不能表示真实零。
- HTTP 截止时间覆盖连接、重试、响应头和完整 body：普通请求 10 秒、文件上传 180 秒（包括等待共享刷新和401重试）；JSON 最多 8 MiB，成功下载最多 32 MiB。取消和超时会中止底层连接，取消等待刷新不会中断其他请求共享的刷新；确定业务未发送时解除原待确认锁，已发请求仍保留未知结果；写结果未知仍保留原幂等身份，只查询原请求，不自动重发。
- 刷新凭证遇到网络/503 故障时保留会话并暂停私有操作，提示重试；401/403 确认失效才清会话。WebSocket 1008 先退役旧凭证，1012/接收服务不可用则退避重连并重新建立私有及盘口基线。
- 普通站内链接复用当前文档与应用连接；外链、下载、组合键与前进/返回保留浏览器行为。页面离开（含 BFCache）关闭连接和定时器，恢复时重新认证、订阅与建立基线。
- 存储不可用时会话、主题和语言在本页内继续工作；页面或懒加载失败显示手动重新加载和返回首页，不自动循环刷新。待确认订单仍要求发送前持久化，存储失败时停止发送。
- USD 汇率、资产报价和持仓标记价检查 60 秒新鲜度与可用状态；无时间戳的目录摘要不用于当前估值。报价过期或请求失败立即停止 USD 汇总，保留现金数据并显示错误与重试入口；最近成交本身仍可作为最近成交展示。

## 语言与交易委托交互

右上角自定义语言菜单支持英文、简体中文和国旗图标；首次访问默认英文，选择持久化到 `surprising-ex.language`。`src/i18n` 使用英文文案作为 key；切换语言保留当前合约、输入和盘口订阅。全局样式隐藏浏览器滚动条，但保留鼠标、触控和键盘滚动。

限价输入右侧 BBO 开关支持对手价/同向价的第 1、第 5 档；前端只传模式，由后端真实盘口定价。止盈止损区域支持单向保护和双向 OCO；Trigger type 右侧问号支持悬停和键盘聚焦，按当前方向展示触发规则。双向模式分别设置止损、止盈触发价与市价/限价委托，共用平仓数量并原子提交；当前来源是标记价，仍受已有持仓可平数量约束。

### 账户与最新成交价

账户区的 `/assets` 为资产概览，六条产品线用 `/assets?account=...` 分别查看；右上角头像直接进入概览。`/assets/ledger` 按流水类别查询资金、产品账户、内部划转、充提、资金费和订单记录。安全中心的账户设置 `/security/account` 使用操作弹窗，设备管理 `/security/devices` 支持踢出和禁止登录；开发者 API `/api` 管理 API Key、权限和 IP 白名单。设备限制使用浏览器持久保存的 `X-Device-Id`，需配合 Gateway 数据库增量 DDL。资金账户、产品账户与内部划转流水支持后端游标分页；充提、资金费和订单当前由既有接口读取最近 50 至 100 条记录，日期和关键词在已读取记录内过滤。

私有订阅及资产汇总以 `/api/v1/runtime` 的实际产品线为准。资产概览只统计私有账户快照；`/account/balances` 是当前产品账户的另一种查询格式，不能再作为资金账户重复相加。币对列表报价读取真实最近成交，标记价只显示于其专属字段；已收到实时成交后，不用较早历史行情覆盖当前报价。

### 盘口与图表展示

- `trading/OrderBook.tsx` 每档背景按当前展示的买卖两侧最大单档数量等比缩放，买绿卖红，数量变化采用 160ms 过渡；累计数量只用于合计列。行高固定 26px，系统减少动态效果设置会关闭过渡。
- `PriceChart` 蜡烛与成交量使用同一图表的共享时间轴和同一批周期时间。横轴、十字光标和顶部时间统一采用浏览器本地时区；悬停时 OHLC 与成交量同时显示选中周期，离开恢复最新周期。

### K 线显示修复（2026-09-26）

交易图增加 5m 周期（默认仍为 15m），切换产品线/币对时重建图表，切换周期恢复价格自动缩放。历史蜡烛收到迟到成交或查询修正后，同步替换蜡烛和成交量，避免只更新最后一根导致两者数据不一致；平价蜡烛启用实体边框以保留细线。当前币对悬浮列表复用进页时加载的合约列表和实时成交推送，不发起额外 HTTP 请求。

本次前端 57 项测试、构建、lint 通过（107 条已有提示）。成交价格长时间停滞的问题仍须通过 maker 报价和交易链路修复，图表不人为放大或编造成交波动。

### 标记价和指数价可用性（2026-09-27）

交易页标记价和指数价分别由 `mark` / `index` WebSocket 更新；切换币对时清空旧值。计算数据不足时显示不可用，不以指数价补标记价。

### 交易价格显示精度

价格显示使用合约 `priceTickUnits / quoteAssetScale` 的实际小数位，至少保留两位，
不再按 USDT/USD 一律保留两位。交易页币对列表、最新价、指数/标记价、盘口、逐笔、
K 线 OHLC 和价格轴使用同一精度；`0.00000427`、`0.000000000123` 不会变成 `0.00`。
无合约元数据时按数值大小保留有效数字，超过 20 位的小数使用科学计数法。
下单初始价格先对齐 tick，再用既有整数单位转换生成十进制输入，提交仍使用 BigInt 校验最小步长。
盘口聚合也按 tick 的小数位保留价格，避免原来固定 10 位导致小价格档位合并到零。
实现入口为 `src/lib/format.ts`、`TradePage.tsx`、`PriceChart.tsx`。

### 行情初始化与实时更新

`HomePage.tsx` 进页一次加载 U 本位永续列表摘要及最多 32 点的趋势数据，只订阅当前展示的三个币对逐笔。
`MarketsPage.tsx` 同样一次加载列表摘要和趋势，订阅列表币对逐笔；不查询每个币对的 `latest` 或 K 线。
初始价格、24 小时涨跌与高低价来自列表快照，收到逐笔后更新价格、涨跌及高低价；趋势只在列表加载时获取，
WebSocket 不重复发送。24 小时成交量是首次加载时的快照值，尚无滚动统计推送时不虚构增量。
`OrdersPage.tsx` 对当前产品线只加载一次合约配置，资产页面也只请求配置，不接收行情摘要或趋势。

`TradePage.tsx` 进页一次加载当前产品线合约及 24 小时摘要；下拉菜单直接展示已有列表。
K 线历史只请求当前币对、当前周期的最近 120 根，默认 `15m`；切换币对或周期才重新请求。
后续 K 线、指数价、标记价、资金费率由对应 WebSocket 通道更新，不额外请求 1m 日窗口或
标记价/指数价 `latest`。私有账户订阅才读取一次 `/api/v1/runtime`；公开行情订阅不读取。
资金费率历史与个人资金费流水仅在各自面板打开后查询，默认交易页面不预取。
连接中断由连接管理器重连并重新订阅，盘口断档时才补全量。

盘口控制中的“价格档距”只聚合价格，不改变基础币数量；单独显示“数量步长”。
U 本位永续按 `contractMultiplierPpm / 1_000_000` 将合约步长换算为基础币数量，
其规格必须与后端 Core 名义金额乘数一致；不能靠前端补零掩盖合约元数据不一致。

### 2026-09-27 日统计历史验证（旧 1m 窗口实现）

- 67 项前端测试通过，覆盖滚动边界过期、极值重算、绝对成交量覆盖、乱序历史与实时合并。
- lint（仅信息级提示）与生产构建通过；构建仍提示主包大于 500 kB。
- Chrome 桌面固定行情后依次切换 1m/5m/15m/1h/4h/1d，五个 24h 字段均保持一致，日窗口只初始化一次。
- 恢复真实行情接收后，1d 图表下 24h Close 在 20 秒内继续变化；无页面 JavaScript 错误。
- 移动视口 390px，页面宽度 390px，日统计与 1d 图表均正常显示。
- 本次仅修改前端展示与订阅计划，未修改交易后端或资金逻辑，未重复运行 Java 测试；未做逐笔精确日统计和长时断网验证。
- BTC → ETH 切换后显示 ETH 日统计；仅关闭行情 WebSocket 后重连，ETH 窗口补查一次，币对不变。

### 合约热上线状态

公共市场列表读取后台可见合约，首页、市场页和交易页每 10 秒刷新目录，新上线合约无需刷新页面。合约状态随市场模型传递；PRE_TRADING 展示但禁止提交订单，HALT 显示暂停，只有 TRADING 开放下单。后台仍执行最终状态校验，前端状态提示不替代后端准入检查。

2026-10-05 验证：lint、生产构建及 19 个测试文件的 96 项测试通过。浏览器只读代理线上行情，在本地响应中将三合约设为 PRE_TRADING，确认无页面刷新时目录继续获取并出现未开放交易提示；检查桌面、390px 手机布局且无 JavaScript 页面异常。未登录，不提交订单；未验证线上配置发布和 WebSocket 完整交易链路。

## 现货委托方式与回执（2026-10-19）

现货 LIMIT 提供 GTC/IOC/FOK/GTX（只挂单），MARKET 提供 IOC/FOK，切换订单类型时重置为
相应有效方式；GTX 同时发送 postOnly=true。BBO 继续由后端按提交时盘口选价。
切换产品或交易对会清空数量、比例、BBO 和旧委托方式，避免将另一市场的表单带入当前市场。

placeOrder 显式识别 MATCHING_PENDING/RESULT_UNKNOWN，页面以“结果待确认”提示并锁定新单，
保存用户、产品和 commandId 至 localStorage，现货还会在发送前保存 clientOrderId 与 instrumentId。
每个请求单独存储，已有标签页中的旧回执记录在读取时迁入。刷新或切换页面后恢复同一用户的待确认状态；
“查询委托结果”只读取原命令、原产品，不重发下单。确认终态后才解除锁定并刷新账户状态。

恢复查询统一使用用户入口 `GET /api/v1/gateway/trading/commands/{commandId}`，与后端回执的
commandResultUrl 保持一致；`trading-orders` 是后台服务路由名，不能用于用户查询。本轮修正了
两端硬编码路径，并在真实 FUSED 现货服务中验证回执地址可查询原命令；Web lint/build 和
151 项测试通过。用户界面直接连接真实做市服务的完整验收仍未执行。

已受理但未收到 commandId 的现货恢复见下节；请求未到达服务端时的负确认与真实现货全链路
仍待后续验收。未调试永续、交割或期权，也未部署线上。

验证：新增 orderCommands.test.ts 检查终态回执、64 位订单 ID、待确认分类及查询路由；
现有 Web 测试共 151 项通过，lint/build 通过。Playwright 用受控 API/WS 数据，在 1440px 与 390px
验证 GTX+BBO 的实际 POST、待确认锁定、刷新后恢复和原命令查询；两种宽度均无 JS 异常和横向溢出。
浏览器数据是测试夹具，不能替代真实做市、资金对账或移动端真机验收。

## 现货余额比例与精度（2026-10-19）

`TradePage` 的现货比例输入使用 `orderCapacity.ts` 的整数计算：先按比例向下取整可用资产，
买单扣除逐数量步长向上舍入的手续费，再限制最大数量和名义价值；小于最小委托量时清空数量。
价格、数量和大整数保持字符串，使用资产目录的真实精度。BBO 按选中的同向/对手方 1、5 档计算；
市价单按 `GET /api/v1/gateway/trading/price-protection` 的滑点边界估算，最终价格由服务端提交时确定。
费率必须匹配用户、产品、instrument 和 changeId；缺少资料时禁用比例输入。现货费率和保护参数
每 10 秒刷新，切换用户或交易对版本时丢弃旧请求。买入显示预留手续费，卖出显示预估手续费；
行情或配置变化仍可能使服务端拒单，页面估算不替代 Core 准入。

旧逻辑已在浏览器复现：10 USDT、价格 100、步长 0.01、费率 0.1% 时算出 0.1；
修复后为 0.09，50% 为 0.04。158 项测试、lint 和生产构建通过；受控 API/WS 浏览器检查
覆盖 1440/390px 深浅主题、买卖比例、BBO 第五档和实际 POST，无 JS 异常和横向溢出。
详细范围见 [验证记录](docs/validation/spot-order-sizing-20261019.json)。没有连接真实服务下单或部署线上。

## 现货响应丢失后的查询恢复（2026-10-19）

`api/endpoints.ts.placeOrder` 在发送现货 POST 前，将用户、产品、clientOrderId、instrumentId 写入
`state/pendingOrders.ts` 管理的持久记录；存储失败就停止发送。传输中断、超时、服务端异常或响应
无法解析时保留待确认状态，阻止另一笔下单。收到明确拒绝或完整订单响应后才移除该请求的记录。

本节原先通过 `GET /api/v1/gateway/trading/by-client-order-id` 恢复 realtime 活动视图或
已提交终态投影。只接受用户、请求号和交易对一致且订单号有效的结果。404、视图不可用或响应
不匹配都不能证明原订单未被受理；有 commandId 时保留既有回执查询，但查询自身的 NOT_ACCEPTED
不再解除锁定。恢复只发 GET，不自动重发 POST。不同用户和请求各存一条记录，跨标签页变更同步。

带用户身份约束的请求在登录刷新完成后再次核对账户，防止切换账户后用新用户凭证发送旧表单。
170 项测试、lint、生产构建通过。受控 API/WS 浏览器检查覆盖 1440/390px 深浅主题：发送前持久化、
响应中断、刷新恢复、404 保留锁定、成交终态解锁，每组仅有一条 POST。详见
[验证记录](docs/validation/spot-order-response-loss-20261019.json)。

本节最初补齐已受理订单的响应丢失恢复，后续无订单实体的拒单恢复见下节。若请求从未到达服务端，
目前仍保留待确认，尚需服务端的负确认机制；不能据此声称断网恢复已全部完成。
普通现货下单以外的写入、原生真机及真实 FUSED 做市联调未纳入本轮。

## 无订单实体的已提交拒单恢复（2026-10-19）

恢复顺序更新为先读 `GET /api/v1/gateway/trading/submission` 的 realtime 已提交回执，再在明确 RESULT_UNKNOWN 时读 by-client-order-id。TERMINAL 必须匹配原用户、产品、clientOrderId、instrumentId 及已知 commandId；命令成功或明确拒绝才解除待确认。拒单没有订单记录、订单视图尚未初始化或 Core 短期缓存已淘汰时，也可用已提交回执恢复。未知或不可用保持锁定，不重新下单。历史只有 commandId 的记录继续调用 commands，后端同样读 realtime 投影。

发布前必须先完成后端迁移、realtime 更新和历史回补，再更新 gateway 与两端；回执不存在不能证明请求从未到达。172 项测试、lint/build 通过，1440/390px 深浅色浏览器验证 POST 响应中断、刷新、未知结果锁定、无订单实体的已提交拒单解锁；每组只有一条 POST，无页面异常或横向溢出。数据为受控 API/WS，未部署或连接完整 FUSED 服务。详见 [验证记录](docs/validation/committed-command-results-20261019.json)。

## 现货撤单的待确认与恢复（2026-10-19）

`api/endpoints.ts.cancelOrder` 发送现货 POST 前将用户、产品、cancelOrderId 保存到原 pending 集合；存储失败不发送。202/MATCHING_PENDING/RESULT_UNKNOWN、断网、异常响应或订单号不匹配都不能提示撤单成功；只有匹配的终态响应或 realtime 已提交回执才确认结果。刷新后查询 `GET /api/v1/gateway/trading/cancellations/{orderId}`，校验原订单与已知命令号，未知和不可用保持锁定，不重复 POST。

交易页与订单页同步锁定单笔撤单，并提供查询入口；原产品的结果按原身份查询，恢复后刷新 realtime 账户视图。先更新支持该查询的 gateway，前提为上一轮回执表与 realtime 导出/历史回补已完成。请求从未提交到 Core 时仍需负确认，批量/改单等写入尚未纳入此恢复路径。

181 项测试、lint/build 通过。旧版将 RESULT_UNKNOWN 当成成功已在回归中复现；受控 API/WS 浏览器检查交易页、订单页的 1440/390px 深浅主题八组：发送前保存、丢响应、刷新、未决锁定、终态解锁，64 位订单号完整，每组只有一条 POST，无 JS 异常或横向溢出。未部署或连接完整 FUSED 栈，见 [验证记录](docs/validation/spot-cancel-recovery-20261019.json)。

## 现货订单行改单（2026-10-19）

交易页和订单页的活动现货限价单增加“改单”。`SpotAmendOrderButton` 沿用 StandardDialog，按资产精度显示价格和剩余数量，新委托数量独立于原单已成交数量；`orderCapacity.spotAmendmentTerms` 使用整数检查步长、数量及名义价值。弹窗局部样式隔离表格 nowrap/对齐，桌面与手机都能完整显示字段和说明。

`api/endpoints.ts.amendOrder` 显式发送后端必填的 clientRequestId，并在 POST 前持久保存请求号、原订单、新客户订单号、交易对和产品；存储失败不发送。只有匹配的已撤原单与有效新单才确认即时响应，异常、空响应及未决回执保持锁定。刷新后只查 realtime 的 `/api/v1/gateway/trading/amendments`，不重发 POST，不用新单是否存在推断原改单结果。高级操作的单笔改单也使用同一身份契约。

188 项测试、lint/build 通过；旧代码把 RESULT_UNKNOWN 当作成功已复现。八组浏览器检查覆盖交易页/订单页、1440/390px、深浅主题，验证原剩余数量、步长校验、发送前保存、64 位订单号、断响应/刷新和只读恢复；每组一条 POST、两次 GET，页面和弹窗均无横向溢出。先发布新 gateway，且此前 realtime 回执迁移/导出/历史回补已完成。本轮为受控 API/WS，没有部署或验收完整 FUSED 实栈；批量操作和其他产品仍待继续。见 [记录](docs/validation/spot-amendment-20261019.json)。

### 现货全部与批量撤单（2026-10-19）

交易页按“仅当前交易对”选择范围，`api/cancellation.ts` 从 realtime 获取一次完整固定目标，不受列表分页和 1000 笔上限影响；订单页高级操作显式携带后端必填 `batchKey`。发送前持久保存全部 ID、批次键与发送断点，每批最多 50 笔；按逐项结果显示成功、失败及失败订单，不把顶层 NONE 当作全成功。无法读取当前交易对时禁用当前对全部撤单。

响应未知或刷新后，交易页/订单页显示“确认并继续撤单”。该操作 GET 查询已发送批次，确认后继续原计划尚未发送的批次；不重发原批，不把新订单加入原计划。存储失败不发送、查询异常/回执不匹配不解锁，同账户多标签使用 Web Locks 串行执行；不支持锁的浏览器明确拒绝发送。账户切换保留原账户断点。

先按后端说明执行 `20261019-cancel-batch-results.sql`、更新 realtime 并按需使用新的独立 `.command-repair` checkpoint 回补旧批次，再发布 gateway，最后发布两端。未部署完整 FUSED 实栈；其他产品、旧直接聚合端点与批量下单/改单仍需逐项验收。见 [验证记录](docs/validation/spot-bulk-cancellation-20261019.json)。

现货 FUSED 实链路补充：`scripts/spot-fused-live.mjs` 在真实 HTTP/WS、持续做市下执行两组 51 笔目标，覆盖 1440px 深色和 390px 浅色。真实暂停所属 realtime 后回执为 202；恢复并刷新后只发送后续批次，各组 50 成功/1 已结束，计划之后新增的委托保留。测试只丢弃首批已送达后的响应，不伪造数据。运行需 backend `SixProductLineContractLiveTest` 的显式交接 fixture、所属 realtime PID 文件、已有 Playwright/Chromium，并使用允许的本地 5173 端口。完整步骤见后端 `docs/realtime-command-results.md`，本仓库 [实测证据](docs/validation/spot-fused-clients-20261019.json)。

### U 本位交割结算中减仓（2026-10-19）

`TradePage` 在 LINEAR_DELIVERY 的 SETTLING 状态禁用开仓和新 TP/SL，允许按实际持仓直接平仓；数量、方向和保证金模式校验沿用已有订单容量逻辑。下单与单笔撤单在发送前保存原身份，断响应或刷新后只查询 realtime 原回执，保持待确认期间不重复提交；保存失败不发送。

需先发布 price 的结算中指数源修复与 gateway 的合约公开查询、realtime 杠杆读取修复，沿用此前命令回执迁移/导出。可选实栈消费者为 `scripts/linear-delivery-fused-live.mjs`，使用后端四分钟交接 fixture 和所属 realtime PID；完整启动方式见后端 `docs/realtime-command-results.md`。本轮范围是结算中直接减仓与单笔写入恢复，实际到期结算、其他产品及其余批量操作仍需继续验证。

后续实测同时修复了后端 SETTLING 指数源停止及杠杆 GET 仍读 Core 的问题。Web 在结算中禁用杠杆调整、直接平仓不再依赖开仓设置，平仓额度与预估手续费按实际合约张数和资产单位显示。验证记录见 [U 本位交割实测](docs/validation/linear-delivery-trading-20261019.json)。

交割现金记录：交易页提供“交割现金流水”入口，使用产品账户流水查询，固定 DELIVERY_SETTLEMENT 类型并显示合约编号、实际现金变化和变动后余额。已结束的 U 本位/币本位交割合约按 URL 中明确的 instrumentId 读取历史元数据，保留查询页面并禁止新下单及杠杆修改；默认目录仍隐藏已结束合约。交割页不请求或展示永续资金费。流水中的金额/余额按币种精度从整数字符串显示。零现金变动不生成交割现金流水，不能据此判断未执行结算。

币本位交割使用整数分数计算 BTC 名义价值和保证金成本，手续费遵循 Core 的名义价值 HALF_UP 与费用向上取整规则；面值按报价币种精度展示。交割票据显示精确币种余额，手机端交割流水使用卡片，直接呈现金额、变动后余额和合约编号。Web 单笔请求恢复同时覆盖两条交割产品线。实际单产品线 FUSED、响应丢失和到期测试记录见 docs/validation/inverse-delivery-trading-20261020.json。


### 期权全额权利金与行权现金记录（2026-10-20）

OPTION 票据移除杠杆入口，按合约张数、乘数及资产精度展示全额权利金和手续费；卖方保证金交由真实期权风险核定。BBO 使用选择的买卖侧及档位。期权只允许未到期 TRADING 下单，响应不明时保存原身份，刷新后只 GET realtime 原回执。CLOSED 合约可按明确 ID 保留查询。

移除不存在的 options/quote 调用和对应未实现 DTO，元数据展示真实标的身份、到期、行权价、CALL/PUT、欧式/现金规则；没有可信 Greeks 服务时明确显示不可用。行权现金入口为 `/assets/ledger?category=option-exercise&productLine=OPTION`，查询既有产品账本 OPTION_EXERCISE，手机卡片保留金额、余额、合约 ID 与参考号。后台需先部署价格单位换算和行权分类修复，并按需执行旧分类迁移，详见后端 README。

实际单节点 OPTION FUSED、真实做市/HTTP/WS 下验证了单次写入、丢回包刷新恢复、CALL/PUT 六组到期、买卖双方 ±4 USDT 行权、CLOSED 禁止下单。检查 320/390/1440px、深浅主题，修复票据长文案金额重叠。尚未实现 Greeks/IV 定价；未进行生产部署、iOS/Android 真机测试或其余产品本轮实栈验收。[验证和清理记录](docs/validation/option-trading-20261020.json)。


### 期权行情与参考估值、公开手续费版本（2026-10-20 后续）

两端已接入 realtime 的期权参考接口 `/api/v1/gateway/candlestick/options/quote`，展示真实权利金、标的指数、同到期远期价及零贴现 Black-76 参考 IV/远期 Delta/Gamma/Vega/每日 Theta。模型与每1单位标的的口径明确显示，缺失/过期/越界不造数；它不替代账户风险或结算。HALT 中有新鲜源数据的未到期合约仍可查询，下单限制保持独立。

期权链现在可直接切换 CALL/PUT，按标的身份、精确到期时刻及币种分组，使用整数行权价并保留同价多合约。Web 补齐320px已登录页头、语言菜单与主题交互。另修复公开有效手续费的版本名：返回 changeId，与公开合约精度版本一致，client 不再依赖被网关删除的 instrumentChangeId；Web 现货费用版本校验同步使用公开 changeId，缺失或旧字段仍拒绝。未放开脱敏、未添加猜测费率。

发布需配套 realtime、gateway 与两端；本轮没有 SQL 或 Core 资金/撮合/协议变更。参考模型仅为明确的零贴现欧式现金模型，不提供完整利率曲线或组合 Greeks；原生设备安装及其他产品本轮实栈不在验收范围。[验证与清理记录](docs/validation/option-market-reference-20261020.json)。


### 期权原子 TP/SL 与原请求恢复（2026-10-20 后续）

client 期权“高级委托 → 条件单”补齐 TP/SL 双腿 OCO，支持选择标记价/最新成交价/指数价，以及各腿触发后市价或限价执行。价格按真实资产 scale/tick 换算，单条条件单也使用永久 instrumentId。OCO 先保存原身份，再一次提交两腿；丢回包、刷新或重建只查询原 realtime 已提交回执，不自动重发。停牌、关闭、方向不符及超出持仓数量均拦截。client 活动条件单展示真实触发源、OCO 标记和执行方式。

Web 同步保存 OPTION OCO 原身份并复用结果确认入口。TP/SL 票据不显示普通开仓权利金，费用标记为“触发成交时计算”。后端新增只读 oco-submission 查询，复用现有回执表及 realtime exporter，不访问在线 Core。本轮无新 SQL 或 Core 交易/资金模型变更，发布需配套 gateway 与两端，并确保此前回执迁移和导出已就绪。

实际仅运行 OPTION 单节点 FUSED：Web 双腿一次提交、丢响应刷新恢复后撤销；client 双腿一次提交、暂停 realtime 后未知、恢复并重建读取原结果，止盈腿触发限价平仓且另一腿撤销。当前及前一次隔离账户持仓/冻结归零、资金差额0。320px 深浅色及停牌费用文案验证通过；其他产品、独立条件单恢复、原生设备和生产发布仍需继续。[验证与清理记录](docs/validation/option-protection-20261020.json)。


### 期权独立条件单与原撤销恢复

OPTION 的独立条件单和单笔撤销现在与普通委托、OCO 一样，在唯一 POST 前保存原身份。
刷新后通过已有结果确认入口 GET realtime 回执；响应丢失、未知或不匹配不会释放请求锁，也不会自动重发。
交易页及订单页撤销使用原 instrumentId 和 triggerOrderId，忙碌/待确认时交易页禁用再次撤销。
发布需匹配 gateway 两个新只读入口，保留此前回执迁移及 realtime 导出，无新 SQL。
接口见 docs/api/options.md，隔离实栈脚本 scripts/option-single-trigger-fused-live.mjs 使用 OPTION_SINGLE_LIVE_FIXTURE、
OPTION_SINGLE_PLAYWRIGHT_MODULE、OPTION_SINGLE_CHROMIUM；证据见 docs/validation/option-single-trigger-20261020.json。


### U 本位交割保护委托恢复

U 本位交割的独立条件单、原子 OCO 与单笔撤销在发送前保存产品及原身份，刷新后只查 realtime 原回执。
保护单仅在未到期 TRADING 可提交，SETTLING 保留直接 reduce-only 平仓与原结果查询。
票据展示实际 MARK/LAST/INDEX 触发规则、可平数量和触发成交时费用，去除保护票据中的开仓额度估算。

scripts/delivery-protection-fused-live.mjs 使用 DELIVERY_PROTECTION_LIVE_FIXTURE、DELIVERY_PROTECTION_PHASE、
DELIVERY_PROTECTION_PRODUCT=LINEAR_DELIVERY、DELIVERY_PROTECTION_PLAYWRIGHT_MODULE、DELIVERY_PROTECTION_CHROMIUM，验证 TRADING 与 SETTLING 两阶段。
需既有 gateway 条件单回执接口及 realtime 导出，无新 SQL；记录见 docs/validation/linear-delivery-protection-20261020.json。


### 币本位交割条件单与原结果恢复（2026-10-20）

币本位交割的独立条件单、原子 OCO 和单笔撤销与 U 本位交割/期权共用原身份持久恢复。
API 明确带 INVERSE_DELIVERY，断网或回包身份/状态不匹配时保留原请求，刷新后仅 GET realtime 原回执。
报价币触发价格与 BTC 可用资产展示分开；保护票据只显示可平数量与触发成交时费用，不显示开仓额度。

scripts/delivery-protection-fused-live.mjs 为两类交割共用实栈脚本，以 DELIVERY_PROTECTION_PRODUCT 选择唯一产品，
搭配 DELIVERY_PROTECTION_LIVE_FIXTURE、DELIVERY_PROTECTION_PHASE=TRADING|SETTLING、
DELIVERY_PROTECTION_PLAYWRIGHT_MODULE、DELIVERY_PROTECTION_CHROMIUM；重用原条件单的中断续查另用 DELIVERY_PROTECTION_RESUME_SINGLE_ID。
不放开 SETTLING 新条件单；直接减仓与原结果查询继续可用。需既有 gateway 回执接口与 realtime 导出，无新 SQL。
实测与清理见 docs/validation/inverse-delivery-protection-20261020.json。

只读行情脚本 scripts/inverse-delivery-market-live.mjs 使用 INVERSE_MARKET_LIVE_ROOT 及上述浏览器环境参数，
检查重启后 4h 图表和 24h 分钟口径在 1440/320px、深浅色下的真实累计成交量。
realtime 修正报价面值换算、SETTLING/CLOSED 成交接收和冷启动当前周期查询；旧分钟投影需按后端文档受控重建，
本轮未操作线上数据，查询继续走 realtime。


### 现货委托确认资料与小屏提示（2026-10-20）

`clearPendingCommand` 在持久记录删除失败时保留原锁定，并显示可操作的中英文提示：保存确认失败后继续查询原请求。下单、撤单、改单的回归验证未知请求不能再次 POST；交易页及订单页刷新后仍按原现货身份恢复。交易页长提示改用明确的内容宽度与换行，小屏不再被固定定位的剩余半屏宽度挤成窄列。

受控浏览器回归 `scripts/spot-confirmation-storage-qa.mjs` 需要先启动本仓库 Vite，显式指定 `/tmp/surprising-spot-confirmation-` 前缀的 `SPOT_CONFIRMATION_QA_ROOT`。已有 Playwright/Chromium 可由 `SPOT_CONFIRMATION_PLAYWRIGHT_MODULE` / `SPOT_CONFIRMATION_CHROMIUM` 指定。它检查现货两页、1440/320px、深浅主题和中英文的原请求查询、刷新、保存失败及恢复，不代表真实 FUSED 成交验收。本轮未启动其他产品或 backend/wallet。详见 [验证记录](docs/validation/spot-confirmation-storage-20261020.json)。


### 用户成交记录（2026-10-20）

`loadMyTrades` 改用 `/api/v1/gateway/trading/trades`，验证登录账户、产品、分页与执行字段；旧 `trading-trades` 地址不再使用。订单页和分类记录页展示本人订单、买卖方向、Maker/Taker、成交价、数量及原成交费率，采用真实资产精度和整数换算，保留大订单号及自成交双方。两处入口都支持后续页，手机显示成交卡片；日期包含选中结束日，订单页丢弃旧账户、产品和筛选请求的迟到结果。需配套后端新路由，保持原 realtime 导出与迁移就绪。验证见 docs/validation/spot-private-fills-20261020.json；显式实栈脚本为 scripts/spot-trade-history-fused-live.mjs。

实栈脚本需要 `SPOT_FILLS_LIVE_FIXTURE`（隔离 FUSED 用例生成、位于 `/tmp/surprising-spot-fused-fills-` 下）及 `SPOT_FILLS_CORE_PID`，只在单次已加载的只读请求期间暂停并恢复该 Core；不能指向其他运行环境。已有浏览器可通过 `SPOT_FILLS_PLAYWRIGHT_MODULE` / `SPOT_FILLS_CHROMIUM` 指定。


### 现货历史委托分页、筛选与展示（2026-10-20）

历史委托继续从 realtime 已提交的订单投影查询。状态 FILLED/CANCELED/REJECTED 在 SQL 分页之前过滤；按更新时间及订单号倒序翻页，响应 sort 修正为 updatedAt.desc，起止日期仍按创建时间且含两端。Web 两处入口保留游标与原账户/产品/筛选，桌面和手机共用只读历史展示；client 固定已应用查询，编辑草稿不会把新条件与旧游标混页。两端保留大订单号、实际 tick/step/资产精度和小数 tick 均价，展示成交量、剩余量及原累计手续费；client 对不在交易目录的历史合约按永久身份取资料。

需配套发布 gateway、Web、client；无新表、迁移、topic 或 Core 交易状态变化。实栈一次只运行 SPOT、FUSED，不启动 wallet。隔离脚本分别为 Web 的 scripts/spot-order-history-fused-live.mjs、client 的 test/spot_order_history_fused_live_test.dart，显式传 SPOT_HISTORY_LIVE_FIXTURE（/tmp/surprising-spot-fused-history- 下、Maven SIX_LINE_LIVE_USER_HISTORY=true 生成）；Web 可用 SPOT_HISTORY_PLAYWRIGHT_MODULE / SPOT_HISTORY_CHROMIUM 指定已有浏览器。脚本只把真实 GET 的 limit 降为 1 以验证分页，不生成金融响应或提交交易。实测与清理见 docs/validation/spot-order-history-20261020.json。


### 现货当前委托的精确价格与价值（2026-10-20）

Web `TradingAccountTables` 与 client `OrderRow` 的现货价格/均价显示复用整数十进制换算，保留大于 JS 安全整数的原 tick 与小数 tick 均价。现货委托价值按 priceTicks × quantitySteps × notionalMultiplierUnits，成交价值按原 executedValueTicks × notionalMultiplierUnits，以真实报价币 scale 展示。原累计手续费直接显示，不使用平均价或最新费率反算；市价单不猜限价价值，缺少乘数/执行累计值时保持缺失。现货明确显示“计价币种”和 Post-only，隐藏不适用的全仓/逐仓、持仓方向与 reduce-only 文案。Web 小屏现货操作列随表格滚动，避免固定按钮遮住长价格和金额。

本轮为展示层修复，无 API、realtime、Core 交易或资金模型变化，无迁移/topic/新服务；未启动后端、wallet 或其他产品实栈。Web 只读展示验证脚本 scripts/spot-order-details-qa.mjs 使用显式 SPOT_DETAILS_QA_ROOT（/tmp/surprising-spot-details- 前缀、owner.json 标识本轮 QA）及可选 SPOT_DETAILS_QA_BASE、SPOT_DETAILS_PLAYWRIGHT_MODULE、SPOT_DETAILS_CHROMIUM。它挂载真正生产组件及显式整数测试数据，不拦截金融 API 响应；不代表本轮真实 FUSED 成交/资金对账。证据与清理见 docs/validation/spot-current-order-details-20261020.json。


### 现货交易面板默认视图与账户隔离（2026-10-20）

client 现货默认打开当前委托，隐藏持仓入口和保证金风险摘要，保留止盈止损/策略、历史委托与成交记录；同一面板切换账户或产品后重新选择适用的默认页签。两端现货登录提示改为账户与委托。

Web 最近订单更新曾在直接切换已登录账户时保留前一账户缓存。现按账户、登录状态、产品及永久 instrumentId 重新挂载面板，清除页签、筛选、订单更新与风险局部状态；仅收录根事件 userId 属于当前账户、channel=orders 且产品匹配的更新，跳过无订单号的空事件。现货不再展示持仓页签，衍生品入口保留。

本轮只调试现货界面与状态隔离，无 API、realtime 或 Core 逻辑改动，无迁移/topic/服务新增；查询继续使用既有 realtime 路径。未启动后端、wallet 或其他产品实栈，不能据此宣称新的 FUSED 成交/资金对账通过。scripts/spot-order-details-qa.mjs 新增账户、退出登录、交易对往返、错误产品事件与页签切换回归，沿用既有 SPOT_DETAILS_QA_ROOT / SPOT_DETAILS_QA_BASE / SPOT_DETAILS_PLAYWRIGHT_MODULE / SPOT_DETAILS_CHROMIUM 参数。受控真实组件验证、原生 widget 覆盖与资源清理见 [验证记录](docs/validation/spot-trading-panel-scope-20261020.json)。

## 六产品线原请求恢复（2026-10-21）

普通单笔下单/撤单与条件单原身份恢复统一覆盖六产品，Web 专用衍生品平仓也沿用普通订单的原请求回执。发送前持久化，未知结果阻止重复提交，重启/刷新后查询原用户、产品和请求；存储失败不发送。客户端持仓 OCO 用于五条衍生产品，不向现货余额显示衍生仓位保护表单。

本轮受控浏览器、组件、真实 AppState 和静态检查的证据见 [恢复验证记录](docs/validation/product-recovery-20261021.json)。测试响应为显式契约样本，不代表本轮真实资金、全部产品 UI 或原生设备已验收；服务器发布继续暂缓。全平台剩余范围见后端 `docs/product-completion-20261021.md`。
