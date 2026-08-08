# Surprising EX 前端设计系统

## 品牌方向

品牌语气是“安静、清晰、可核对的执行台”，不是交易所广告页。深色交易主题使用墨黑底和矿物蓝灰面板，青色表示主动作与实时连接，绿色/红色只表达涨跌与盈亏，琥珀色表示风险或需要确认。禁止复制其他交易平台的 logo、图标、文案和布局。

## Design Tokens

### Color

```css
--sx-ink-950: #080B10;
--sx-ink-900: #0D121A;
--sx-ink-800: #151C27;
--sx-mineral-050: #F7F9FB;
--sx-mineral-100: #EDF1F5;
--sx-cyan-500: #49D7E8;
--sx-cyan-700: #1599AD;
--sx-amber-500: #F0B95A;
--sx-positive-500: #43D39E;
--sx-negative-500: #F06E78;
--sx-text-primary: #EFF5FB;
--sx-text-secondary: #9EABBC;
--sx-border-subtle: rgba(170, 194, 214, .16);
```

浅色主题使用 `--sx-mineral-050` 画布、白色面板、深色正文，语义色不随主题反转。涨跌颜色可在设置中切换为“绿涨红跌/红涨绿跌”，内部领域状态仍使用明确的 `positive/negative/warning/neutral`。

### Typography

- 系统无衬线：`Inter`, `PingFang SC`, `Microsoft YaHei`, `system-ui`。
- 页面标题：28/36 或 32/40，字重 700/800；中文标题避免窄容器导致单字孤行。
- 交易数据：12/16 到 14/20，`font-variant-numeric: tabular-nums`。
- 说明文字：12/18 或 13/20，颜色为 secondary。
- 所有价格、数量、金额、百分比、时间和订单号使用等宽数字。

### Spacing / Radius / Elevation

- 间距：4、8、12、16、20、24、32、40。
- Web 控件圆角 8/12，内容面板 16/20，状态胶囊 999；交易密集区不使用大圆角。
- App 控件 12、面板 20、胶囊 999；最小触控目标 44 logical px。
- 面板使用 1px subtle border 和轻微内高光；重要确认弹层可使用 0 16px 48px 的暗色阴影。
- 禁止大面积毛玻璃、装饰性渐变和无信息意义的动效。

## 页面基线

### Web 行情首页

- 64px 顶部导航：品牌、首页、产品线、搜索、连接状态、主题、语言、账户入口。
- 首屏有登录前/登录后两种信息层级；市场列表必须由后端 market 真实数据驱动。
- 产品线入口显示 market 数量与状态；加载、空、断线、过期均为局部状态。

### Web 交易页

- 左侧市场/产品线导航，中间 K 线与盘口，右侧成交与下单，底部账户/仓位/委托。
- 桌面 1440/1280 使用三列；1024/768 重新堆叠为“行情 + 盘口 + 下单 + 账户”，不是压缩到不可读。
- 下单表单永远显示产品线、accountType、可用余额、精度约束、提交状态和后端拒绝原因。

### Web 资产/安全/KYC

- 资金页使用白/深色可信面板、步骤化操作、明确的结果确认状态。
- 安全页按“登录保护、资金保护、开发者访问、操作历史”分组；没有后端接口的功能不显示可提交按钮。
- KYC 使用状态时间线和逐项文档状态，失败必须保留后端 rejection reason。

### App 首页/行情/交易/资产

- 底部导航：首页、行情、交易、合约、资产；期权/交割通过产品选择器进入，不把未实现能力伪装成一级入口。
- 首页根据登录态显示公开市场或账户摘要；快捷充值/提现/划转只在登录后可执行。
- 下单、撤单、平仓、杠杆、提现和安全验证使用 Bottom Sheet/独立操作页，并能在系统返回时安全退出。
- App 进入后台暂停不必要订阅，恢复时重新拿 snapshot 并重新订阅；敏感页切后台可做隐私遮罩。

## 组件与状态

| Primitive | 状态 |
| --- | --- |
| `Surface` | base、raised、focus、disabled、error |
| `Field` | idle、focused、invalid、verified、disabled |
| `ActionButton` | primary、secondary、quiet、danger、pending、unknown-result |
| `StatusBadge` | positive、warning、negative、neutral、stale、offline |
| `ProductContext` | productLine、symbol、accountType、settleAsset、instrumentVersion |
| `MarketDataState` | loading、live、degraded、stale、empty、error |
| `OrderState` | idle、validating、submitting、accepted、pending-confirmation、rejected、filled、canceled |
| `MoneyFlowState` | idle、verifying、submitting、pending-confirmation、completed、failed、unknown |
| `Empty/ErrorBoundary` | 解释原因、下一步动作、重试，不用一个全屏 spinner 覆盖整个页面 |

## 图表、盘口和表格规范

- K 线由后端 candle REST snapshot + WebSocket candle update 驱动；图表组件不能生成随机数据。
- L2 盘口必须由 REST snapshot 初始化，再由带序列/更新类型的增量 adapter 合并；检测到缺口时清空局部盘口并重新获取 snapshot。
- 盘口行支持价格精度切换，点击价格只能更新表单草稿，不得自动提交订单。
- 表格在 Web 上使用密集行和筛选，在 App 上转换为字段卡片；关键操作不可只藏在 hover。
- 金额和数量不使用 `toFixed` 作为业务计算，仅作为最终展示；业务事实以整数单位/Decimal adapter 保留。

## 交互与无障碍

- 所有字段有可见 label；错误通过 `aria-describedby`/语义状态关联。
- 图标按钮必须有 accessible name；状态不能只由颜色表达。
- 键盘焦点清晰；下单确认、撤单、平仓和提现支持 Enter/系统返回前的确认。
- 动效只使用 transform/opacity/filter，且支持 `prefers-reduced-motion`。
- 不使用 emoji 作为图标，不使用悬停承载移动端关键功能。

## 真实数据与降级规则

- 默认生产配置关闭 mock fallback；只允许在独立开发开关下使用已标注的 fallback 数据。
- 账户、余额、订单、仓位、风险、充值提现结果绝不从 mock fallback 生成。
- WebSocket 断线显示连接/数据过期状态；不把旧价标成实时，不把请求超时直接标成订单失败。
- 未实现的邀请返佣、消息、公告、客服等能力显示在能力矩阵/缺口报告中，不进入生产导航。
