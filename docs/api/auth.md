# 认证 API / Authentication

## 已确认能力

| 方法 | URL | 状态 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Confirmed | 否 |
| POST | `/api/v1/auth/register` | Confirmed | 否 |
| POST | `/api/v1/auth/forgot-password` | Confirmed | 否 |
| POST | `/api/v1/auth/reset-password` | Confirmed | 否 |
| POST | `/api/v1/auth/refresh` | Partial，字段需后端确认 | 否，使用 refresh token |
| POST | `/api/v1/auth/logout` | Confirmed，按 refresh token 撤销当前会话 | 否，提交 refresh token |

## 请求与响应

登录、注册和找回密码的具体字段以认证 DTO 为准。登录可选提交 `totpCode`，用于已启用 MFA 的账户。退出登录提交当前 refresh token；后端按 token 精确撤销会话，重复调用安全地保持幂等。

成功登录必须返回：

- access token 或等价会话凭据；
- refresh token 或明确声明不支持刷新；
- user id；
- 可选的 MFA challenge 状态。

失败响应应使用统一错误结构，见 [errors.md](./errors.md)。401 后由 API Client 尝试一次 refresh；refresh 失败则清除本地会话并回到登录页。

## 安全要求

- 密码只通过 HTTPS 发送，不写入 localStorage、日志或错误消息。
- 登录、注册、找回密码均不得在前端展示真实账户是否存在的敏感差异，具体由后端统一文案。
- 重复提交必须由后端按 challenge、token 或 request id 幂等处理。
