# 前端 API 缺口报告

本报告只记录在 `surprising-ex` 用户端 Gateway/WS 代码中没有找到完整契约，或前后端仍需进一步核对的事项。报告不代表可以直接修改后端；若要补接口，先定义最小 DTO、权限、幂等和审计影响。

## 阻塞完整产品交付的缺口

### G-001 邀请返佣

- 证据：在 `surprising-ex` 用户 Gateway Controller、API client 和 product API 扫描中未找到 `referral`、`affiliate`、`invite`、`rebate` 用户端 Controller/DTO/Topic。
- 影响：不能实现邀请码、邀请关系、返佣比例、返佣明细、结算状态、邀请记录和提现/抵扣规则。
- 最小建议：提供只读 `GET /api/v1/referral/summary`、`/code`、`/invites`、`/rebates`，并明确分页 cursor、币种单位、结算状态；写入动作需要幂等和安全验证。
- 前端策略：暂不放入正式导航，不使用 mock。

### G-002 用户消息、公告、帮助、客服

- 证据：发现 support repository/admin controller，但未找到面向普通用户的公告、消息收件箱、FAQ 或工单 Controller/DTO。`surprising-admin-web` 的 support 能力属于后台管理域，不能直接当成用户端协议。
- 影响：无法真实实现公告列表/详情、订单/资产/安全通知、帮助中心、客服工单。
- 最小建议：定义 public content API 和 user support API，包含 locale、publishedAt、readAt、unreadCount、ticket status、attachment metadata。
- 前端策略：只保留能力矩阵记录和空的规划入口，不展示假内容。

### G-003 用户设备、会话与登录历史

- 证据：`UserSecurityController` 覆盖密码、MFA、security scenes、verification challenge；未找到设备列表、session revoke、login history 和 anti-phishing code 用户接口。
- 影响：安全中心不能承诺设备管理、活跃会话、登录历史或防钓鱼码。
- 最小建议：定义 `GET /api/v1/security/sessions`、`DELETE /sessions/{id}`、`GET /login-history`、`GET/PUT /anti-phishing-code`，并记录 device fingerprint/IP/time/status。

### G-004 用户端历史订单/成交/仓位/资金流水

- 证据：订单 Controller 有订单写路径和 open order 读取，账户 Controller 有 balance/positions/ledger 等 provider 能力，但现有 Gateway client 只稳定覆盖当前委托、当前仓位和部分钱包 order；后台 admin 查询不能直接暴露给普通用户。
- 影响：历史委托、历史成交、历史仓位、资金费、强平详情和资金流水页面无法承诺完整可用。
- 最小建议：在 Gateway 提供按当前用户隔离的 cursor 分页查询，统一 `limit/cursor/sort`、productLine/accountType、时间范围、状态筛选；返回 DTO 不可暴露 admin 字段。

### G-005 钱包配置和充值提现状态闭环

- 证据：Gateway 有 wallet chains/addresses/deposits/withdrawals，App 也调用 wallet app assets/orders/deposit-address；但前端仍需逐字段核对 network status、confirmation requirement、fee、memo/tag、explorer URL、unknown result 查询和 withdrawal rules 的统一 DTO。
- 影响：无法安全展示所有网络级规则；提现超时只能进入 pending confirmation，不能直接失败或允许重复提交。
- 最小建议：统一 `WalletAssetConfig`、`WalletNetworkConfig`、`WithdrawalQuote`、`WalletOperationStatus`；所有写操作返回 idempotency key/status query 入口。

## 实时协议需要前端重建前的确认

### G-006 L2 snapshot/delta sequence

- 证据：Web/App 都已订阅 `depth`，Web 使用 REST order-book 作为初始数据并根据 `updateType` 合并；当前前端领域模型没有稳定统一的 sequence/firstUpdateId/lastUpdateId adapter。
- 影响：断线、乱序或丢包时可能显示不一致盘口。
- 要求：从 `ClientWebSocketHandler`、`KafkaFanoutConsumer` 发送的 payload 和公开 API DTO 明确 sequence 字段、snapshot 边界、缺口重拉策略。前端统一 adapter 只将一致快照交给 UI。

### G-007 私有事件幂等与最终状态

- 证据：前端已有 processed event key 和 REST refresh 补偿，但订单状态、成交、撤单结果在延迟/乱序情况下的终态优先级需要和后端状态机对齐。
- 影响：可能出现成交后显示撤单、请求超时提示失败或余额短暂覆盖。
- 要求：给出订单状态终态单调规则、eventId/version 字段和查询最终状态接口；前端写操作统一 `pending-confirmation`。

## 非阻塞但必须在重建中收敛的工程缺口

- Web 当前 `App.tsx` 约 3000 行，Flutter `app.dart` 约 8500 行，页面、领域行为和实时处理耦合，需拆分但不能改变协议。
- Web `src/mockData.ts` 与 Flutter fallback 存在离线演示路径；生产默认虽由 Web 环境开关控制，但必须在正式 build gate 中断言关闭。
- Web 和 App 各自维护 models/formatters；应先建立跨端契约表和 golden fixture，避免状态/精度漂移。
- Web `useRealtime` 建立公共/私有连接，但需要统一心跳、网络恢复、stale timer、Abort/cancel、页面卸载清理。
- App `AppState` 已有 offline/fallback 和公共/私有重连，需明确前后台生命周期与重新 snapshot，不得把旧缓存标为 live。
- 目前未见前端统一错误码 mapping、限流/维护/权限/地区限制的领域错误模型。

## 明确不修改的后端边界

本次前端重建不修改撮合、账户、清算、风险、资金费、交割、行权、Kafka topic 或 WebSocket frame。若 G-001 至 G-007 要解除阻塞，先单独提交后端契约/影响方案，并通过现有产品线资金核对与实时链路测试。
