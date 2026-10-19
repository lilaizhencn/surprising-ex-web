// Controlled SPOT UI/storage regression; this is not a real FUSED trading test.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = process.env.SPOT_CONFIRMATION_QA_ROOT
assert(root?.startsWith("/tmp/surprising-spot-confirmation-"))
fs.mkdirSync(root, { recursive: true })
const { chromium } = await import(process.env.SPOT_CONFIRMATION_PLAYWRIGHT_MODULE ?? "playwright")
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SPOT_CONFIRMATION_CHROMIUM ? { executablePath: process.env.SPOT_CONFIRMATION_CHROMIUM } : {}),
})
const market = {
  instrumentId: "1", symbol: "BTC-USDT", productLine: "SPOT", contractType: "SPOT", instrumentType: "SPOT",
  status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT", settleAsset: "USDT", changeId: "1",
  priceTickUnits: "1000000", quantityStepUnits: "10000", notionalMultiplierUnits: "100", minQuantitySteps: "1",
  maxQuantitySteps: "1000000", minNotionalUnits: "1", maxNotionalUnits: "9223372036854775807", pricePrecision: 2, quantityPrecision: 4,
  lastPrice: "100", lastPriceTicks: "10000", makerFeeRatePpm: "1000", takerFeeRatePpm: "1000",
}
const session = { accessToken: "controlled-qa", refreshToken: "controlled-qa", user: { userId: 1, username: "spot-qa", email: "", status: "ACTIVE" } }
const pending = { userId: "1", productLine: "SPOT", cancelOrderId: "91" }
const storageKey = "surprising-ex.pending-command:1:cancel-91"
const evidence = []
try {
  for (const pagePath of ["/trade/spot?instrumentId=1", "/orders"]) {
    for (const [width, theme] of [[1440, "dark"], [1440, "light"], [320, "dark"], [320, "light"]]) {
      for (const language of ["en", "zh"]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
        const page = await context.newPage()
        page.setDefaultTimeout(12000)
        const errors = [], recovery = [], writes = []
        page.on("pageerror", (error) => errors.push(error.message))
        await page.addInitScript(({ session, pending, storageKey, theme, language }) => {
          localStorage.setItem("surprising-ex.session", JSON.stringify(session))
          localStorage.setItem("surprising-ex.theme", theme)
          localStorage.setItem("surprising-ex.language", language)
          localStorage.setItem(storageKey, JSON.stringify(pending))
          window.qaBlockConfirmation = true
          const remove = Storage.prototype.removeItem
          Storage.prototype.removeItem = function (key) {
            if (window.qaBlockConfirmation && key === storageKey) throw new DOMException("QA storage unavailable", "SecurityError")
            return remove.call(this, key)
          }
        }, { session, pending, storageKey, theme, language })
        await page.route("**/api/v1/**", async (route) => {
          const request = route.request(), url = new URL(request.url())
          let body = {}
          if (request.method() !== "GET") writes.push({ method: request.method(), path: url.pathname })
          if (url.pathname.endsWith("/trading/cancellations/91")) {
            assert.equal(request.method(), "GET")
            assert.equal(request.headers()["x-product-line"], "SPOT")
            assert.equal(url.searchParams.get("userId"), "1")
            recovery.push(url.pathname)
            body = { commandId: "original-cancel-91", prospectiveOrderIds: ["91"], outcome: "TERMINAL", code: "NONE" }
          } else if (url.pathname.endsWith("/instrument/list")) body = { instruments: [market] }
          else if (url.pathname.endsWith("/instrument/asset-scales")) body = { BTC: "100000000", USDT: "100000000" }
          else if (url.pathname.endsWith("/instrument/latest")) body = market
          else if (url.pathname === "/api/v1/runtime") body = { productLines: ["SPOT"] }
          else if (url.pathname.includes("/candlestick")) body = { candles: [], trades: [], productLine: "SPOT" }
          else if (url.pathname.endsWith("/price-protection")) body = { productLine: "SPOT", marketMaxSlippagePpm: 10000 }
          else if (url.pathname.includes("/fees")) body = { userId: 1, instrumentId: "1", changeId: "1", makerFeeRatePpm: 1000, takerFeeRatePpm: 1000 }
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
        })
        await page.routeWebSocket("**/ws/v1**", (socket) => socket.onMessage((raw) => {
          const message = JSON.parse(String(raw))
          if (message.op === "authenticate") socket.send(JSON.stringify({ op: "authenticated", userId: "1" }))
          if (message.op === "ping") socket.send(JSON.stringify({ op: "pong" }))
        }))
        await page.goto(`http://127.0.0.1:5173${pagePath}`)
        const label = language === "zh" ? "查询撤单结果" : "Check cancellation result"
        const errorText = language === "zh" ? "无法保存委托确认结果，请再次查询原请求。" : "Cannot save order confirmation. Query the original request again."
        const query = page.getByRole("button", { name: label, exact: true })
        await query.click()
        await page.getByText(errorText, { exact: true }).last().waitFor()
        assert.equal(recovery.length, 1)
        assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey), pending)
        await page.reload()
        await query.click()
        await page.getByText(errorText, { exact: true }).last().waitFor()
        assert.equal(recovery.length, 2)
        let toastBounds = null
        if (pagePath.startsWith("/trade")) {
          await page.waitForFunction(() => {
            const toast = document.querySelector(".trade-toast")
            return toast && Number(getComputedStyle(toast).opacity) >= 0.99
          })
          toastBounds = await page.locator(".trade-toast").boundingBox()
          assert(toastBounds)
          assert(toastBounds.x >= 12 && toastBounds.x + toastBounds.width <= width - 12)
          if (width === 320) assert(toastBounds.width >= width * 0.8, "long storage error must use the available mobile width")
        }
        const screenshot = `${pagePath.startsWith("/trade") ? "trade" : "orders"}-${width}-${theme}-${language}.png`
        await page.screenshot({ path: path.join(root, screenshot), fullPage: true })
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
        assert.equal(overflow, false)
        await page.evaluate(() => { window.qaBlockConfirmation = false })
        await query.click()
        await query.waitFor({ state: "hidden" })
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), null)
        assert.equal(recovery.length, 3)
        assert.deepEqual(writes, [])
        assert.deepEqual(errors, [])
        evidence.push({ page: pagePath, width, theme, language, restoredAfterReload: true, pendingDuringFailure: true, recoveryGets: recovery.length, writes: writes.length, overflow, errors, toastBounds, screenshot })
        await context.close()
      }
    }
  }
  fs.writeFileSync(path.join(root, "browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify({ cases: evidence.length, recoveryGets: evidence.reduce((n, row) => n + row.recoveryGets, 0), writes: 0, scope: "controlled SPOT fixtures" }))
} finally {
  await browser.close()
}
