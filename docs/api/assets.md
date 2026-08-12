# 资产 API / Assets

| 能力 | 路径或范围 | 状态 |
| --- | --- | --- |
| 产品账户余额 | `/api/v1/gateway/account/product-balances` | Confirmed |
| 资产最小单位 | `/api/v1/gateway/instrument/asset-scales` | Confirmed |
| 资产明细 | account/wallet 相关接口 | Partial |
| 充值地址 | wallet/gateway 相关接口 | Partial |
| 充值记录 | wallet 相关接口 | Partial |
| 提现 | wallet 相关接口 | Partial |
| 提现记录 | wallet 相关接口 | Partial |

余额响应必须能区分总额、可用、冻结、估值币种和更新时间。金额精度、资产 scale、估值价格来源必须来自后端；前端不能通过浮点数累加制造财务余额。

前端划转使用 `asset-scales` 将展示数量转换成整数最小单位。充值/提现地址、网络和安全校验已接入；Memo/Tag、手续费、限额、确认数和白名单字段仍待后端 DTO 标准化。
