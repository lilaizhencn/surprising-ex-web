# 后端待补接口清单 / Backend Gap List

以下项目来自后端源码与旧前端能力对比，不代表前端可以自行实现。

1. 发布统一 OpenAPI 或 DTO 示例，覆盖分页、排序、错误 envelope、request id 和时间格式。
2. 明确 auth refresh/logout、MFA challenge、设备信任和账户锁定接口。
3. 补充独立 user profile、通知、设备管理、登录历史和账户活动接口。
4. 补齐 KYC 上传、提交、审核结果、拒绝原因和重新提交 contract。
5. 补齐深度快照/增量 WebSocket 协议，包括 sequence、心跳和重连恢复。
6. 补齐现货/合约撤单、订单历史、成交历史、触发单和统一订单状态 DTO。
7. 补齐持仓、杠杆、保证金模式、资金费率历史、交割和结算接口。
8. 发布期权链、报价、Greeks、下单、持仓、结算和私有推送协议。
9. 发布 wallet 充值地址、网络、Memo/Tag、确认、提现限额/手续费、白名单和状态查询接口。
10. 发布划转记录与未知结果查询接口，并明确幂等键生命周期。
11. 明确金额/数量/价格 scale、tick、step、contract size、ppm 等字段的整数单位。
12. 为高风险操作提供 challenge、冷静期、风控状态和审计 request id。
