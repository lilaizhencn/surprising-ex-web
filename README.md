# Surprising EX Web

Stitch 驱动的 Surprising EX 前端工程。`surprising-ex` 是后端，`surprising-ex-web` 是已废弃旧前端；本项目不从旧前端复制页面代码。

## 本地运行

```bash
bun install
cp .env.example .env.local
bun run dev
```

可选的本地演示数据必须显式设置 `VITE_ENABLE_DEMO_DATA=true`，并只用于后端不可用时的视觉开发。默认值为关闭。

## 检查命令

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

部署配置位于 [`wrangler.jsonc`](./wrangler.jsonc)，输出目录为 `dist`，深层路由使用 SPA fallback。API 接口文档位于 [`docs/api/README.md`](./docs/api/README.md)。

## 语言与交易委托交互

右上角自定义语言菜单支持英文、简体中文和国旗图标；首次访问默认英文，选择持久化到 `surprising-ex.language`。`src/i18n` 使用英文文案作为 key；切换语言保留当前合约、输入和盘口订阅。全局样式隐藏浏览器滚动条，但保留鼠标、触控和键盘滚动。

限价输入右侧 BBO 开关支持对手价/同向价的第 1、第 5 档；前端只传模式，由后端真实盘口定价。止盈止损区域支持单向保护和双向 OCO；Trigger type 右侧问号支持悬停和键盘聚焦，按当前方向展示触发规则。双向模式分别设置止损、止盈触发价与市价/限价委托，共用平仓数量并原子提交；当前来源是标记价，仍受已有持仓可平数量约束。
