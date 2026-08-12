# Surprising EX API 文档 / API Documentation

本文档基于 `/Users/atomex/Desktop/surprising/surprising-ex` 后端源码、旧前端实际调用和网关 DTO 审计生成。它是前端接入契约，不把未在后端源码中确认的能力写成已实现接口。

## 约定

- REST 前缀：`/api/v1`。
- 交易产品线通过 `X-Product-Line` 请求头传递；部分网关接口也接受同名 query 参数。
- 需要用户身份的请求沿用旧前端的 `Authorization: Bearer <accessToken>` 和 `X-User-Id`。
- 登录响应包含 access token、refresh token 和用户标识；具体字段以 `AuthSessionSchema` 的兼容解析为准，后端字段变更必须同步 DTO mapper。
- 金额、数量、价格可能以最小单位整数传输，精度由 instrument 的 tick、step、scale 或 ppm 字段决定，前端不得直接把整数当作展示金额。
- 行情时间统一转为 ISO 8601；表格展示按用户浏览器时区渲染，交易服务端时间不做本地化改写。
- 写操作不自动重试；订单使用 `clientOrderId`，划转使用 `Idempotency-Key`，未知结果必须查询确认。
- 列表接口的分页、排序和 cursor 细节在后端未形成统一公共 DTO，文档中标为“后端待补充”。

## 文档索引

| 领域 | 文档 |
| --- | --- |
| 认证 | [auth.md](./auth.md) |
| 用户与 KYC | [user.md](./user.md) |
| 行情 | [market.md](./market.md) |
| 现货 | [spot.md](./spot.md) |
| 合约 | [derivatives.md](./derivatives.md) |
| 期权 | [options.md](./options.md) |
| 资产 | [assets.md](./assets.md) |
| 充提与划转 | [funding.md](./funding.md) |
| 安全 | [security.md](./security.md) |
| 订单 | [orders.md](./orders.md) |
| 错误与一致性 | [errors.md](./errors.md) |
| 前端接口矩阵 | [frontend-integration-matrix.md](./frontend-integration-matrix.md) |
| 后端待补清单 | [backend-gaps.md](./backend-gaps.md) |
| 通知 | [notifications.md](./notifications.md) |
| 帮助中心 | [help.md](./help.md) |
| OpenAPI 草案 | [openapi.yaml](./openapi.yaml) |

## 证据与状态

`Confirmed` 表示后端 controller/router 或旧前端真实调用已确认；`Partial` 表示存在相关 service/controller，但完整 request/response 仍需后端补充；`Pending` 表示当前前端只提供契约占位，不会伪造成功结果。
