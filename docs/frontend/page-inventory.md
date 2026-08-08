# 页面清单与完成状态

状态含义：`已有真实基础` 表示现有代码已有真实接口和部分 UI；`重建中` 表示会纳入新架构；`后端缺口` 表示不允许以前端 mock 伪装完成。

## Web 页面

| 页面 | 路由 | 场景/入口 | 核心组件 | API/Topic | 权限 | 状态 | 响应式要求 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 公共首页 | `/` | 品牌入口、登录前市场概览 | Hero、LiveStatus、产品线卡片、MarketTable | instrument/market、candles/depth/trades | 公开 | 阶段基线已完成 | 1440/1280/1024/768；移动端单列 |
| 登录/注册 | `/` modal/screen | 未登录交易/资产入口 | AuthForm、邮箱验证、重置密码 | auth register/login/verify/forgot/reset | 公开 | 已有真实基础，重建中 | 375/768/1280 |
| 行情中心 | `/markets` | 搜索/筛选产品线 | MarketToolbar、MarketTable | instrument/market、public topics | 公开 | 重建中 | 768 以下表格转卡片 |
| 交易对详情 | `/market/:productLine/:symbol` | 阅读单市场 | Header、Kline、Depth、Trades、Rules | candles/depth/trades/index/mark/funding | 公开 | 规划中 | 交易入口保持可见 |
| 现货交易 | `/trade/spot` | Spot 下单、委托、成交 | ProductContext、Kline、OrderBook、OrderTicket、OrderDeck | instrument/candlestick/market/trading/account、candles/depth/trades、orders/matches/executionReports | 登录 | 已有真实基础，重建中 | 1024/768 堆叠而非压缩 |
| U 本位永续 | `/trade/usdt-perpetual` | 合约开平仓和风险 | ContractLifecycle、Leverage、Position/Risk | order/account/risk/trigger/algo、mark/index/funding | 登录 | 已有真实基础，重建中 | 高密度桌面 + 移动独立页 |
| 币本位永续 | `/trade/coin-perpetual` | 币本位风险 | 同上 | `INVERSE_PERPETUAL` context | 登录 | 已有真实基础，重建中 | 同上 |
| U/币交割 | `/trade/usdt-delivery`、`/trade/coin-delivery` | 到期和交割 | Lifecycle、DeliveryInfo、Position | instrument/order/account/risk | 登录 | 框架已有，重建中 | 明确到期/交割状态 |
| 期权交易 | `/trade/option` | 期权 instrument/报价/下单 | OptionChain、Greeks、OrderTicket | OPTION instrument/market/order | 登录 | 框架已有，受后端缺口约束 | 不显示不存在的组合策略 |
| 资产总览 | `/assets` | 多账户余额、估值、资金动作 | AssetSummary、AssetTable、TransferDialog | product-balances、wallet app assets/orders | 登录 | 已有真实基础，重建中 | 1024 转双列/单列 |
| 充值 | `/recharge` | 获取地址、查看链配置 | AssetSelect、NetworkSelect、AddressCard、QR | wallet chains/address/deposits | 登录/KYC/风险由后端决定 | 已有真实基础，重建中 | 复制/二维码/状态可见 |
| 提现 | `/withdraw` | 安全提现 | Address、Amount、Fee、Verification、Result | wallet withdrawals/rules | 登录/KYC/安全验证 | 已有真实基础，重建中 | unknown-result 禁止重复提交 |
| 资金记录 | `/assets/records` | 充值/提现/划转/流水 | Filters、PaginatedTable | 当前用户端 Gateway 能力待补 | 登录 | 后端缺口 | 后端分页协议确认后实现 |
| 安全中心 | `/security` | 密码/MFA/API Key/安全场景 | SecurityCards、VerificationChallenge | security/mfa/scenes/api-keys | 登录 | 已有真实基础，重建中 | 关键写操作二次确认 |
| KYC | `/compliance` | 认证和审核 | KycStatus、DocumentUpload、ReviewTimeline | compliance/kyc/documents | 登录 | API 已有，页面重建中 | 文档错误局部显示 |
| 个人设置 | `/settings` | 语言、法币、主题、涨跌色、时区 | SettingsForm | 目前主要本地偏好 | 登录/公开部分 | 框架规划 | 不伪造后端持久化 |
| 规则 | `/rules` | instrument 规则与风险说明 | RuleTable、ContractInfo | instrument config | 公开 | 已有基础 | CJK 长文本不孤行 |
| 公告/帮助/客服 | `/announcements`、`/help`、`/support` | 内容与工单 | ContentList、Ticket | 未找到用户端 Gateway 接口 | 登录/公开 | 后端缺口 | 暂不进入生产导航 |
| 邀请返佣 | `/referral` | 邀请、返佣、账单 | ReferralSummary、InviteHistory | 未找到用户端 Gateway 接口 | 登录 | 后端缺口 | 不使用 mock |
| 维护/错误 | `/maintenance`、`/403`、`/404`、`/500` | 系统异常 | ErrorState、Retry、Status | HTTP/服务状态 | 公开 | 重建基础状态层 | 入口动作明确 |

## App 页面

| 页面 | 入口 | 核心组件 | API/Topic | 权限 | 状态 |
| --- | --- | --- | --- | --- | --- |
| Splash/恢复 | 冷启动 | SessionRestore、Biometric、NetworkState | refresh/me、secure storage | 公开/本机 | 重建中 |
| 首页 | Bottom nav Home | AccountSummary、QuickActions、MarketPreview、RiskBadge、AuthCTA | instrument/market、account/wallet、public topics | 登录前后 | 阶段基线已完成 |
| 行情 | Bottom nav Markets | Search、ProductPicker、TickerList、Kline | instrument/market/candles/depth/trades | 公开 | 已有基础，重建中 |
| 现货交易 | Trade + `SPOT` | OrderTicket BottomSheet、OrderBook、OrderDeck | spot order/account + public/private topics | 登录 | 已有真实基础，重建中 |
| 合约 | Contract + perpetual/delivery | Leverage、Margin、Position、Risk、Trigger | derivative order/account/risk/trigger/algo | 登录 | 已有真实基础，重建中 |
| 期权 | ProductPicker `OPTION` | OptionLifecycle、InstrumentInfo、OrderTicket | option instrument/market/order | 登录 | 框架已有，后端能力约束 |
| 资产 | Bottom nav Assets | Portfolio、Balance、Recharge、Withdraw、Transfer | wallet/account/withdraw | 登录 | 已有真实基础，重建中 |
| 充值 | Wallet flow | Chain/Network、Address、QR、Status | wallet chains/address/deposits | 登录 | 已有基础 |
| 提现 | Wallet flow | Rules、Address、Amount、Verification、Result | wallet withdrawal/rules | 登录/KYC/安全 | 已有基础 |
| 安全/KYC | Account/More | MFA、Password、KYC、Biometric | security/compliance | 登录 | API 有，页面需重建 |
| 订单/仓位记录 | Trade/Contract detail | Filtered cards, pagination | 后端用户端历史接口不足 | 登录 | 后端缺口/局部 |
| 消息/帮助/客服 | More | Inbox/FAQ/Ticket | 未找到用户端接口 | 登录/公开 | 后端缺口 |
| 邀请返佣 | More | Invite/Commission | 未找到用户端接口 | 登录 | 后端缺口 |

## 页面完成规则

每个已实现页面必须同时有：首次加载、后台刷新、空数据、局部错误、离线/过期、未授权/无权限、维护/限流状态；交易和资金页面必须记录使用的 productLine/accountType/精度来源。页面不允许在生产默认路径消费 `mockData` 或 Flutter fallback。
