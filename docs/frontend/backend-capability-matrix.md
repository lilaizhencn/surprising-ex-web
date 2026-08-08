# 前端后端能力矩阵

> 审计范围：`surprising-ex-web`、`surprising-client`、`surprising-ex`。审计依据为 Gateway/Provider Controller、DTO/Model、API client、WebSocket client、配置和测试脚本，不以 README 单独推断能力。后端用户端 Gateway 的主入口是 `surprising-ex/surprising-edge/surprising-gateway/surprising-gateway-provider`，WebSocket 入口是 `surprising-ex/surprising-edge/surprising-websocket/surprising-websocket-provider`。

## 运行边界

| 项目 | 事实 |
| --- | --- |
| Web | React 19 + TypeScript + Vite，`surprising-ex-web/src/api/surprising.ts` 统一 REST，`src/hooks/useRealtime.ts` 负责 WebSocket；默认 `/api` 与 `/ws/v1` 由 Vite/部署网关代理。 |
| App | Flutter，`surprising-client/lib/src/api.dart` 负责 REST，`app_state.dart` 聚合状态与实时事件，`app.dart` 是当前 UI 入口。 |
| API 鉴权 | Bearer access token；REST 同时发送 `X-User-Id` 兼容本地 Gateway 约定；登录返回 access/refresh token，认证入口在 `AuthController`。 |
| 产品线 | `SPOT`、`LINEAR_PERPETUAL`、`INVERSE_PERPETUAL`、`LINEAR_DELIVERY`、`INVERSE_DELIVERY`、`OPTION`，账户类型必须随产品线隔离。 |
| WebSocket | `/ws/v1`；公开频道和私有频道分离，私有连接使用 token/userId。后端限制每个 session 最大订阅数，并支持重连和 fanout。 |
| 资金精度 | 后端 DTO 以 ticks、steps、units、ppm 等整数/定点语义为主；前端展示只能通过统一格式化，不得用 JS 浮点数保存资金事实。 |

## 能力矩阵

| 业务域 | 后端服务/证据 | 接口或 Topic | 请求模型/关键参数 | 响应模型/状态 | Web 页面 | App 页面 | 接入状态 | 缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 注册登录 | Gateway `AuthController` | `POST /api/v1/auth/register`、`login`、`refresh`、`verify-email`、`resend-email-verification`、`forgot-password`、`reset-password`、`GET /me` | email、password、verification code、refresh token | JWT session；邮箱验证状态；认证错误 | AuthScreen、Topbar 登录/注册 | Auth sheet、session store、生物识别 | 已接入，需迁移为正式 auth feature | Token 过期恢复和冷启动恢复仍需端到端覆盖。 |
| 用户安全 | Gateway `UserSecurityController` | `GET /api/v1/security/mfa`、`POST /password`、`mfa/enroll`、`mfa/confirm`、`mfa/disable`、`GET/PUT /scenes`、`POST /verification/challenge`、`verification/verify` | 密码、TOTP、sceneCode、挑战上下文 | MFA 状态、场景开关、Challenge 状态 | SecurityPage | App 安全/提现验证入口 | 已接入基础能力 | 未发现设备列表、活跃会话、登录历史、防钓鱼码、地址白名单用户端 API。 |
| API Key | Gateway `UserApiKeyController` | `GET/POST/DELETE/PATCH /api/v1/security/api-keys` | label、permissions、IP allowlist、验证上下文 | API Key view、status、lastUsedAt | SecurityPage | App 尚未形成独立 API Key 页 | Web 已接入 | App 需要独立安全页；withdraw 权限必须由后端模型决定。 |
| KYC | Gateway `UserComplianceController` | `GET/POST /api/v1/compliance/kyc`、`POST /kyc/documents`、`GET /kyc/documents`、`GET /kyc/documents/{id}` | applicantType、kycLevel、documentType、documentId、faceVerificationStatus | `KycProfile`、`KycDocument`，含 submitted/review/rejected 等状态 | 现有 KYC 片段 | App 现有 KYC 片段 | Web/App 有真实 API client，页面需重建 | 没有前端统一状态机和审核失败恢复 UX。 |
| Instrument | Instrument Provider + Gateway proxy | `/api/v1/gateway/instrument`：list/latest/config/version 语义 | symbol、productLine、status | instrument 精度、最小量、订单类型、杠杆、费用、交割/期权字段 | MarketRail、ContractInfo、交易表单 | ProductPageSelector、交易页 | 已接入 | 自选列表和筛选偏好没有后端持久化接口。 |
| 公开行情 | Market/Matching/Candlestick/Price Provider | `/api/v1/gateway/trading-market`、`candlestick`、`instrument`、`mark-price`、`exchange-rate` | symbol、productLine、period、limit | last/index/mark/funding/volume、candles、depth、trades | Home、MarketHeader、Kline、OrderBook、TradesTape | Home、Markets、Kline、OrderBook | 已接入 REST + WebSocket | 需要统一快照/增量序列校验和 stale-data 语义，不能只看连接是否 open。 |
| 公共 WebSocket | WebSocket Provider | `candles`、`depth`、`trades`、`index`、`mark`、`funding` | subscribe/unsubscribe、symbol、period、productLine | `SNAPSHOT`/delta、event data、productLine | `useRealtime` | `AppState` RealtimeClient | 已接入基础订阅 | 前端需要统一 adapter、心跳、网络恢复、序列缺口和订阅释放。 |
| 现货订单 | Order Provider + Account Provider | `POST /api/v1/gateway/trading/orders`、`/test`、`/batch`、`/amend`、`/cancel`、`/batch-cancel`、`/cancel-open` | symbol、side、LIMIT/MARKET、priceTicks、quantitySteps、timeInForce、clientOrderId | order status、executed/remaining quantity；拒单原因 | OrderTicket、BottomDeck | OrderTicket、PrivateTradingPanel | 已接入主要写路径 | 历史委托、历史成交、资金流水的用户端查询入口未见完整 Gateway 适配。 |
| 永续/交割订单 | Order Provider + Trigger Provider + Leverage | 同交易订单；`/algo`、`/trigger`、`/close-position`、杠杆/持仓模式路径 | productLine、marginMode、positionSide、reduceOnly、postOnly、trigger fields | open order、algo order、trigger order、close order | OrderTicket、DerivativeLifecycle、BottomDeck | OrderTicket、Algo/Trigger panels | 已接入主要写路径 | 杠杆调整的独立用户端 UX、全平二次确认和不确定状态查询需补齐。 |
| 期权 | Instrument/Order/Market Provider | OPTION 产品线共用 instrument/market/order gateway 语义；期权字段来自 instrument | underlying、strike、optionType、expiry、settlementMethod | option instrument、mark/index、订单状态 | ContractInfo + option lifecycle | Product selector + lifecycle panel | 接入框架存在 | 未发现独立期权组合/行权用户端 API，不能在前端虚构组合策略。 |
| 账户余额 | Account Provider | `/api/v1/gateway/account/product-balances?accountType=...`、balances | accountType、productLine、user identity | available/locked/equity units | AssetsPage、交易表单 | WalletPage、交易账户资产 | 已接入 | 多账户估值和历史权益曲线缺少完整用户端数据接口。 |
| 仓位与风险 | Account/Risk/Liquidation Provider | `/positions`、`/position-mode`、`/risk/account/latest`、`/risk/positions/latest`、`/liquidation/orders` | productLine、accountType、settleAsset、position mode | position、unrealized PnL、margin ratio、risk snapshot、liquidation records | BottomDeck、风险提示 | PrivateTradingPanel、风险面板 | 已接入 | 用户端历史仓位/资金费/强平详情查询需补 Gateway 适配。 |
| 内部划转 | Account Provider | `POST /api/v1/gateway/account/transfers` | sourceAccountType、targetAccountType、asset、amount、idempotency/security headers | transfer result / verification required | ProductTransferDialog | App transfer flow | 已接入 | 结果未知时需要统一查询与禁止重复提交的状态机。 |
| 钱包资产 | Gateway `CustodyWalletController` + wallet app proxy | `/api/v1/wallet/chains`、`addresses`、`deposits`、`withdrawals`；App 使用 `/api/v1/gateway/wallet/app/assets`、`orders`、`deposit-address` | asset、chain、address、amount、memo/tag、security headers | chain metadata、deposit address、wallet order status、txid | FundingFlowPage、AssetsPage | WalletPage、Recharge/Withdrawal | 已接入部分 | 需要把链/网络、确认数、手续费、暂停状态全部改为后端配置驱动。 |
| 提现安全 | Gateway + wallet | `POST /api/v1/wallet/withdrawals` | assetSymbol、chain、address、amount、idempotency、email/TOTP | accepted/pending/failed/unknown、txid | FundingFlowPage | WithdrawalPage | 已接入 | 地址簿/白名单、浏览器链接和最终状态查询未形成完整页面闭环。 |
| 资金费/保险/ADL | Funding/Insurance/ADL/Margin Ops | provider 有 `/rates/latest`、`settlements/latest`、`payments`、insurance balances/ledger/coverages、ADL queue/events | productLine、symbol、account/user filters | funding rate/payment/coverage/ADL records | 交易生命周期展示部分 | 风险/合约面板部分 | 公开/管理端 provider 存在，用户 Gateway 适配不完整 | 前端不得直接访问内部 provider；需要 Gateway 用户查询接口。 |
| 通知/公告/帮助 | Gateway 用户端扫描 | 当前未发现对应 user controller；support 相关代码主要为 admin/support | N/A | N/A | 无正式路由 | 无正式路由 | 后端缺口 | 不能用静态公告/假消息冒充生产能力。 |
| 邀请返佣 | `surprising-ex` 用户端扫描 | 未发现 referral/affiliate/invite/rebate 用户 Controller 或 Gateway client | N/A | N/A | 无正式路由 | 无正式路由 | 后端缺口 | 需要后端提供邀请码、邀请关系、返佣账单、结算状态和分页契约后接入。 |

## 状态与精度来源

- 产品线和账户类型：`surprising-product-api`、`src/types.ts`、`surprising-client/lib/src/models.dart`。
- 订单写入和状态：`surprising-trading/surprising-order-provider/.../OrderController.java`、`TriggerOrderController.java`、`OrderModel`/`OrderStatus` 相关模型。
- 账户/仓位：`surprising-account/.../AccountController.java`、`ProductBalance`、`Position`。
- KYC/安全：Gateway 的 `UserComplianceController.java`、`UserSecurityController.java`、`UserApiKeyController.java`。
- WebSocket 配置和安全：`surprising-websocket-provider/.../WebSocketProperties.java`、`ClientWebSocketHandler.java`、`KafkaFanoutConsumer.java`。
- 前端 units/ticks/steps/ppm 展示：Web `src/config.ts`、`src/api/surprising.ts`，App `lib/src/models.dart`、`lib/src/app_state.dart`。

## 结论

核心交易闭环已有真实基础，当前重建应优先把 Gateway 适配、领域状态、页面结构和实时一致性从大单体 UI 中抽出；邀请返佣、用户消息内容、用户设备会话和部分历史查询不是前端单方面可以完成的功能，已在 `api-gap-report.md` 记录。
