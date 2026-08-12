# 页面迁移与组件重构计划

## 页面映射

| Stitch 页面 | 新路由 | 状态策略 |
|---|---|---|
| home | `/` | 真实 markets；仅 `VITE_ENABLE_DEMO_DATA=true` 时显示演示标记 |
| markets | `/markets` | 真实 instrument list，搜索/分类/排序/收藏本地化 |
| spot | `/trade/spot` | 交易 workspace + REST client；下单默认禁用直到认证和 instrument ready |
| USD-M / Coin-M / delivery | `/trade/*` | 通过 productLine 配置共享 workspace，展示产品线特有字段 |
| options | `/trade/options` | 真实 instrument 能力存在时启用；组合策略标记后端缺口 |
| assets | `/assets` | 账户余额真实加载，错误不静默替换 |
| deposit / withdraw / transfer | `/assets/*` | API adapter 接口先行，未提供 DTO 的步骤明确待补 |
| auth | `/auth/*` | 真实 auth API，refresh 统一处理 |
| KYC / security | `/compliance*`、`/security` | 真实已有接口；人脸认证仅演示占位并明确标识 |
| transactions / notifications | `/orders`、`/notifications` | 已有数据能力不完整，缺口状态优先 |

## 共享组件

`AppShell`、`TopNav`、`AccountSidebar`、`PageHeader`、`Panel`、`Button`、`Field`、`DataTable`、`PriceDisplay`、`StateView`、`Modal`、`Toast`、`ThemeToggle`、`AssetIcon`、`TradeWorkspace`。

## 阶段顺序

1. 工程基础：Vite + React TS、tokens、router、API client、session、theme。
2. primitive showcase：按钮、输入、表格、状态、面板、侧栏状态。
3. 公开页面：home、markets、交易 workspace 公共行情。
4. 账户页面：login/register/reset、assets、transfer、security、KYC。
5. 交易动作：现货/合约订单、撤单、仓位/风险刷新；期权只接真实字段。
6. 资金流：充值/提现严格按后端 DTO；未知结果不可重复提交。
7. 文档、Cloudflare 配置、测试、浏览器 QA。

## 不迁移清单

- 旧前端的页面树和 `App.tsx`。
- 旧前端所有 UI 文案、布局复制和 mock fallback 默认行为。
- 旧 `dist`、`.wrangler`、`node_modules`、本地 secrets。
