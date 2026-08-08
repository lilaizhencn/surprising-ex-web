# Web + App 产品信息架构

## 产品原则

Surprising EX 不是营销首页套交易表格，而是一个“先读市场、再执行、持续核对账户状态”的交易工作台。公共页面强调市场可读性与可信状态；登录后才显示账户、订单、仓位和资金动作；产品线切换永远创建新的 instrument/account/WebSocket 上下文。

## Web 架构

```text
公开入口 /
├── 首页：实时市场概览、产品线入口、登录/注册
├── 行情中心 /markets：按产品线筛选、搜索、涨跌与成交量
├── 交易对详情 /market/:productLine/:symbol：行情阅读与规则
├── 登录 / 注册 / 验证 / 找回密码
├── 交易工作台
│   ├── /trade/spot
│   ├── /trade/usdt-perpetual
│   ├── /trade/coin-perpetual
│   ├── /trade/usdt-delivery
│   ├── /trade/coin-delivery
│   └── /trade/option
├── 资产中心 /assets
│   ├── 资产总览
│   ├── /deposit 充值
│   ├── /withdraw 提现
│   ├── 划转抽屉
│   └── 资金记录（后端能力存在后开启）
├── 安全中心 /security
│   ├── 密码
│   ├── MFA/TOTP
│   ├── 安全场景
│   └── API Key
├── KYC /compliance
├── 设置 /settings（语言、法币、主题、涨跌色、时区）
├── 服务 /support（后端能力存在后开启）
└── 规则 /rules
```

### Web 顶部导航

- 首页：不要求登录，登录后变为账户状态首页。
- 产品线：现货、U 本位永续、币本位永续、U/币交割、期权；每个入口切换 path、instrument、accountType 和订阅。
- 搜索：只从后端返回的 market/instrument 中搜索。
- 资产：未登录进入登录引导，已登录进入资产总览。
- 安全：未登录进入登录引导，已登录进入安全中心。
- 实时状态：显示 live、reconnecting、waiting/stale 与最近事件时间，不能只显示“网络正常”。

## App 架构

```text
启动
├── session 恢复 / 生物识别解锁 / 网络恢复
├── 首页
│   ├── 账户资产摘要（登录后）
│   ├── 快捷充值 / 提现 / 划转
│   ├── 热门行情
│   └── 风险/连接状态
├── 行情
│   ├── 自选（本地偏好，后端持久化能力出现后同步）
│   ├── 现货
│   ├── 永续
│   ├── 交割
│   └── 期权
├── 交易
│   ├── 交易对上下文
│   ├── K 线 / 盘口 / 成交
│   ├── 下单 Bottom Sheet
│   └── 当前委托 / 成交 / 仓位
├── 合约
│   ├── 永续/交割产品选择
│   ├── 杠杆与保证金模式
│   ├── 风险与强平信息
│   └── 条件单 / 止盈止损
├── 资产
│   ├── 钱包资产
│   ├── 交易账户资产
│   ├── 充值
│   ├── 提现
│   └── 划转
└── 账户/更多
    ├── 登录/注册
    ├── KYC
    ├── 安全中心
    ├── 设置
    └── 帮助/客服（后端存在后开启）
```

App 不把 Web 交易页压缩到手机：市场列表使用全宽列表，交易表单使用 Bottom Sheet/独立操作页，仓位和委托使用纵向卡片，安全和资金操作使用步骤页。

## 关键路径

### 未登录

1. `/` 或 App 首页加载公开 instrument/market。
2. 用户选择产品线/交易对，查看 K 线、盘口、成交和规则。
3. 点击交易、资产、充值、提现或划转时进入登录/注册引导。
4. 登录成功后进入账户状态首页，而不是直接把用户丢进一个未知产品线的下单表单。

### 现货下单

1. 首页/行情选择 `SPOT` market。
2. 重新加载 instrument、candles、depth snapshot，并订阅 `candles/depth/trades`。
3. 下单表单读取价格步长、数量步长、最小数量/名义金额和可用余额。
4. 提交时生成 clientOrderId，锁定按钮，显示确认/提交中。
5. REST 成功或超时后都通过订单查询和私有 `orders/matches/executionReports` 确认最终状态。
6. 余额、当前委托和成交局部刷新，不重置价格输入。

### 合约开平仓

1. 选择永续/交割产品线，重置 product context。
2. 先显示 accountType、marginMode、positionMode、杠杆、mark/index/funding。
3. 下单前展示 reduceOnly、positionSide、保证金/风险提示。
4. 平仓/一键全平必须二次确认；服务端拒绝原样映射为可读错误。
5. 通过 position/order/risk 私有频道和 REST 补偿确认仓位变化。

### 资金操作

1. 选择资产，由后端返回链和网络配置。
2. 充值显示地址、memo/tag、最低充值量和确认要求。
3. 提现显示网络费、最小提现量、实际到账、验证要求和幂等状态。
4. 请求超时进入“结果确认中”，不得直接提示失败或允许重复提交。

## 权限与路由守卫

| 状态 | 可见内容 | 不可执行内容 |
| --- | --- | --- |
| 未登录 | 公开市场、instrument、K 线、深度、成交、规则 | 下单、订单、仓位、余额、资金、安全写操作 |
| 已登录未验证邮箱 | 公开市场、账户基础信息、安全验证引导 | 按后端 `requiresEmailVerification` 决定是否阻止交易/资金 |
| 已登录 | 账户、订单、仓位、风险、资产和安全 | 受 KYC、风险标签、产品状态和后端权限限制的动作 |
| 后端拒绝/维护/限流 | 局部错误、重试、状态查询 | 不得用 mock 结果填充资金/订单/仓位 |

## Deep Link 规则

- Web：`/trade/{productMode}` 与 `/trade/{productMode}/{symbol}`，symbol 必须再次向 backend instrument 校验。
- App：`surprising://trade/{productLine}/{symbol}`、`surprising://assets/{action}`；冷启动恢复后再加载 session 和 instrument，失败时回到公开首页。
- 任何 Deep Link 不得直接绕过认证或 KYC/风险验证。

## 当前迁移原则

- 现有 Web `App.tsx` 和 Flutter `app.dart/app_state.dart` 只作为协议与业务行为参考；正式架构将把 API、领域状态、实时 adapter、页面和设计 primitive 分开。
- 现有 `mockData.ts` / Flutter fallback 仅允许在明确离线开发开关下存在，不得进入生产默认路径。
- 邀请、通知、帮助、用户设备等后端缺口只在能力矩阵与缺口报告中出现，不能伪造正式页面数据。
