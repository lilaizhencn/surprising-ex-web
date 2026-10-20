// Explicit opt-in: all fills and metadata come from the isolated real SPOT stack.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
const fixturePath = process.env.SPOT_FILLS_LIVE_FIXTURE
assert(fixturePath?.startsWith("/tmp/surprising-spot-fused-fills-"))
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
assert.equal(fixture.productLine, "SPOT")
assert(fixture.userFills.count > 0)
const root = path.dirname(fixturePath)
const { chromium } = await import(process.env.SPOT_FILLS_PLAYWRIGHT_MODULE ?? "playwright")
const browser = await chromium.launch({ headless: true, ...(process.env.SPOT_FILLS_CHROMIUM ? { executablePath: process.env.SPOT_FILLS_CHROMIUM } : {}) })
const evidence = []
try {
  for (const pagePath of ["/orders", "/assets/ledger?category=trade"]) {
    for (const [width, theme] of [[1440, "dark"], [320, "dark"], [320, "light"]]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      const errors = [], writes = [], rawPages = []
      page.on("pageerror", error => errors.push(error.message))
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/api/v1/") && request.method() !== "GET") writes.push(request.method()+" "+new URL(request.url()).pathname)
      })
      await page.addInitScript(({ session, theme }) => {
        localStorage.setItem("surprising-ex.session", JSON.stringify(session))
        localStorage.setItem("surprising-ex.theme", theme)
        localStorage.setItem("surprising-ex.language", "en")
      }, { session: fixture.session, theme })
      await page.route("**/api/v1/gateway/trading/trades?**", async route => {
        assert.equal(route.request().method(), "GET")
        assert.equal(route.request().headers()["x-product-line"], "SPOT")
        const url = new URL(route.request().url())
        url.searchParams.set("limit", "1") // Real one-row pages exercise both UI load-more paths.
        const response = await route.fetch({ url: url.toString() })
        assert.equal(response.status(), 200)
        const raw = await response.text()
        assert(!/"(?:takerUserId|makerUserId|takerOrderId|makerOrderId)"/.test(raw))
        rawPages.push(raw)
        await route.fulfill({ response })
      })
      const open = async () => {
        await page.goto("http://127.0.0.1:5173"+pagePath)
        if (pagePath === "/orders") await page.getByRole("button", { name: "Fills", exact: true }).click()
        try {
          await page.waitForFunction(() => document.querySelectorAll(".data-table tbody tr").length === 1)
        } catch (error) {
          fs.writeFileSync(path.join(root, "fills-browser-failure.txt"), JSON.stringify({ page: pagePath, errors, rawPages, text: await page.locator("body").innerText() }, null, 2))
          throw error
        }
      }
      await open()
      for (let count = 2; count <= fixture.userFills.count; count++) {
        await page.getByRole("button", { name: "Load more", exact: true }).click()
        await page.waitForFunction(count => document.querySelectorAll(".data-table tbody tr").length === count, count)
      }
      const rows = await page.locator(".data-table tbody tr").allTextContents()
      const parsed = await page.evaluate(async raw => {
        const { quoteUnsafeJsonIntegers } = await import("/src/api/client.ts")
        return raw.map(text => JSON.parse(quoteUnsafeJsonIntegers(text)))
      }, rawPages)
      const fills = parsed.flatMap(p => p.trades)
      assert.deepEqual(new Set(fills.map(row => row.tradeId)), new Set(fixture.userFills.tradeIds))
      for (const fill of fills) {
        assert(rows.some(row => row.includes(fill.tradeId) && row.includes(String(fill.orderId))))
        assert.equal(fill.liquidityRole, "TAKER")
      }
      assert.equal(await page.getByRole("button", { name: "Load more", exact: true }).count(), 0)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      if (width === 320) {
        assert.equal(await page.locator(".trade-fill-history > .table-wrap").isVisible(), false)
        assert.equal(await page.locator(".trade-fill-card").count(), fixture.userFills.count)
        const card = await page.locator(".trade-fill-card").first().innerText()
        assert(card.includes("Taker") && card.includes("USDT") && card.includes("BTC"))
        if (pagePath === "/orders") assert.equal(await page.locator(".orders-history-tabs").evaluate(el => getComputedStyle(el).display === "flex" && el.scrollWidth > el.clientWidth), true)
      }
      const screenshot = `fills-${pagePath === "/orders" ? "orders" : "ledger"}-${width}-${theme}.png`
      await page.screenshot({ path: path.join(root, screenshot), fullPage: true })
      await page.reload()
      if (pagePath === "/orders") await page.getByRole("button", { name: "Fills", exact: true }).click()
      await page.waitForFunction(() => document.querySelectorAll(".data-table tbody tr").length === 1)
      assert.deepEqual(writes, [])
      assert.deepEqual(errors, [])
      const corePid = Number(process.env.SPOT_FILLS_CORE_PID)
      assert(Number.isInteger(corePid) && corePid > 0)
      assert(execFileSync("ps", ["-p", String(corePid), "-o", "command="], { encoding: "utf8" }).includes(`-Dsurprising.launcher.identity=${fixture.runId}/core-node0`))
      try {
        execFileSync("kill", ["-STOP", String(corePid)])
        const count = await page.evaluate(async ({ userId, instrumentId }) => {
          const { loadMyTrades } = await import("/src/api/endpoints.ts")
          return (await loadMyTrades(userId, instrumentId, "SPOT")).count
        }, fixture)
        assert.equal(count, 1) // This script forwards real one-row pages.
      } finally { execFileSync("kill", ["-CONT", String(corePid)]) }
      evidence.push({ page: pagePath, width, theme, mobileCards: width === 320, rows: rows.length, realOneRowPages: fills.length, reloadReadsCommittedHistory: true, corePausedRead: true, writes: 0, overflow, errors, screenshot })
      await context.close()
    }
  }
  fs.writeFileSync(path.join(root, "own-fills-web-evidence.json"), JSON.stringify(evidence, null, 2)+"\n")
  console.log(JSON.stringify({ cases: evidence.length, writes: 0, actualFusedFills: fixture.userFills.count }))
} finally { await browser.close() }
