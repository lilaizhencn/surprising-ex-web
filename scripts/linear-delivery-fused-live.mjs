import assert from "node:assert/strict"
import fs from "node:fs"
import { execFileSync } from "node:child_process"
const fixturePath = process.env.LINEAR_DELIVERY_LIVE_FIXTURE
assert(fixturePath?.startsWith("/tmp/surprising-linear-delivery-fused-"))
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
assert.equal(fixture.productLine, "LINEAR_DELIVERY")
const pid = Number(fs.readFileSync(process.env.LINEAR_DELIVERY_REALTIME_PID_FILE, "utf8").trim())
assert(
  execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).includes(
    `-Dsurprising.launcher.identity=${fixture.runId}/realtime`,
  ),
)
const { chromium } = await import(process.env.LINEAR_DELIVERY_PLAYWRIGHT_MODULE ?? "playwright")
const browser = await chromium.launch({
  headless: true,
  ...(process.env.LINEAR_DELIVERY_CHROMIUM
    ? { executablePath: process.env.LINEAR_DELIVERY_CHROMIUM }
    : {}),
})
let paused = false
let routeError = null
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "dark",
})
const page = await context.newPage()
page.setDefaultTimeout(15000)
const posts = [],
  queries = [],
  errors = []
page.on("pageerror", (e) => errors.push(e.message))
await page.addInitScript((session) => {
  localStorage.setItem("surprising-ex.session", JSON.stringify(session))
  localStorage.setItem("surprising-ex.language", "en")
  localStorage.setItem("surprising-ex.theme", "dark")
}, fixture.session)
try {
  await page.goto(
    `http://127.0.0.1:5173/trade/delivery-futures?instrumentId=${fixture.instrumentId}`,
  )
  const ticket = page.locator(".trade-ticket")
  await ticket.getByRole("button", { name: "Open long", exact: true }).waitFor()
  assert(await ticket.getByRole("button", { name: "Open long", exact: true }).isDisabled())
  assert(await ticket.getByRole("button", { name: "Open short", exact: true }).isDisabled())
  await ticket.getByRole("button", { name: "Close position", exact: true }).click()
  await ticket.getByRole("button", { name: "MARKET", exact: true }).click()
  const quantity = ticket.locator('input[placeholder="0.00"]')
  await quantity.fill("1")
  assert(await ticket.getByRole("button", { name: "Adjust leverage", exact: true }).isDisabled())
  await ticket.getByText("0.025 USDT", { exact: true }).waitFor()
  await ticket.getByText("Available to close long", { exact: true }).waitFor()
  assert(!(await ticket.getByText("Est. max long", { exact: true }).count()))
  const close = ticket.getByRole("button", { name: "Close long", exact: true })
  await close.waitFor()
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.getByRole("button", { name: "Use light theme", exact: true }).click()
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  )
  await close.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${fixturePath}.web-390.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click()
  await page.route("**/api/v1/gateway/trading", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }
    try {
      const body = route.request().postDataJSON()
      posts.push(body)
      assert.equal(body.reduceOnly, true)
      assert.equal(body.instrumentId, fixture.instrumentId)
      assert.equal(String(body.quantitySteps), "1")
      assert.equal(body.side, "SELL")
      const stored = await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.startsWith("surprising-ex.pending-command:"))
          .map((k) => JSON.parse(localStorage.getItem(k))),
      )
      assert(
        stored.some(
          (p) => p.productLine === "LINEAR_DELIVERY" && p.clientOrderId === body.clientOrderId,
        ),
      )
      process.kill(pid, "SIGSTOP")
      paused = true
      const response = await route.fetch()
      assert.equal(response.status(), 200, await response.text())
      await route.abort("failed")
    } catch (error) {
      routeError = error
      if (paused) process.kill(pid, "SIGCONT")
      paused = false
      await route.abort("failed").catch(() => {})
    }
  })
  page.on("response", (r) => {
    if (r.url().includes("/trading/submission?"))
      queries.push({ status: r.status(), method: r.request().method() })
  })
  await close.click()
  const check = page.getByRole("button", { name: "Check order result", exact: true })
  await check.waitFor()
  const pendingResponse = page.waitForResponse((r) => r.url().includes("/trading/submission?"))
  await check.click()
  const pending = await pendingResponse
  assert.equal(pending.status(), 202)
  await page.waitForTimeout(200)
  assert.equal(posts.length, 1)
  assert(await check.isVisible())
  process.kill(pid, "SIGCONT")
  paused = false
  await page.reload()
  await check.waitFor()
  for (let attempt = 0; attempt < 40 && (await check.isVisible()); attempt++) {
    await check.click()
    await page.waitForTimeout(100)
  }
  assert.equal(await check.count(), 0)
  assert.equal(posts.length, 1)
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  )
  assert.deepEqual(errors, [])
  await page.screenshot({ path: `${fixturePath}.web-1440.png`, fullPage: true })
  fs.writeFileSync(
    `${fixturePath}.web-evidence.json`,
    JSON.stringify(
      {
        productLine: fixture.productLine,
        openBlocked: true,
        reduceOnly: true,
        estimatedFee: "0.025 USDT",
        closeCapacityShown: true,
        leverageAdjustmentDisabled: true,
        quantity: 1,
        posts: posts.length,
        clientOrderId: posts[0].clientOrderId,
        queries,
        pausedUnknown: true,
        reloadRestored: true,
        widths: [390, 1440],
        themes: ["light", "dark"],
        overflow: false,
        errors,
      },
      null,
      2,
    ),
  )
  console.log(
    "LINEAR_DELIVERY_WEB_PASS status=SETTLING openBlocked=true closeQuantity=1 posts=1 pausedUnknown=true reloadRestored=true",
  )
} catch (error) {
  await page.screenshot({ path: `${fixturePath}.web-failure.png`, fullPage: true })
  console.error(await page.locator(".trade-ticket").innerText())
  throw routeError ?? error
} finally {
  if (paused) process.kill(pid, "SIGCONT")
  await browser.close()
}
