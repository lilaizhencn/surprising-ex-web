# 安全中心 API / Security

| 能力 | URL | 状态 |
| --- | --- | --- |
| 安全场景 | `/api/v1/security/scenes` | Confirmed/Partial |
| MFA 状态 | `/api/v1/security/mfa/status` | Confirmed/Partial |
| MFA 启用、验证、禁用 | `/api/v1/security/*` | Partial，动作路径待补充 |
| Passkey | 未确认 | Pending |
| 设备与登录历史 | 未确认 | Pending |
| API Key 管理 | security 相关 controller | Partial |

所有高风险操作需要后端返回 challenge、过期时间、重试次数和冷静期状态。前端只展示后端返回的安全等级与状态，不自行推断“已安全”或绕过验证。
