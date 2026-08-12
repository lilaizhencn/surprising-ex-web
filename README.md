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
