# 后端待补接口清单 / Backend Gap List

以下项目来自后端源码与旧前端能力对比，不代表前端可以自行实现。

1. 发布统一 OpenAPI 或 DTO 示例，覆盖分页、排序、错误 envelope、request id 和时间格式。
2. auth refresh/logout、MFA challenge 已有实现；仍需补充设备信任、Passkey、用户设备列表和账户锁定状态接口。
3. 补充独立 user profile、设备管理和账户活动接口；通知查询、帮助文章查询已补入 Gateway。
4. KYC 上传、提交、审核结果、拒绝原因和重新提交已补入 Gateway；仍需合规服务明确异步审核 SLA。
5. 补齐深度快照/增量 WebSocket 协议，包括 sequence、心跳和重连恢复。
6. 现货/合约撤单和订单历史已通过 Binance-compatible Gateway 接入；成交历史、触发单和统一订单状态 DTO 仍需补齐。
7. 补齐持仓、杠杆、保证金模式、资金费率历史、交割和结算接口。
8. 发布期权链、报价、Greeks、下单、持仓、结算和私有推送协议。
9. wallet 充值地址、网络、充值/提现记录、提现安全校验已接；仍需标准化 Memo/Tag、确认、限额/手续费、白名单字段。
10. 划转记录已通过 `/api/v1/accounts/transfers` 暴露并由 Gateway 转发；仍需补充未知结果查询接口，并明确幂等键生命周期。
11. 明确金额/数量/价格 scale、tick、step、contract size、ppm 等字段的整数单位。
12. 为高风险操作提供 challenge、冷静期、风控状态和审计 request id。
