# 期权 API / Options

当前期权页已接入真实行情、期权链、交易、持仓、保护条件单和现金行权记录。
公开合约来自 instrument/list 与 instrument/latest，均携带 OPTION 产品维度，交易请求使用永久 instrumentId。
链按标的身份和精确到期时刻分组，支持 CALL/PUT；价格和数量按返回的资产精度、tick 和 step 换算。

`GET /api/v1/gateway/candlestick/options/quote` 提供零贴现 Black-76 参考 IV 与 Greeks，
页面标明参考模型和单位。缺失、过期或超出模型范围不造数；参考估值不替代 Core 风险准入和到期结算。
普通单沿用 trading 的持久请求身份及 realtime 回执恢复；CLOSED 合约只保留查询，不接受新委托。

保护条件单入口：

- `POST /api/v1/gateway/trading-trigger`：独立条件单。
- `POST /api/v1/gateway/trading-trigger/batch`，`atomic=true`：TP/SL 双腿 OCO。
- `POST /api/v1/gateway/trading-trigger/cancel`：单笔撤销。
- `GET /api/v1/gateway/trading-trigger/submission?userId=...&clientTriggerOrderId=...`：独立下单原回执。
- `GET /api/v1/gateway/trading-trigger/cancellations/{triggerOrderId}?userId=...`：原撤销回执。
- `GET /api/v1/gateway/trading-trigger/oco-submission?userId=...&takeProfitClientId=...&stopLossClientId=...`：原 OCO 回执。

两端支持 MARK/LAST/INDEX 触发及 MARKET/LIMIT 执行，校验减仓方向、数量和仓位设置。
独立请求、OCO 双腿或撤销身份在发送前持久保存；响应丢失、刷新和重建仅查询原 realtime 结果，
未知或读取失败继续保留待确认，不能自动重发。触发及命令成功不保证成交，条件单费用在触发成交时计算。

私有状态沿用 accountState、orders、triggerOrders、executionReports、positions 和 positionRisk 的版本化快照，
公共盘口按 SNAPSHOT/DELTA 和 previousSequence 恢复。现金行权记录使用产品账本的 OPTION_EXERCISE，
按实际币种精度展示真实现金变动，不能把零现金记录缺席推断为没有完成行权。

独立条件单恢复需发布匹配的 gateway 与两端，并保持既有 realtime 回执导出和迁移就绪；本轮没有新 SQL。
真实期权实测及清理记录见 `docs/validation/option-single-trigger-20261020.json`。
完整定价曲线、组合 Greeks、其他产品流程和本轮原生设备验收不在该模块的完成范围。
