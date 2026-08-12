# 合约 API / Derivatives

## 产品线

前端使用 `X-Product-Line` 区分 `USDT_PERPETUAL`、`COIN_PERPETUAL`、`WEEKLY`、`BIWEEKLY`、`QUARTERLY`、`BIQUARTERLY`。币本位产品不能复用 U 本位的计价、保证金、盈亏或合约面值格式化。

## 能力矩阵

| 能力 | 状态 | 备注 |
| --- | --- | --- |
| 合约下单与撤单 | Partial | trading controller 存在，完整 DTO 需补充 |
| 当前委托与历史委托 | Partial | 订单查询 contract 需补充 |
| 持仓与平仓 | Partial | position/risk controller 存在 |
| 杠杆、保证金模式 | Partial | 需要权限、范围和幂等约定 |
| 资金费率与历史 | Partial | public/private topic 有相关名称 |
| 交割倒计时与交割记录 | Pending | 后端路径与数据模型待补充 |

风险字段应至少支持标记价格、指数价格、强平价格、保证金、保证金率、未实现盈亏、收益率和风险状态。前端展示缺字段时使用破折号并提示后端待补充，不使用假数字。
