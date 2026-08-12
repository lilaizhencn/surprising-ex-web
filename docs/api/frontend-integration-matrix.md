# 前端接口矩阵 / Frontend Integration Matrix

| 页面 | 所需 API | 当前状态 | WebSocket | 阻塞 | 演示 fallback |
| --- | --- | --- | --- | --- | --- |
| 首页 | instrument、行情快照 | 已接 API；本地开发可显式开启演示 | 否 | 无 | 仅 `VITE_ENABLE_DEMO_DATA=true` |
| 行情 | instrument、candlestick | 已接 REST | 推荐 candles/depth/trades | WS 协议细节 | 同上 |
| 现货交易 | instrument、candles、orders、balances | 下单和余额入口已接；深度/成交待 WS | 是 | WS 订阅与订单簿协议 | 不伪造成交 |
| U 本位永续 | instrument、orders、positions、risk、funding | 页面框架已完成 | 是 | 完整 DTO 与权限 | 不伪造持仓 |
| 币本位永续 | 同上，币本位精度/计价 | 页面框架已完成 | 是 | 币本位 contract | 不伪造盈亏 |
| 交割合约 | instrument、delivery、settlement | 待后端接口 | 是 | 交割接口缺失 | 否 |
| 期权 | option chain、quotes、orders、positions | 待后端接口 | 是 | 期权 contract 缺失 | 否 |
| 资产总览 | product-balances、估值/明细 | 已接余额 | 可选私有余额推送 | 明细 DTO | 仅本地无会话演示 |
| 充值 | wallet address、network、records | 页面流程占位 | 否 | 地址/网络接口 | 否 |
| 提现 | wallet withdraw、limits、security | 页面流程占位 | 否 | 提现与风控 contract | 不伪造成功 |
| 划转 | account/transfers、records | 已接 POST | 可选私有状态 | records 路径待补 | 不伪造到账 |
| 登录/注册 | auth login/register/refresh | 已接 | 否 | 字段与 MFA challenge 需确认 | 否 |
| KYC | compliance/kyc | 状态已接；提交演示 | 否 | 真实审核 contract | 演示流程明确标记 |
| 安全中心 | security scenes/mfa | 已接状态查询 | 否 | 写操作路径待补 | 否 |
| 订单中心 | orders/history/funding | 页面框架 | 可选私有事件 | 统一分页与历史路径 | 否 |
| 通知/帮助 | notifications/help | Pending | 否 | 后端内容 API 缺失 | 否 |
