# 充提与划转 API / Funding

## 划转

| 方法 | URL | 状态 |
| --- | --- | --- |
| POST | `/api/v1/gateway/account/transfers` | Confirmed |
| GET | `/api/v1/gateway/account/transfers?accountType=SPOT` | Confirmed |

划转 body 至少包含来源产品线、目标产品线、资产和最小单位数量。请求必须携带 `Idempotency-Key`；超时后使用 request id 或后端查询接口确认，不重复扣款。划转记录按目标产品账户查询，支持 `asset`、`limit`、`cursor` 和 `sort`。当前前端会把失败转换为可读错误，并显示受理状态，不声称资金已到账。

| GET | `/api/v1/gateway/account/ledger` | Confirmed |
| GET | `/api/v1/gateway/account/product-ledger?accountType=SPOT` | Confirmed |

## 充值与提现

| GET | `/api/v1/wallet/chains` | Confirmed |
| POST | `/api/v1/wallet/addresses` | Confirmed |
| GET | `/api/v1/wallet/deposits` | Confirmed |
| GET | `/api/v1/wallet/withdrawals` | Confirmed |
| POST | `/api/v1/wallet/withdrawals` | Confirmed；需要 `Idempotency-Key`、邮箱验证码、TOTP、已验证 KYC |

Memo/Tag、确认次数、限额、手续费和地址簿字段由托管服务返回；当前前端不推断或伪造这些值。
