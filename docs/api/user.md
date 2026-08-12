# 用户、KYC 与账户资料 / User and Compliance

## 已确认或部分确认

| 能力 | 路径 | 状态 | 说明 |
| --- | --- | --- | --- |
| KYC 状态 | `/api/v1/compliance/kyc` | Partial | controller/service 存在，完整 DTO 与审核状态需补充 |
| KYC 提交 | `/api/v1/compliance/kyc` | Pending | 新前端只展示演示流程，不宣称真实认证 |
| 用户资料 | gateway/account 相关接口 | Partial | 后端待补充独立 user profile contract |
| 通知 | 未确认 | Pending | 当前前端展示待接入状态 |

KYC 状态至少需要稳定枚举：`NOT_VERIFIED`、`BASIC`、`ADVANCED`、`PENDING`、`APPROVED`、`REJECTED`。如果实际后端枚举不同，应在 mapper 中集中适配，不应散落在页面中。

证件文件上传、身份信息、国家/地区、人脸认证和拒绝原因均属于高敏数据。后端必须提供内容类型、大小限制、存储策略、审核时效和脱敏日志规范后，前端才接通真实提交。
