# 错误、幂等与一致性 / Errors and Consistency

前端 API Client 兼容以下错误字段：`code`、`message`、`error`、`details`、`requestId`。后端应统一返回 JSON 错误 envelope，并在 HTML 反向代理错误页时让前端显示通用网络错误，不把 HTML 当作成功 JSON。

## 建议状态码

| 状态码 | 含义 |
| --- | --- |
| 400 | 参数、精度、最小订单或网络校验失败 |
| 401 | access token 失效 |
| 403 | 权限、KYC 或风险限制 |
| 404 | 资源不存在 |
| 409 | 重复请求、状态冲突或幂等键冲突 |
| 422 | 业务规则拒绝 |
| 429 | 限频 |
| 5xx | 服务或上游异常 |

建议错误码、分页 DTO、request id header、限频响应和时间格式由后端正式发布后替换本节建议值；当前不能把这些建议当作已确认 contract。

交易、划转、提现均不能通过通用 retry 自动重放。发生网络超时、连接断开或未知结果时，必须使用业务 id 查询最终状态。
