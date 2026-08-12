# 通知 API / Notifications

| 方法 | URL | 鉴权 | 状态 |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications?unreadOnly=false&limit=50` | Bearer JWT | Confirmed |
| POST | `/api/v1/notifications/{notificationId}/read` | Bearer JWT | Confirmed |
| POST | `/api/v1/notifications/read-all` | Bearer JWT | Confirmed |

通知记录由后端业务事件生产方写入 `gateway_user_notifications`。空数组表示当前用户没有通知，不是演示数据。返回字段：`notificationId`、`category`、`title`、`body`、`readAt`、`createdAt`。
