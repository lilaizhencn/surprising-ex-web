# 行情 API / Market Data

## REST 快照

| 方法 | URL | 状态 | 关键参数 |
| --- | --- | --- | --- |
| GET | `/api/v1/gateway/instrument` | Confirmed | `productLine`、交易对筛选 |
| GET | `/api/v1/gateway/candlestick` | Confirmed | `symbol`、`interval`、时间范围 |
| GET | `/api/v1/gateway/price/mark` | Partial | 产品线与交易对 |
| GET | `/api/v1/gateway/account/product-balances` | Confirmed | 需要鉴权 |

Instrument 返回的 tick size、quantity step、contract size、精度和资产币种是下单和展示的唯一精度来源。若字段缺失，前端必须阻止下单或标记“后端待补充”。

## WebSocket / SSE

旧前端使用 `/ws/v1`。后端源码审计确认或部分确认以下 topic：`candles`、`depth`、`trades`、`index`、`mark`、`funding`，私有 topic 包括 `orders`、`matches`、`executionReports`、`positions`、`accountRisk`、`positionRisk`、`triggerOrders`。

协议细节仍需后端补充：认证握手、订阅消息、心跳、重连退避、序列号、快照与增量边界、错误帧和限频。深度图必须按 REST 快照加 sequence 增量合并，不能只使用页面静态数组。
