# C2C 聊天接入

入口为 `/c2c` 和 `/c2c/messages`，使用交易账号登录。页面提供会话检索、未读数、订单会话、商家咨询、最近消息及向前分页、实时补拉、已读、快捷回复、文字及 JPG/PNG/PDF 附件。订单弹窗只查询真实订单和费用，聊天消息不会确认付款或触发放币。

行情和聊天共用应用持有的 `/ws/v1`。页面只取得 `acquireRealtimeConnections` 订阅句柄，使用 `c2c.inbox` 与 `c2c.messages`，没有新建聊天 WebSocket。HTTP 获取最近 50 条，再按精确字符串游标订阅后续消息；向前翻页不回退恢复游标。关闭聊天订阅保留其他行情订阅。交易账号变化时，旧页面和私有订阅退出，附件 Blob URL 释放，未完成响应不会写入新账号页面。

发送前把固定请求号和原正文保存在当前浏览器标签页的用户及会话作用域。发送结果未知时保留原请求，用户点击“查询并重试”后先查询回执；已发送直接恢复原消息，尚未确认才重发同一请求。不会自动换请求号重新发送。附件通过交易 Gateway 的鉴权 multipart 接口上传至私有 R2；页面从鉴权接口读取 Blob，离开可见区域或退出页面时释放对象 URL。不依赖社交服务的登录、接口、前端包或运行进程。

## 验证

2026-10-20：`npm run lint`、`npm run build`、318 项 Vitest 通过。本地 Chromium 在 1440×1000、390×844、明暗主题下完成双账号收发、未知结果去重、离线补拉、历史滚动锚点、私有图片、订单查询、隐私拒绝和账号切换。证据位于 [validation/c2c-chat-20261020/evidence.json](validation/c2c-chat-20261020/evidence.json)。

浏览器夹具使用真实 PostgreSQL 独占 schema、真实 HTTP/共享 WebSocket 处理器和文件存储，身份和 Core 调用受控。行情验证到同连接的 trades 订阅 ACK，没有启动实际 Core 行情链路；真实 R2 上传验证记录在后端的独立证据中。Flutter 与管理端已在各自项目接入；服务器发布和手机新包安装仍延后。

复验时在后端显式运行 `C2cBrowserQaTest`，设置独占的 `/tmp/surprising-c2c-web-qa-*` 目录、既有 PostgreSQL 测试环境变量及 JDK 27。从该目录 `runtime.json` 取得监听端口，启动本 Web 的 Vite：`VITE_API_PROXY_TARGET` 与 `VITE_WS_PROXY_TARGET` 指向夹具，`VITE_WS_BASE_URL=ws://127.0.0.1:17173/ws/v1`，监听 `127.0.0.1:17173`。准备独立 Playwright 工具环境后运行 `scripts/c2c-chat-browser.mjs`，可用 `C2C_PLAYWRIGHT_MODULE` 和 `C2C_CHROMIUM_EXECUTABLE` 指定工具路径。结束后写入夹具目录的 `done` 文件，使后端关闭服务器并清理自己的 schema 和文件。

已读请求在途时继续合并新的已见水位，完成原请求后确认最新位置。真实 Gateway 浏览器新增已读并发场景，共 13 项通过；另有明确的空数据/故障注入浏览器场景验证会话列表错误可在原连接上重订阅。后者不冒充真实业务数据或服务器故障。最终 Vitest 为 319 项，lint/build 通过。
