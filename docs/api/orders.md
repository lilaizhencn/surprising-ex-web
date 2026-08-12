# 订单与历史 API / Orders and History

当前委托、历史委托、账本和划转记录已接入真实 Gateway 查询；成交历史、持仓历史、资金费、交割、充值和提现记录仍需统一分页、状态和时间范围查询。后端审计确认交易与触发单相关 controller/service，但未确认全部公开 URL 和统一响应 DTO。

统一待补字段：`id`、`clientOrderId`、`symbol`、`productLine`、`side`、`type`、`status`、`price`、`quantity`、`filledQuantity`、`averagePrice`、`fee`、`feeAsset`、`createdAt`、`updatedAt`。

状态必须来自后端枚举；未知状态要保留原值并降级为 neutral badge，不能误判为成功、成交或已撤单。导出能力当前只有入口占位，未连接下载接口。
