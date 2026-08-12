# 现货 API / Spot Trading

## 交易接口

| 方法 | URL | 状态 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/v1/gateway/trading/orders` | Confirmed | 是 |
| DELETE/POST | 订单撤单路径 | Partial，精确 method/path 待后端补充 | 是 |
| GET | 当前委托、历史委托、成交历史路径 | Partial | 是 |

下单 body 至少需要由 instrument 决定的 `symbol`、`side`、`type`、`quantity`、`price` 或市价字段，以及客户端订单号 `clientOrderId`。限价、市价、止盈止损的完整字段、最小数量、最小名义价值、手续费和风控错误必须由后端 DTO 明确。

客户端不得把 HTTP 200 视为成交成功。下单成功只代表请求被接受，最终状态以订单查询或私有推送为准；超时后必须按 clientOrderId 查询，禁止盲目重试。
