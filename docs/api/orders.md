# 订单与历史 API

用户查询沿用已认证网关的产品与账户隔离：当前状态读取 realtime 视图，历史读取 realtime exporter 已提交的 SQL 投影，交易 Core 处理交易命令。

| GET | 查询 | 分页与筛选 |
| --- | --- | --- |
| `/api/v1/gateway/trading/history` | 本人终态委托 | `instrumentId`、`status=FILLED/CANCELED/REJECTED`、创建时间 `startTime/endTime`（毫秒，含两端）、`cursor`、`limit`；默认 100，最多 1000 |
| `/api/v1/gateway/trading/trades` | 本人 Maker/Taker 执行 | `instrumentId`、本人 `orderId`、成交时间 `startTime/endTime`、`cursor`、`limit`；不返回对手身份 |

历史返回 `{count, orders, nextCursor, hasMore, sort, limit}`；`sort=updatedAt.desc` 与 SQL 按更新时间及订单号倒序一致。状态先过滤再分页，OPEN 不进入历史；创建时间区间独立于更新时间排序。界面把游标和原账户/产品/筛选绑定，不能丢弃后续页，也不能把迟到页追加到新查询。大整数按字符串处理。

历史中的 `priceTicks/averagePriceTicks` 乘真实 `priceTickUnits`，按报价币 scale 显示；均价允许小数 tick。数量按真实 step/scale；`cumulativeFeeUnits` 是原累计手续费，不能用最新费率重算。手机显示完整卡片。用户成交的签名 `feeRatePpm` 是历史费率，不等于实际已扣金额。

需配套 gateway 新状态参数及 sort 修正，无新迁移或 topic。现货实栈范围、失败修正与清理见 `docs/validation/spot-order-history-20261020.json`，成交记录见 `docs/validation/spot-private-fills-20261020.json`。
