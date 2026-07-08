# AGENTS.md

Surprising-EX Web 是交易所用户端。UI 要统一、产品线隔离要清楚，不能出现错误品牌和错误资金展示。

## 技术栈

- React + TypeScript + Vite。
- 常用命令：
  - `npm run lint`
  - `npm run build`
  - `npm run dev -- --host 0.0.0.0`

## 产品线和实时订阅

- 产品切换优先使用页面级隔离，不用简单 tab 混在同一个交易状态里。
- 切换产品线或 symbol 后，必须重新拉取 instrument、行情 snapshot，并重新订阅对应 WebSocket channel。
- 产品线映射必须和后端一致：spot、linear/inverse perpetual、linear/inverse delivery、option。
- 公共行情关注 candles、depth、trades、index、mark、funding；私有行情关注 orders、matches、executionReports、positions、accountRisk、positionRisk。
- L2 book 不能只靠增量盲目累加，要配合 REST snapshot、sequence 和断线重连。

## UI 和文案

- 不要出现 OKX、欧易、Binance 等硬编码品牌或图标，除非是对标说明文章。
- 保持平台自己的品牌、图标、颜色和交互统一。
- 注册、登录、充值、交易、搜索币对、产品切换、主题切换都要检查真实交互。
- 下拉框默认状态、滚动条样式、移动端适配、按钮文字溢出、暗色/亮色主题都要验证。
- 不要添加无意义通知入口、营销式说明或不相关底部栏目。

## API 和错误处理

- 主题切换或配置读取出现 `Unexpected token '<'` 时，优先检查是否把 SPA HTML 当 JSON 解析。
- API 请求要正确带 productLine、Authorization、X-User-Id 等已有约定 header。
- 页面展示资金、仓位、风险时，不能用 mock 数据覆盖真实接口结果，除非明确是本地 demo。

## 验证

- 提交前至少跑 `npm run lint` 和 `npm run build`。
- 视觉或交互改动要启动 dev server，并检查桌面和移动端关键页面。
- Cloudflare Worker 部署配置变更要确认 `wrangler.json` / 项目名，避免创建重复 Worker。

## 提交

- 通过验证后 commit and push。
- 不提交 `.idea/`、`.wrangler/`、`dist/`、`node_modules/`。

