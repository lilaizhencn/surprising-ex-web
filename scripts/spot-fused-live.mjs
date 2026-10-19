// Explicit opt-in local SPOT FUSED acceptance. Backend fixture keeps its real maker active.
import assert from "node:assert/strict"
import fs from "node:fs"
import { execFileSync } from "node:child_process"
const fixturePath = process.env.SPOT_FUSED_LIVE_FIXTURE
assert(fixturePath?.startsWith("/tmp/surprising-spot-fused-"))
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
const pidFile = process.env.SPOT_FUSED_REALTIME_PID_FILE
assert(pidFile?.startsWith("/tmp/surprising-spot-fused-"))
const realtimePid = Number(fs.readFileSync(pidFile, "utf8").trim())
assert(
  execFileSync("ps", ["-p", String(realtimePid), "-o", "command="], { encoding: "utf8" }).includes(
    `-Dsurprising.launcher.identity=${fixture.runId}/realtime`,
  ),
)
const { chromium } = await import(process.env.SPOT_FUSED_PLAYWRIGHT_MODULE ?? "playwright")
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SPOT_FUSED_CHROMIUM ? { executablePath: process.env.SPOT_FUSED_CHROMIUM } : {}),
})
const evidence = []
let paused = false
try {
  for (const [width, theme] of [
    [1440, "dark"],
    [390, "light"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      colorScheme: theme,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    const errors = [],
      posts = [],
      queries = []
    let fixed = [],
      laterOrder
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("dialog", (d) => d.accept())
    await page.addInitScript(
      ({ session, theme }) => {
        localStorage.setItem("surprising-ex.session", JSON.stringify(session))
        localStorage.setItem("surprising-ex.theme", theme)
        localStorage.setItem("surprising-ex.language", "en")
      },
      { session: fixture.session, theme },
    )
    const decode = async (raw) =>
      page.evaluate(
        async (text) =>
          JSON.parse((await import("/src/api/client.ts")).quoteUnsafeJsonIntegers(text)),
        raw,
      )
    async function direct(method, suffix, body) {
      const response = await fetch(`http://127.0.0.1:9094/api/v1/gateway/trading${suffix}`, {
        method,
        headers: {
          Authorization: `Bearer ${fixture.accessToken}`,
          "X-Product-Line": "SPOT",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const text = await response.text()
      assert([200, 202].includes(response.status), `${method} ${suffix} ${text}`)
      return decode(text)
    }
    async function place(label) {
      return page.evaluate(
        async ({ fixture, label }) => {
          const { placeOrder } = await import("/src/api/endpoints.ts")
          return placeOrder(
            {
              userId: fixture.userId,
              instrumentId: fixture.instrumentId,
              clientOrderId: `live-web-${label}-${crypto.randomUUID()}`,
              side: "BUY",
              orderType: "LIMIT",
              timeInForce: "GTC",
              priceTicks: "100000",
              quantitySteps: "1",
              marginMode: "CROSS",
              positionSide: "NET",
              reduceOnly: false,
              postOnly: false,
            },
            "SPOT",
          )
        },
        { fixture, label },
      )
    }
    await page.goto(`http://127.0.0.1:5173/trade/spot?instrumentId=${fixture.instrumentId}`)
    const original = []
    for (let i = 0; i < 51; i++) original.push(String((await place(`${width}-${i}`)).orderId))
    assert(original.every((id) => /^[1-9]\d+$/.test(id)))
    assert.equal(new Set(original).size, 51)
    await page.getByRole("tab", { name: "Open orders (51)", exact: true }).click()
    await page.route("**/api/v1/gateway/trading/cancellation-plan?**", async (route) => {
      const response = await route.fetch()
      const plan = await decode(await response.text())
      assert.equal(plan.instrumentId, fixture.instrumentId)
      assert.equal(plan.productLine, "SPOT")
      assert.deepEqual(new Set(plan.orderIds.map(String)), new Set(original))
      fixed = plan.orderIds.map(String)
      laterOrder = String((await place(`${width}-after-plan`)).orderId)
      await route.fulfill({ response })
    })
    await page.route("**/api/v1/gateway/trading/batch-cancel", async (route) => {
      const body = route.request().postDataJSON()
      posts.push(body)
      assert(
        await page.evaluate(
          (key) =>
            Object.keys(localStorage)
              .filter((k) => k.startsWith("surprising-ex.pending-command:"))
              .map((k) => JSON.parse(localStorage.getItem(k)))
              .some(
                (p) => p.cancelPlan?.issued && p.cancelPlan.batches[p.cancelPlan.index].key === key,
              ),
          body.batchKey,
        ),
      )
      if (posts.length === 1) {
        const ended = await direct("POST", "/cancel", { userId: fixture.userId, orderId: fixed[0] })
        assert.equal(ended.outcome, "TERMINAL")
        assert.equal(ended.code, "NONE")
        process.kill(realtimePid, "SIGSTOP")
        paused = true
        const response = await route.fetch()
        assert([200, 202].includes(response.status()))
        await route.abort("failed")
      } else await route.continue()
    })
    page.on("response", async (response) => {
      if (response.url().includes("/cancellation-batches?"))
        queries.push({
          status: response.status(),
          method: response.request().method(),
          url: new URL(response.url()).pathname,
        })
    })
    await page.getByRole("button", { name: "Cancel all open", exact: true }).click()
    const recover = page.getByRole("button", {
      name: "Check and continue cancellations",
      exact: true,
    })
    await recover.waitFor()
    const unknown = page.waitForResponse((r) => r.url().includes("/cancellation-batches?"))
    await recover.click()
    const pending = await unknown
    assert.equal(pending.status(), 202)
    assert.equal((await pending.json()).outcome, "RESULT_UNKNOWN")
    assert.equal(posts.length, 1)
    process.kill(realtimePid, "SIGCONT")
    paused = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const receipt = await direct(
        "GET",
        `/cancellation-batches?batchKey=${encodeURIComponent(posts[0].batchKey)}`,
      )
      if (receipt.outcome === "TERMINAL") break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await page.reload()
    await recover.waitFor()
    await recover.click()
    await page.waitForFunction(() =>
      document.body.innerText.includes(
        "Cancellation requests processed: 51; Succeeded: 50; Failed: 1.",
      ),
    )
    assert.equal(posts.length, 2)
    assert.equal(new Set(posts.map((b) => b.batchKey)).size, 2)
    assert.deepEqual(
      posts.flatMap((b) => b.orders.map((o) => String(o.orderId))),
      fixed,
    )
    const remaining = await direct("GET", `/${laterOrder}?userId=${fixture.userId}`)
    assert.equal(remaining.status, "ACCEPTED")
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    )
    assert.equal(overflow, false)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `${fixturePath}.web-${width}-${theme}.png`, fullPage: true })
    const canceled = await direct("POST", "/cancel", {
      userId: fixture.userId,
      orderId: laterOrder,
    })
    assert.equal(canceled.outcome, "TERMINAL")
    evidence.push({
      width,
      theme,
      requested: 51,
      completed: 50,
      failed: 1,
      firstBatchSize: posts[0].orders.length,
      secondBatchSize: posts[1].orders.length,
      batchKeys: posts.map((b) => b.batchKey),
      fixedOrderIds: fixed,
      laterOrderSurvived: laterOrder,
      unknownDuringRealProjectionPause: true,
      reloadRestored: true,
      queries,
      overflow,
      errors,
    })
    fs.writeFileSync(`${fixturePath}.web-evidence.json`, JSON.stringify(evidence, null, 2))
    await context.close()
    console.log(
      `SPOT_FUSED_WEB_PASS width=${width} theme=${theme} requested=51 completed=50 failed=1 batches=2 laterOrderSurvived=true`,
    )
  }
} finally {
  if (paused) process.kill(realtimePid, "SIGCONT")
  await browser.close()
}
