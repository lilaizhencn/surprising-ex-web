// The reference scenario opens exactly one real OPTION position for the protection scenarios.
if (process.env.OPTION_PROTECTION_SKIP_OPEN !== "true")
  await import("./option-reference-fused-live.mjs")

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const fixturePath = process.env.OPTION_REFERENCE_LIVE_FIXTURE
assert(fixturePath?.startsWith("/tmp/surprising-option-fused-"))
const root = path.dirname(fs.realpathSync(fixturePath))
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
assert.equal(fixture.productLine, "OPTION")
if (process.env.OPTION_PROTECTION_SKIP_OPEN === "true") {
  const prior = JSON.parse(fs.readFileSync(path.join(root, "reference-web-evidence.json"), "utf8"))
  assert.equal(prior.postCount, 1)
  assert.equal(prior.lostResponseRecovered, true)
}
const { chromium } = await import(
  process.env.OPTION_REFERENCE_PLAYWRIGHT_MODULE || "playwright-core"
)
const browser = await chromium.launch({
  headless: true,
  ...(process.env.OPTION_REFERENCE_CHROMIUM
    ? { executablePath: process.env.OPTION_REFERENCE_CHROMIUM }
    : {}),
})
let activePage
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 1200 } })
  await context.addInitScript((session) => {
    localStorage.setItem("surprising-ex.session", JSON.stringify(session))
    localStorage.setItem("surprising-ex.language", "en")
  }, fixture.session)
  const page = await context.newPage(),
    errors = [],
    posts = []
  activePage = page
  page.on("pageerror", (error) => errors.push(String(error)))
  await page.goto(`http://127.0.0.1:5173/trade/options?instrumentId=${fixture.instrumentId}`)
  await page
    .locator(`[data-reference-instrument="${fixture.instrumentId}"]`)
    .waitFor({ state: "visible", timeout: 30000 })
  await page.getByRole("button", { name: "TP / SL", exact: true }).click()
  await page.getByRole("button", { name: "Two-way (OCO)", exact: true }).click()
  await page.getByLabel("TP/SL trigger price", { exact: true }).fill("800")
  await page.getByLabel("Take-profit trigger price", { exact: true }).fill("1200")
  await page.getByLabel("Execution", { exact: true }).click()
  await page.getByRole("option", { name: "Limit", exact: true }).click()
  await page.getByLabel("Limit price", { exact: true }).fill("800")
  await page.getByLabel("Take-profit execution", { exact: true }).click()
  await page.getByRole("option", { name: "Limit", exact: true }).click()
  await page.getByLabel("Take-profit limit price", { exact: true }).fill("1200")
  await page.getByLabel("Trigger source", { exact: true }).click()
  await page.getByRole("option", { name: "Last traded price", exact: true }).click()
  await page.getByLabel("TP/SL close quantity", { exact: true }).fill("1")
  const summary = await page.locator(".ticket-summary").innerText()
  assert(summary.includes("At execution"))
  assert(!summary.includes("Buy premium and fee"))
  await page
    .locator(".trade-ticket")
    .screenshot({ path: path.join(root, "protection-web-320.png") })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  let ids = []
  await page.route("**/api/v1/gateway/trading-trigger/batch", async (route) => {
    assert.equal(route.request().method(), "POST")
    const body = route.request().postDataJSON()
    posts.push(body)
    assert.equal(body.atomic, true)
    assert.equal(body.orders.length, 2)
    assert(
      body.orders.every(
        (leg) =>
          String(leg.instrumentId) === String(fixture.instrumentId) &&
          leg.priceSource === "LAST" &&
          leg.orderType === "LIMIT",
      ),
    )
    const saved = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("surprising-ex.pending-command:"))
        .map(([, value]) => JSON.parse(value)),
    )
    assert.equal(saved[0].ocoTakeProfitClientId, body.orders[0].clientTriggerOrderId)
    assert.equal(saved[0].ocoStopLossClientId, body.orders[1].clientTriggerOrderId)
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const result = JSON.parse(await response.text(), (_key, value, context) =>
      typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)
        ? context.source
        : value,
    )
    assert.equal(result.completed, 2)
    ids = result.results.map((item) => String(item.order.triggerOrderId))
    await route.abort("failed")
  })
  await page.getByRole("button", { name: /^Set TP\/SL pair/ }).click()
  await page.getByRole("button", { name: "Check order result", exact: true }).waitFor()
  await page.reload()
  await page.getByRole("button", { name: "Check order result", exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes("Check order result"))
  assert.equal(posts.length, 1)
  assert.equal(ids.length, 2)
  for (const id of ids) {
    const response = await page.request.post(
      "http://127.0.0.1:9094/api/v1/gateway/trading-trigger/cancel",
      {
        headers: {
          Authorization: `Bearer ${fixture.accessToken}`,
          "X-Product-Line": "OPTION",
          "X-User-Id": String(fixture.userId),
        },
        data: { userId: fixture.userId, triggerOrderId: id },
      },
    )
    assert.equal(response.status(), 200)
  }
  assert.deepEqual(errors, [])
  fs.writeFileSync(
    path.join(root, "protection-web-evidence.json"),
    JSON.stringify(
      {
        productLine: "OPTION",
        triggerIds: ids,
        posts: posts.length,
        atomic: true,
        lostResponseRecovered: true,
        width: 320,
        source: "LAST",
        execution: "LIMIT",
        canceled: 2,
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
  console.log(
    "OPTION_PROTECTION_WEB_PASS atomic=true posts=1 reloadRecovered=true source=LAST execution=LIMIT canceled=2 width320",
  )
} catch (error) {
  if (activePage) {
    await activePage.screenshot({
      path: path.join(root, "protection-web-failure.png"),
      fullPage: true,
    })
    fs.writeFileSync(
      path.join(root, "protection-web-failure.txt"),
      await activePage.locator("body").innerText(),
    )
  }
  throw error
} finally {
  await browser.close()
}
