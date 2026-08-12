# 认证 API / Authentication

## 已确认能力

| 方法 | URL | 状态 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | Confirmed | 否 |
| POST | `/api/v1/auth/register` | Confirmed | 否 |
| POST | `/api/v1/auth/forgot-password` | Confirmed | 否 |
| POST | `/api/v1/auth/reset-password` | Confirmed | 否 |
| POST | `/api/v1/auth/refresh` | Partial，字段需后端确认 | 否，使用 refresh token |
| POST | `/api/v1/auth/logout` | Partial，调用方式需后端确认 | 是 |

## 请求与响应

登录、注册和找回密码的具体字段以认证 DTO 为准。新前端只发送用户输入的 `email`、`password`、`code`、`resetToken` 等已存在字段，不会在未知字段上做猜测；后端若要求 phone、captcha 或 MFA challenge，应在 DTO/OpenAPI 中补齐。

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
