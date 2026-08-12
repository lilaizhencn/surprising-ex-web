# 前端架构 / Frontend Architecture

Stitch 导出项目是唯一视觉基线；旧前端只用于审计、API 兼容和 Cloudflare 配置迁移。当前工程使用 React + Vite + TypeScript strict，页面、业务组件、API Client、mapper、状态和样式 token 分层。

## 数据流

`页面 -> feature endpoint -> apiClient -> 后端 REST/WS -> Zod schema -> mapper -> domain view model -> 页面`

页面不直接调用 fetch/axios。真实 API 失败时显示错误；演示数据只有在本地开发环境显式设置 `VITE_ENABLE_DEMO_DATA=true` 且页面展示“演示数据”时启用。

## 发布边界

静态资源输出到 `dist`，Cloudflare Workers 使用旧项目的 SPA fallback 配置。`.env`、密钥和 token 不进入仓库；`.env.example` 只包含变量名和非敏感示例。
