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

订单 `OPEN` 映射为 ACCEPTED/PARTIALLY_FILLED，其他终态移除；触发单只保留 PENDING/TRIGGERING；持仓数量为零移除；零余额保留。新 `depth` 是最多 20 档的完整替换快照，包括空盘口，不能累加。

Open orders, active triggers and nonzero positions are materialized directly. Zero balances remain explicit. Depth frames replace both sides, including empty sides. Late HTTP market responses cannot overwrite newer streamed data.

## 权益 / Equity

权益由余额的 available + locked 加持仓浮动价值组成，不重复加入已结算的 realizedPnl。线性合约加入未实现盈亏；已支付权利金的期权加入带方向的期权市值。估值使用与持仓版本匹配的 instrument 和整数运算。反向合约只有获得明确的 `settleScaleUnits` 才在本地计算，否则使用 Core 推送的 positionRisk 未实现盈亏，不猜测结算精度。不会累加多个 positionRisk 中重复的账户 equity。

Equity includes cash plus floating position value, without double-counting realized PnL. Options contribute signed market value; linear contracts contribute unrealized PnL. Inverse contracts require explicit settlement scaling for local valuation; otherwise authoritative Core risk updates provide PnL. Missing inputs hide valuation. Web retains unsafe 64-bit JSON IDs as strings and refuses unsafe monetary-number displays.

资金账户 FUNDING 保留独立查询；六类交易账户由快照与增量更新。金额使用整数运算，并按资产接口提供的精度换算展示，不能统一假设为 1e8。

Funding balances remain separately queried. Trading balances use snapshots and events. Integer amounts are displayed using each asset's declared scale.

交易页风险面板展示当前 symbol / positionSide 的 Core 风险值，不累加重复账户权益。持仓模式、仓位保证金和风险由快照驱动；杠杆配置只在页面进入、参数切换或手动刷新时查询，不随行情或私有事件重复查询。

The trading risk panel identifies the selected symbol and position side. Position mode, position margin and risk use streamed state. Leverage configuration queries run on entry, parameter changes or explicit refresh, never on price or account events.

验证：`bun run test`、`bun run lint`、`bun run typecheck`、`bun run build`。前端测试模拟协议，不能替代部署环境中 Core → Router → WS 的完整联调。

Validation: unit tests, type checking and production build. Protocol fixtures do not replace deployment integration testing.
