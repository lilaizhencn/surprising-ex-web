// Controlled presentation QA: production component, explicit integer fixtures, no API responses.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
const root = process.env.SPOT_DETAILS_QA_ROOT
assert(root?.startsWith("/tmp/surprising-spot-details-"))
assert.equal(
  JSON.parse(fs.readFileSync(path.join(root, "owner.json"), "utf8")).purpose,
  "spot order detail presentation QA",
)
const base = process.env.SPOT_DETAILS_QA_BASE ?? "http://127.0.0.1:5178"
const url = new URL(base)
assert.equal(url.hostname, "127.0.0.1")
const harness = path.resolve("scripts", `.spot-details-harness-${process.pid}.tsx`)
fs.writeFileSync(
  harness,
  `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TradingAccountTables} from '../src/features/trading/TradingAccountTables';
import '../src/styles/global.css';
function Harness(){
 const [f,setF]=useState(window.__SPOT_DETAILS_QA__);
 window.__SPOT_PANEL_UPDATE__=next=>setF(previous=>({...previous,...next}));
 document.documentElement.dataset.theme=f.theme;
 return <main data-user={f.userId??'1'} data-product={f.productLine??'SPOT'} style={{padding:12,width:'100%',minWidth:0}}><TradingAccountTables market={f.market} markets={[f.market]} productLine={f.productLine??'SPOT'} assetScales={f.scales} orders={f.orders??[f.order]} positions={[]} triggers={[]} account={undefined} events={f.events??[]} loggedIn={f.loggedIn??true} userId={f.userId??'1'} commandPending onNotice={()=>{throw new Error('readonly QA invoked a command')}} /></main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`,
  { flag: "wx" },
)
fs.writeFileSync(
  path.join(root, "harness-owner.json"),
  JSON.stringify({ path: harness, pid: process.pid }) + "\n",
)
let browser
try {
  const { chromium } = await import(process.env.SPOT_DETAILS_PLAYWRIGHT_MODULE ?? "playwright")
  browser = await chromium.launch({
    headless: true,
    ...(process.env.SPOT_DETAILS_CHROMIUM
      ? { executablePath: process.env.SPOT_DETAILS_CHROMIUM }
      : {}),
  })
  const market = {
    instrumentId: "42",
    symbol: "BTC-USDT",
    productLine: "SPOT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    priceTickUnits: "5",
    quantityStepUnits: "200000",
    notionalMultiplierUnits: "1",
    pricePrecision: 3,
  }
  const normal = {
    orderId: "9007199254740993",
    instrumentId: "42",
    status: "OPEN",
    side: "BUY",
    orderType: "LIMIT",
    timeInForce: "GTC",
    priceTicks: "12345",
    averagePriceTicks: "12344.5",
    executedValueTicks: "123445",
    quantitySteps: "25",
    executedQuantitySteps: "10",
    remainingQuantitySteps: "15",
    cumulativeFeeUnits: "-1",
  }
  const high = {
    ...normal,
    side: "SELL",
    priceTicks: "9007199254740993",
    averagePriceTicks: "9007199254740993.5",
    executedValueTicks: "90071992547409935",
  }
  const evidence = []
  for (const [width, theme] of [
    [1440, "dark"],
    [1440, "light"],
    [320, "dark"],
    [320, "light"],
  ]) {
    for (const [scenario, order, values] of [
      ["normal", normal, ["61.7225", "123.445 USDT", "308.625 USDT"]],
      [
        "large",
        high,
        [
          "45035996273704.965",
          "45035996273704.9675",
          "90071992547409.935 USDT",
          "225179981368524.825 USDT",
        ],
      ],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: theme,
      })
      const page = await context.newPage()
      const errors = [],
        apiRequests = []
      page.on("pageerror", (error) => errors.push(error.message))
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/v1/"))
          apiRequests.push(request.method() + " " + new URL(request.url()).pathname)
      })
      await page.addInitScript(
        (f) => {
          window.__SPOT_DETAILS_QA__ = f
          localStorage.setItem("surprising-ex.language", "en")
        },
        { market, order, scales: { BTC: "1000000", USDT: "1000" }, theme },
      )
      await page.route("**/__spot-order-details-qa", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true; await import('/scripts/${path.basename(harness)}');</script></body></html>`,
        }),
      )
      await page.goto(base + "/__spot-order-details-qa")
      await page.waitForSelector(".compact-trading-table tbody tr")
      const text = await page.locator(".compact-trading-table tbody").innerText()
      for (const value of values) assert(text.includes(value), value)
      assert(
        (await page.locator(".compact-trading-table thead").textContent()).includes("Quote asset"),
      )
      assert(!(await page.locator(".compact-trading-table thead").textContent()).includes("Margin"))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      const screenshot = `details-${scenario}-${width}-${theme}.png`
      await page.screenshot({ path: path.join(root, screenshot), fullPage: true })
      const visibleCells = []
      for (const [index, label] of [
        [3, "price"],
        [6, "value"],
      ]) {
        const cell = page.locator(".compact-trading-table tbody tr td").nth(index)
        await cell.scrollIntoViewIfNeeded()
        const box = await cell.boundingBox()
        assert(box && box.x >= -1 && box.x + box.width <= width + 1)
        const unobscured = await cell.evaluate((el) => {
          const r = el.getBoundingClientRect()
          return [r.left + 6, (r.left + r.right) / 2, r.right - 6].every((x) =>
            el.contains(document.elementFromPoint(x, (r.top + r.bottom) / 2)),
          )
        })
        assert(unobscured, "order value/price cell must not be covered by sticky actions")

        visibleCells.push({
          label,
          visible: true,
          scrollLeft: await page.locator(".table-wrap").evaluate((el) => el.scrollLeft),
        })
        if (width === 320)
          await page.screenshot({
            path: path.join(root, `details-${scenario}-${width}-${theme}-${label}.png`),
            fullPage: true,
          })
      }

      const more = page.getByRole("tab", { name: "Recent order updates", exact: true })
      await more.click()
      await page.getByRole("tab", { name: /^Open orders/ }).click()
      await page.waitForSelector(".compact-trading-table tbody tr")
      const update = async (next) => {
        await page.evaluate((next) => window.__SPOT_PANEL_UPDATE__(next), next)
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
      }
      const event = async (userId, orderId) =>
        page.evaluate(
          async ({ userId, orderId, order }) => {
            const { unwrapEvent } = await import("/src/realtime.ts")
            return unwrapEvent({
              op: "event",
              channel: "orders",
              productLine: "SPOT",
              userId,
              instrumentId: "42",
              data: {
                version: "0000000000000000001:0000000000",
                entityId: orderId,
                value: { ...order, userId, orderId, status: "CANCELED" },
              },
            })
          },
          { userId, orderId, order },
        )
      const own1 = await event("1", "10001"),
        own2 = await event("2", "20002")
      const recent = () =>
        page.getByRole("tab", { name: "Recent order updates", exact: true }).click()
      const historyIds = () => page.locator(".trade-account-tables").innerText()
      await update({ orders: [], events: [own1], userId: "1" })
      await recent()
      await page.waitForFunction(() =>
        document.querySelector(".compact-trading-table tbody")?.textContent.includes("10001"),
      )
      await page.getByRole("checkbox", { name: "Current pair only" }).uncheck()
      await update({ orders: [], events: [], userId: "2" })
      assert.equal(
        await page.getByRole("checkbox", { name: "Current pair only" }).isChecked(),
        true,
      )
      assert.equal(
        await page.getByRole("tab", { name: /^Open orders/ }).getAttribute("aria-selected"),
        "true",
      )
      await recent()
      assert(!(await historyIds()).includes("10001"), "previous account history must be discarded")
      await update({ events: [own1] })
      assert(!(await historyIds()).includes("10001"), "a foreign-only buffer must remain empty")
      await update({ events: [own2, own1] })
      await page.waitForFunction(() =>
        document.querySelector(".compact-trading-table tbody")?.textContent.includes("20002"),
      )
      assert(
        !(await historyIds()).includes("10001"),
        "foreign buffered events must not enter current history",
      )
      await update({ userId: "1", events: [] })
      await recent()
      assert(
        !(await historyIds()).includes("10001"),
        "old history must not return after switching back",
      )
      await update({ userId: "2", events: [own2] })
      await recent()
      assert(
        (await historyIds()).includes("20002"),
        "retained event must seed the remounted account",
      )
      await update({ loggedIn: false, events: [own2] })
      await recent()
      assert((await historyIds()).includes("Log in to view account and orders."))
      assert(
        !(await historyIds()).includes("20002"),
        "logged-out history must ignore private events",
      )
      await update({ loggedIn: true, events: [] })
      await recent()
      assert(
        !(await historyIds()).includes("20002"),
        "history must remain empty after login until a current update",
      )
      await update({ events: [{ ...own2, productLine: "LINEAR_DELIVERY" }] })
      assert(
        !(await historyIds()).includes("20002"),
        "a different product event must remain excluded",
      )
      await update({ events: [own2] })
      assert((await historyIds()).includes("20002"))
      await update({ market: { ...market, instrumentId: "43" }, events: [] })
      await recent()
      assert(
        !(await historyIds()).includes("20002"),
        "history must be scoped to the selected instrument",
      )
      await update({ market, events: [] })
      await recent()
      assert(!(await historyIds()).includes("20002"), "old instrument history must not return")
      await update({
        productLine: "LINEAR_DELIVERY",
        market: { ...market, productLine: "LINEAR_DELIVERY" },
        events: [],
      })
      await page.getByRole("tab", { name: /^Positions/ }).click()
      await update({ productLine: "SPOT", market, events: [] })
      assert.equal(await page.getByRole("tab", { name: /^Positions/ }).count(), 0)
      assert.equal(
        await page.getByRole("tab", { name: /^Open orders/ }).getAttribute("aria-selected"),
        "true",
      )
      assert.deepEqual(errors, [])
      assert.deepEqual(apiRequests, [])
      evidence.push({
        width,
        theme,
        scenario,
        exactValues: values,
        visibleCells,
        overflow,
        errors,
        apiRequests,
        screenshot,
        productionComponent: true,
        controlledFixture: true,
        accountAndProductScope: true,
        scopeChecks: [
          "account switch clears old history and resets filter/tab",
          "foreign events ignored",
          "returning account reseeds retained owned event",
          "logout clears cache and rejects private buffer",
          "login without new events stays empty",
          "foreign product ignored",
          "instrument switch and return discard cache",
          "spot hides positions and defaults to orders",
        ],
      })
      await context.close()
    }
  }
  fs.writeFileSync(
    path.join(root, "web-details-evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  )
  console.log(
    JSON.stringify({
      cases: evidence.length,
      apiRequests: 0,
      mode: "controlled production-component presentation QA",
    }),
  )
} finally {
  if (browser) await browser.close()
  fs.unlinkSync(harness)
}
