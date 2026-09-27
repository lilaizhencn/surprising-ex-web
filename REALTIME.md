# 实时订阅 / Realtime subscriptions

公共行情和私有状态分开连接，并分别按 `wsBaseUrlForProductLine` 配置的地址分组；多个产品配置相同地址时复用连接。私有连接发送 `authenticate`，收到 `authenticated` 后才订阅；令牌不放进 WebSocket URL。重新连接、换用户或更新令牌会重新建立私有快照基线。

Public and private streams use separate connections, grouped by configured product endpoint. Private subscriptions wait for authentication. Reconnects and session changes establish a fresh account baseline.

每个连接最多分配 180 项订阅，预留服务器 200 项上限的余量；资产折算只订阅账户涉及资产的现货价格。

Each connection carries at most 180 subscriptions, below the server's 200 limit. Asset conversion subscribes only to the spot prices needed by the accounts.

- 行情页面只展示 SPOT；现货成交用于最新价，`bookTicker` 用于资产折算。交易页面订阅当前产品与交易对的 `depth`、`candles`、`trades`，衍生品额外订阅 `mark`、`index`，永续额外订阅 `funding`。切换页面、产品、交易对或周期会差量退订和订阅。
- 登录后订阅六产品的 `accountState`、`orders`、`triggerOrders`、`positions`、`positionRisk`、`executionReports`。省略私有 symbol 表示本用户该产品的所有交易对；用户身份由服务器认证决定。已取消 `matches`。
- 所有行情状态按产品线与 symbol 隔离。资产页保持六产品账户缓存，并根据实际持仓添加或移除标记价订阅。

Markets show spot instruments. Trading subscriptions are scoped by product, symbol and candle interval. All six authenticated product accounts remain cached for the assets overview; mark subscriptions follow actual holdings. Public data and private account data never share a symbol-only key.

## 状态恢复 / Recovery

`event.data` 是 `{version, entityId, value}`；`snapshot.data` 是完整 `UserReadView`。私有事件先合并到按实体保存的绝对值缓存，不依赖 UI 的成交记录窗口。快照删除自身版本以前的实体、保留较新增量；终态保留版本标记，防止旧包复活订单或持仓。丢包由后端周期快照修复。快照超过 15 秒或非 READY 时，资产估值显示同步中。快照与墓碑缓存超过保护上限时等待新基线。

Snapshot fences preserve newer updates and terminal tombstones. Periodic snapshots heal dropped packets. Non-ready or expired snapshots are not displayed as a current asset valuation. Private-state events do not trigger REST account queries. Explicit ledger and algo-order queries remain separate.

订单 `OPEN` 映射为 ACCEPTED/PARTIALLY_FILLED，其他终态移除；触发单只保留 PENDING/TRIGGERING；持仓数量为零移除；零余额保留。`depth` 首条是买卖各最多 50 档的 SNAPSHOT（空盘口也覆盖），后续 DELTA 按价格档位写入绝对数量，数量为零删除。逐条校验 previousSequence 与本地 sequence；断档时只对当前产品/币对的 depth 执行 WebSocket 退订再订阅，等待新的 50 档 SNAPSHOT；等待期间丢弃无法接续的 DELTA，正常运行不轮询全量。渲染批处理保留全部增量，不能合并成最后一条；退订重连重新接收首条快照。盘口为空仍保留固定高度、表头和中间最新成交价，不显示空数据提示。

Open orders, active triggers and nonzero positions are materialized directly. Zero balances remain explicit. Depth snapshots replace both sides, including empty sides; deltas update individual price levels. A sequence gap resubscribes only the affected depth channel and waits for a new WebSocket snapshot. REST command sequences are never mixed with depth log-position sequences.

## 权益 / Equity

权益由余额的 available + locked 加持仓浮动价值组成，不重复加入已结算的 realizedPnl。线性合约加入未实现盈亏；已支付权利金的期权加入带方向的期权市值。估值使用与持仓版本匹配的 instrument 和整数运算。反向合约只有获得明确的 `settleScaleUnits` 才在本地计算，否则使用 Core 推送的 positionRisk 未实现盈亏，不猜测结算精度。不会累加多个 positionRisk 中重复的账户 equity。

Equity includes cash plus floating position value, without double-counting realized PnL. Options contribute signed market value; linear contracts contribute unrealized PnL. Inverse contracts require explicit settlement scaling for local valuation; otherwise authoritative Core risk updates provide PnL. Missing inputs hide valuation. Web retains unsafe 64-bit JSON IDs as strings and refuses unsafe monetary-number displays.

资金账户 FUNDING 保留独立查询；六类交易账户由快照与增量更新。金额使用整数运算，并按资产接口提供的精度换算展示，不能统一假设为 1e8。

Funding balances remain separately queried. Trading balances use snapshots and events. Integer amounts are displayed using each asset's declared scale.

交易页风险面板展示当前 symbol / positionSide 的 Core 风险值，不累加重复账户权益。持仓模式、仓位保证金和风险由快照驱动；杠杆配置只在页面进入、参数切换或手动刷新时查询，不随行情或私有事件重复查询。

The trading risk panel identifies the selected symbol and position side. Position mode, position margin and risk use streamed state. Leverage configuration queries run on entry, parameter changes or explicit refresh, never on price or account events.

验证：`bun run test`、`bun run lint`、`bun run typecheck`、`bun run build`。前端测试模拟协议，不能替代部署环境中 Core → Router → WS 的完整联调。

Validation: unit tests, type checking and production build. Protocol fixtures do not replace deployment integration testing.

## 盘口断档恢复修复（2026-09-27）

`TradePage.resyncOrderBook` 改为调用 `useRealtimeFeed.refreshDepth`，再由
`RealtimeConnections.resubscribe` 只退订/重订阅目标盘口，保留成交等其他频道。
feed 清除该盘口旧事件缓存，并等待 SNAPSHOT；页面允许恢复快照覆盖同版本的已处理事件，
避免相同序号的快照被去重过滤。恢复状态只由本次连接的 feed 和当前页面持有，收到快照后结束。
旧实现把 REST 命令序号（实测约 441 万）与 WS 日志位置（约 44.98 亿）比较，导致恢复快照被拒绝。

验证：63 项前端测试通过，`npm run lint`、`npm run build`、`git diff --check` 通过。
新增连接测试覆盖目标盘口独立重订阅、产品线隔离、不存在的订阅和断线重连。
真实 Chrome 故意丢失盘口增量：修复前连续 15 次采样只有 1 个盘口状态，并请求 12 次 REST 盘口；
修复后桌面 15 次、手机 14 次不同盘口状态，均观察到 depth 退订/重订阅及新 SNAPSHOT，
REST 盘口请求为 0，K 线初始化仍为 1 次，无 JS 异常；手机 390/390 无横向溢出。
证据保留在本地运行目录 `verification/depth-recovery/`（JSON、截图、故障注入脚本）。
测试浏览器已退出，页面和做市服务保留运行。在线故障注入覆盖 U 本位永续 BTC；
本次只改前端恢复链路，没有修改下单、资金记账或 Java 服务，因此未重跑后端资金及全产品交易测试。

## 独立滚动 24h 行情

交易页 `useDayStats` 使用当前产品线/币对的固定 `candles/1m` 订阅维护日统计，
与图表选中的 candles 周期分开。切换图表周期保留固定订阅；选到 1m 时连接层按 subscriptionKey 去重。
初次进入、切换币对和断线恢复各读取一次对应的 24h 分钟窗口，其他时候不轮询 REST。
仅使用服务器绝对聚合值，窗口边界为分钟级，精确口径见 README。

## 黑屏/后台页面后的连接恢复

`RealtimeConnections.Connection` 每 20 秒检查连接；45 秒未收到有效服务器消息时，
主动废弃旧 socket 并按现有退避策略重新连接、认证和订阅，不等待半开连接的 close 回调。
pong 可维持无成交市场的连接。页面重新可见或 pageshow 时立即检查真实经过时间，
即使后台定时器被挂起也能恢复。旧连接迟到的回调不能清理新连接心跳；卸载清理监听和定时器。
此机制检测网络连接存活，不代表撮合服务就绪；Core 恢复期间即使 pong 正常，成交和盘口仍可能不可用。

2026-09-27：71 项测试、lint、build 通过；新增半开无 close、安静市场 pong、模拟五分钟后台恢复、
连接握手不完成四项回归。Chrome 模拟时间跳变及 visibilitychange 后重新订阅，并收到 mark/index/funding；
390px 移动布局无横向溢出，无页面 JS 错误。该阶段 Core 正在重放，未据此宣称成交已恢复。

### 2026-09-27 交易页恢复和统计

- `useRealtime` 为新的 depth `SNAPSHOT` 建立新的页面事件 ID，清除该币对旧增量；`newerPublicEvent` 与 `TradePage` 接受重新建立基线的快照，即使核心重置后序号小于旧连接。普通 `DELTA` 仍检查版本和 `previousSequence`，断档请求 WebSocket 最新快照。
- 衍生品订阅 `openInterest`，由网关读取当前产品线权威账户 OI 快照，按单边持仓口径推送。`READY` 才显示，`UNAVAILABLE` 或断连不显示旧值为零。
- 24 小时成交量、成交额由 `useDayStats` 的独立 1 分钟滚动窗口计算，与图表选择的 15m/1h 等周期无关。成交额累加实际 `quoteVolume`，不以最新价格乘成交量替代。
- 盘口价格聚合只调整价格桶，不改变合约数量步长；数量按合约乘数显示，不另加 Quantity step 文案。

交易页首先只请求当前币对的 `instrument/latest`；打开下拉框时才请求当前产品线 `instrument/list`。列表组件 `PairMarketList` 独立持有公共订阅，`PairMarketValues` 通过 `useDayStats` 初始化每个币对的 24 小时分钟窗口，结合最新成交价显示涨跌幅。列表不再逐币对请求最近成交，初始价格可来自分钟窗口的收盘价，随后由成交推送覆盖。搜索和收藏过滤保留行组件，不重复加载分钟窗口。

列表关闭后释放额外订阅、取消未完成的列表和分钟窗口请求，释放列表行情；重新打开重新初始化，补齐关闭期间数据。没有 REST 定时轮询。图表仍只请求所选币对、所选周期的历史；独立 1m 窗口用于滚动 24 小时统计，并非额外图表周期。初始化失败或无数据保持缺失态。

### 高频行情下的页面响应

`useRealtimeFeed` 在消息回调中只接纳/校验事件、维护最新值和有界增量队列；接收时间也随同事件每 100ms 一起提交 React，避免每条消息单独触发整页更新。盘口增量仍逐条校验并按序应用，不把 DELTA 合并为不完整快照。价格格式化器按固定/自适应精度复用，避免每档每轮创建 Intl 对象。

渲染调试工具默认关闭，只有开发环境且 `VITE_ENABLE_RENDER_DEBUG=true` 时启用。持续做市的本地演示通过生产构建运行；开发服务器保留给修改调试使用。


2026-09-27 更新：列表最多每 1000ms 发布一次行情，且每个订阅仅保存最新值，不保留成交事件队列。当前交易页面仍为 100ms 批次；公共价格覆盖旧值，盘口保留最多 256 条待消费/去重事件，最新成交显示最多 50 条，图表最多 120 根 K 线。24 小时统计窗口最多 1441 个分钟桶，按桶替换并到期淘汰，摘要每秒发布；这些必要窗口不是无限成交历史。

`TradePage.processedEvents` 只保留当前有界事件批次中的 ID，不再保留 1～2 万条历史 ID。公共行情发布不再更新私有账户视图版本；只有账户快照、私有事件或私有连接状态改变时才触发账户、订单和持仓投影。`loadAssetScales` 只在页面挂载时加载，切换图表周期不会重复触发精度和最近成交请求。

### 盘口通道独立恢复

`RealtimeConnections.Connection` 按当前 depth 订阅保存一个恢复期限：初次订阅或断档重订阅后 3 秒未收到 SNAPSHOT 就重试；正常盘口 10 秒没有消息也只重订阅该币对。成交/pong 到达不会延长盘口期限。恢复后的快照重新建立基线，继续逐条校验增量；取消订阅即删除期限，不增加盘口历史缓存。socket 心跳仍为 20 秒，检查定时器为 1 秒。

2026-09-27 验证：82 项测试通过；真实浏览器故意丢弃前两次快照后第三次自动恢复，再丢弃 12.5 秒盘口但继续收成交，重新订阅后恢复连续变化，全程未刷新页面、未轮询 REST。此修复覆盖确定存在的前端恢复停滞，不能据此认定所有历史后端超时具有同一根因。
