# 安全中心 API / Security

| 能力 | URL | 状态 |
| --- | --- | --- |
| 安全场景 | `/api/v1/security/scenes` | Confirmed/Partial |
| MFA 状态 | `/api/v1/security/mfa` | Confirmed |
| MFA 启用、验证、禁用 | `/api/v1/security/mfa/enroll`, `/confirm`, `/disable` | Confirmed |
| Passkey | 未确认 | Pending |
| 当前会话 | `GET /api/v1/security/sessions` | Confirmed |
| 撤销单个会话 | `POST /api/v1/security/sessions/{sessionId}/revoke` | Confirmed |
| 撤销其他会话 | `POST /api/v1/security/sessions/revoke-all` | Confirmed |
| 登录历史 | `GET /api/v1/security/login-history` | Confirmed |
| Passkey | 未确认 | Pending |
| 密码修改 | `/api/v1/security/password` | Confirmed；需要当前密码、邮箱验证码、TOTP |
| 安全验证 challenge | `/api/v1/security/verification/challenge`, `/verify` | Confirmed |
| API Key 管理 | `/api/v1/security/api-keys` | Confirmed；写操作需要邮箱验证码、TOTP |

所有高风险操作需要后端返回 challenge、过期时间、重试次数和冷静期状态。前端只展示后端返回的安全等级与状态，不自行推断“已安全”或绕过验证。
