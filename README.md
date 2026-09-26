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

### 账户与最新成交价

私有订阅及资产汇总以 `/api/v1/runtime` 的实际产品线为准。资产概览只统计私有账户快照；`/account/balances` 是当前产品账户的另一种查询格式，不能再作为资金账户重复相加。币对列表报价读取真实最近成交，标记价只显示于其专属字段；已收到实时成交后，不用较早历史行情覆盖当前报价。

### 盘口与图表展示

- `TradePage.OrderBook` 每档背景按当前展示的买卖两侧最大单档数量等比缩放，买绿卖红，数量变化采用 160ms 过渡；累计数量只用于合计列。行高固定 26px，系统减少动态效果设置会关闭过渡。
- `PriceChart` 蜡烛与成交量使用同一图表的共享时间轴和同一批周期时间。横轴、十字光标和顶部时间统一采用浏览器本地时区；悬停时 OHLC 与成交量同时显示选中周期，离开恢复最新周期。
