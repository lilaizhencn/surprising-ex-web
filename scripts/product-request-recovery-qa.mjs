// Controlled transport/browser test of production adapters and durable storage. No real funds or Core.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const root = process.env.PRODUCT_RECOVERY_QA_ROOT
assert(/^\/(private\/)?tmp\/surprising-product-audit-\d{8}_\d{6}$/.test(root || ""))
const owner = JSON.parse(await fs.readFile(path.join(root, "owner.json"), "utf8"))
assert.equal(owner.purpose, "six-product financial recovery and client fault handling audit")
const { chromium } = await import(process.env.PRODUCT_RECOVERY_PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({ headless: true, ...(process.env.PRODUCT_RECOVERY_CHROMIUM ? { executablePath: process.env.PRODUCT_RECOVERY_CHROMIUM } : {}) })
const products = ["SPOT", "LINEAR_PERPETUAL", "INVERSE_PERPETUAL", "LINEAR_DELIVERY", "INVERSE_DELIVERY", "OPTION"]
const evidence = { scope: "Real Chrome, production HTTP adapters/localStorage; controlled transport and synthetic receipts, no Core or financial assertions", cases: [], passed: false }
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    await page.route("**/product-recovery-qa", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Controlled request recovery QA</title>" }))
    let current
    await page.route("**/api/v1/gateway/trading**", async route => {
      const request = route.request(), url = new URL(request.url())
      assert.equal(request.headers()["x-product-line"], current.product)
      assert.equal(request.headers()["x-user-id"], "1")
      if (request.method() === "POST") {
        current.posts++
        const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("surprising-ex.pending-command:")).map(([, value]) => JSON.parse(value)))
        assert.equal(saved.length, 1); assert.equal(saved[0].productLine, current.product)
        current.original = saved[0]
        current.body = request.postDataJSON()
        await route.abort("failed")
      } else {
        assert.equal(request.method(), "GET"); current.gets++
        if (url.pathname.endsWith("/by-client-order-id")) return route.fulfill({ status: 404, json: { message: "Controlled missing order entity" } })
        assert.equal(url.searchParams.get("userId"), "1")
        const original = current.original
        if (original.clientOrderId) assert.equal(url.searchParams.get("clientOrderId"), original.clientOrderId)
        if (original.clientTriggerOrderId) assert.equal(url.searchParams.get("clientTriggerOrderId"), original.clientTriggerOrderId)
        if (original.ocoTakeProfitClientId) {
          assert.equal(url.searchParams.get("takeProfitClientId"), original.ocoTakeProfitClientId)
          assert.equal(url.searchParams.get("stopLossClientId"), original.ocoStopLossClientId)
        }
        if (original.cancelOrderId || original.cancelTriggerOrderId) assert(url.pathname.endsWith(`/${original.cancelOrderId || original.cancelTriggerOrderId}`))
        await route.fulfill({ json: {
          userId: "1", productLine: current.product, clientOrderId: original.clientOrderId,
          instrumentId: original.instrumentId, commandId: "original-receipt", prospectiveOrderIds: [original.cancelOrderId],
          outcome: current.terminal ? "TERMINAL" : "RESULT_UNKNOWN", code: current.terminal ? "NONE" : "RESULT_UNKNOWN",
        } })
      }
    })
    await page.goto("http://127.0.0.1:5173/product-recovery-qa")
    for (const product of products) for (const operation of ["place", "cancel", "trigger", "trigger-cancel", "oco", ...(product === "SPOT" ? [] : ["close"])]) {
      current = { product, operation, posts: 0, gets: 0, terminal: false }
      const sent = await page.evaluate(async ({ product, operation }) => {
        const api = await import("/src/api/endpoints.ts"), session = await import("/src/state/session.ts")
        session.saveSession({ accessToken: "synthetic-owner-1", user: { userId: 1 } })
        const client = `browser-${crypto.randomUUID()}`
        const body = { userId: 1, instrumentId: "604", clientOrderId: client }
        const leg = { userId: 1, instrumentId: "604", clientTriggerOrderId: client, ocoGroupId: client, side: "SELL", triggerType: "TAKE_PROFIT", quantitySteps: "1" }
        try {
          if (operation === "place") await api.placeOrder(body, product)
          if (operation === "close") await api.closePosition({ ...body, marginMode: "CROSS", positionSide: "NET" }, product)
          if (operation === "cancel") await api.cancelOrder("1", "9007199254740993", product)
          if (operation === "trigger") await api.placeTriggerOrder(leg, product)
          if (operation === "trigger-cancel") await api.cancelTriggerOrder("1", "9007199254740993", product, "604")
          if (operation === "oco") await api.placeBatchTriggerOrders({ atomic: true, orders: [leg, { ...leg, clientTriggerOrderId: `${client}-sl`, triggerType: "STOP_LOSS" }] }, product)
          return "unexpected success"
        } catch (error) { return error instanceof api.PendingTradingCommand ? "pending" : String(error) }
      }, { product, operation })
      assert.equal(sent, "pending"); assert.equal(current.posts, 1)
      await page.reload()
      const unknown = await page.evaluate(async () => {
        const api = await import("/src/api/endpoints.ts"), storage = await import("/src/state/pendingOrders.ts")
        return api.checkOrderSubmission(storage.readPendingCommand("1"))
      })
      assert.equal(unknown, "pending")
      const reads = current.gets
      const foreign = await page.evaluate(async () => {
        const api = await import("/src/api/endpoints.ts"), storage = await import("/src/state/pendingOrders.ts"), session = await import("/src/state/session.ts")
        session.saveSession({ accessToken: "synthetic-owner-2", user: { userId: 2 } })
        try { await api.checkOrderSubmission(storage.readPendingCommand("1")); return "wrong owner accepted" } catch { return "blocked" }
      })
      assert.equal(foreign, "blocked"); assert.equal(current.gets, reads)
      current.terminal = true
      const confirmed = await page.evaluate(async () => {
        const api = await import("/src/api/endpoints.ts"), storage = await import("/src/state/pendingOrders.ts"), session = await import("/src/state/session.ts")
        session.saveSession({ accessToken: "synthetic-owner-1", user: { userId: 1 } })
        const original = storage.readPendingCommand("1"), result = await api.checkOrderSubmission(original)
        if (result === "confirmed") storage.clearPendingCommand(original)
        return { result, cleared: storage.readPendingCommand("1") === null }
      })
      assert.equal(confirmed.result, "confirmed"); assert(confirmed.cleared); assert.equal(current.posts, 1)
      evidence.cases.push({ width, product, operation, posts: current.posts, reads: current.gets, reloadRecovered: true, otherOwnerBlockedBeforeNetwork: true })
    }
    await context.close()
  }
  evidence.passed = true
  console.log(`PASS ${evidence.cases.length} controlled browser cases: six products, original request after reload, owner fence, one POST`)
} finally {
  await fs.writeFile(path.join(root, "browser-request-recovery.json"), JSON.stringify(evidence, null, 2))
  await browser.close()
}
