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
| GET | `/api/v1/auth/me` | Confirmed，返回当前 JWT principal | Bearer |
| POST | `/api/v1/auth/verify-email` | Confirmed | 否 |
| POST | `/api/v1/auth/resend-email-verification` | Confirmed | Bearer |

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

## Telegram 快捷登录

登录和注册均可直接使用 Telegram，不填写密码、邮箱或手机号。服务端验证 Telegram 的 OIDC 身份后返回与普通登录相同的会话，或要求现有的安全验证。用户昵称使用 `user.displayName`；`username` 和 `email` 可以为空。

- `GET /api/v1/auth/telegram/config` → `{enabled}`。
- `POST /api/v1/auth/telegram/start` → `{flowId, verifier, authorizationUrl, expiresAt}`，沿用设备 ID 请求头。
- 在浏览器弹窗打开 `authorizationUrl`。
- `POST /api/v1/auth/telegram/complete`，正文 `{flowId, verifier}`，沿用同一设备 ID。等待授权时返回 `{pending:true}`，成功返回现有 `AuthSession` 或 `LoginChallenge`。

回调路径 `/api/v1/auth/telegram/callback` 由后端处理。客户端不接收 Telegram Client Secret，也不将领取 verifier 放入 URL、localStorage 或会话缓存。取消或离开页面会中止轮询，关闭弹窗，不接受迟到结果。

2026-10-20 验证：Web 测试 324 项通过，lint/build 通过；本机 Chromium 在 320/390/1440 像素、深浅主题共 6 个场景验证了空密码/空邮箱登录、昵称显示与无横向溢出。这些场景使用明确标识的模拟 Telegram 提供方，不能代替真实 Telegram 授权验收。浏览器验收脚本：`scripts/telegram-login-browser.mjs`。
