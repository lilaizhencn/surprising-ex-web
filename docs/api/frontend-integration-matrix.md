# 前端接口矩阵 / Frontend Integration Matrix

| 页面 | 所需 API | 当前状态 | WebSocket | 阻塞 | 演示 fallback |
| --- | --- | --- | --- | --- | --- |
| 首页 | instrument、行情快照 | 已接 API；本地开发可显式开启演示 | 否 | 无 | 仅 `VITE_ENABLE_DEMO_DATA=true` |
| 行情 | instrument、candlestick | 已接 REST | 推荐 candles/depth/trades | WS 协议细节 | 同上 |
| 现货交易 | instrument、candles、orders、balances、depth、latest-trade | REST snapshot、下单、开单查询、撤单已接；WS 待接 | 是 | WS 订阅与订单簿增量协议 | 不伪造成交 |
| U 本位永续 | instrument、orders、positions、position-mode | REST snapshot、下单、撤单、持仓读取已接 | 是 | risk/funding 私有 DTO | 不伪造持仓 |
| 币本位永续 | 同上，币本位精度/计价 | REST snapshot、下单、撤单、持仓读取已接 | 是 | risk/funding 私有 DTO | 不伪造盈亏 |
| 交割合约 | instrument、orders、positions | 页面与产品线参数已接 | 是 | 交割历史和结算 DTO | 不伪造结算 |
| 期权 | instrument、orders、positions | 页面与产品线参数已接 | 是 | option chain/Greeks DTO | 不伪造期权报价 |
| 资产总览 | product-balances、估值/明细 | 已接余额 | 可选私有余额推送 | 明细 DTO | 仅本地无会话演示 |
| 充值 | wallet address、network、records | 已接真实地址、网络和记录 | 否 | 托管服务运行配置 | 否 |
| 提现 | wallet withdraw、limits、security | 已接真实提交、历史、KYC/风控/邮箱+TOTP校验 | 否 | 限额字段需 DTO 标准化 | 不伪造成功 |
| 划转 | account/transfers、records | 已接 POST、真实记录查询 | 可选私有状态 | 未知结果查询 | 不伪造到账 |
| 登录/注册 | auth login/register/refresh/logout | 登录 TOTP、刷新、退出会话已接 | 否 | 设备信任与账户锁定 DTO | 否 |
| KYC | compliance/kyc、kyc/documents | 状态、文件上传、提交已接 | 否 | 审核异步状态由后端返回 | 否 |
| 安全中心 | security scenes/mfa/password/api-keys | 状态和高风险写操作已接 | 否 | 设备/Passkey暂无用户接口 | 否 |
| 订单中心 | openOrders、allOrders、cancel、ledger、transfers | 已接真实查询、撤单、账本和划转记录 | 可选私有事件 | 成交/资金流水统一 DTO | 否 |
| 通知/帮助 | notifications、help/articles | 通知读/已读与帮助搜索已接 | 否 | 通知生产事件需业务模块接入 | 否 |
