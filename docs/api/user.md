# 用户、KYC 与账户资料 / User and Compliance

## 已确认或部分确认

| 能力 | 路径 | 状态 | 说明 |
| --- | --- | --- | --- |
| KYC 状态 | `/api/v1/compliance/kyc` | Confirmed | 返回后端审核状态、等级、拒绝原因和过期时间 |
| KYC 提交 | `/api/v1/compliance/kyc` | Confirmed | `documentIds` 必须来自真实上传接口 |
| KYC 文件 | `/api/v1/compliance/kyc/documents` | Confirmed | multipart；内容类型和大小由后端存储服务校验 |
| 用户资料 | gateway/account 相关接口 | Partial | 后端待补充独立 user profile contract |
| 通知 | `/api/v1/notifications` | Confirmed | 查询、单条已读、全部已读 |

KYC 状态至少需要稳定枚举：`NOT_VERIFIED`、`BASIC`、`ADVANCED`、`PENDING`、`APPROVED`、`REJECTED`。如果实际后端枚举不同，应在 mapper 中集中适配，不应散落在页面中。

证件文件上传、身份信息、国家/地区、人脸认证和拒绝原因均属于高敏数据。后端必须提供内容类型、大小限制、存储策略、审核时效和脱敏日志规范后，前端才接通真实提交。
