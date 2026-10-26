# 导航与界面验收（2026-10-26）

本轮验证公共导航、共享控件与主题；后台另包含运营总览的数据状态。整体精修目标仍在进行，未把本轮范围视为所有页面已验收。

## 环境与结果

- macOS 26.7.2；Chrome 156.0.8078.47，本地 Vite 页面，Playwright 真实点击/输入/选择/滚动/切换/返回。
- 尺寸：1440×960；320/390/768/1024/1280×844；深浅主题、长显示名称、减少动态效果。
- `bun run lint`、`bun run typecheck`、`bun run test`、`bun run build` 均通过；505 项测试（53 文件）通过。
- 结构化结果：[navigation-polish-20261026.json](navigation-polish-20261026.json)。
- 截图及完整日志本机归档：`/Users/atomex/.codex/artifacts/surprising-web-polish-20261026/client/`；截图不纳入源码提交。

## 浏览器流程

- desktop submenu keyboard, Escape and focus return
- Coin-M route keeps product navigation active; browser Back
- theme switching and reload persistence
- 320/390/768/1024/1280px: no overflow, focus trap, Escape, focus return and scroll restoration
- backdrop closes mobile navigation
- mobile Coin-M delivery selection closes navigation and browser Back restores page
- authenticated 320/390px layout and mobile sign-out
- reduced motion and resize to desktop closes drawer
- navigation lifecycle: 30 open/close cycles over 61731ms; scrolling restored each time

## 连续运行观察

一分钟内反复开关 30 次；每次确认对话框关闭及 body 滚动恢复。CDP 在强制 GC 后采样。
监听器 209 → 209；DOM 节点 223 → 223；
JS 堆 19631496 → 19863696 字节；页面任务执行时间增量
1.320 秒。完整时间序列在 JSON 中。
本次短时样本未见监听器累积；堆有少量增长，不能据此推断长时间运行不存在泄漏，也不是性能优化结论。

验收脚本已显式释放采样用 CDP 连接；修正后再次执行完整流程及短时采样，确认进程正常退出。

## 边界与未测项

- HTTP 错误、加载、成功响应及会话来自隔离的浏览器契约桩；没有执行真实后端写入。
- 未启动交易后端或 wallet；真实行情、下单、资金、审批与生产网络端到端联调未验证。
- 未验证 Safari/Firefox、原生 iOS/Android、数小时持续运行及全站所有业务表单。
- 这批变更没有调整后端接口、金融单位或产品线契约。

## 复现

启动本项目开发页；客户端使用 5183 端口，后台使用 5184 端口，或通过 `QA_URL` 指定地址。
设置 `QA_PLAYWRIGHT_MODULE` 为已安装 Playwright 模块路径，按需设置 `QA_CHROMIUM`，然后执行：

```bash
QA_SOAK_MS=60000 node scripts/navigation-polish-qa.mjs
```

脚本默认截图输出到 `/tmp/`；可通过 `QA_OUTPUT` 自定义归档路径。
