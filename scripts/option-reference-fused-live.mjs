import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
const fixturePath = process.env.OPTION_REFERENCE_LIVE_FIXTURE
assert(fixturePath?.startsWith("/tmp/surprising-option-fused-"))
const root = path.dirname(fs.realpathSync(fixturePath))
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
assert.equal(fixture.productLine, "OPTION")
assert(Number(fixture.optionCompanionId) > 0)
const pidPath = fs.realpathSync(process.env.OPTION_REFERENCE_PRICE_PID_FILE)
assert(pidPath.startsWith(`${root}/`))
const pid = Number(fs.readFileSync(pidPath, "utf8").trim())
assert(Number.isSafeInteger(pid) && pid > 1)
assert(
  execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).includes(
    `-Dsurprising.launcher.identity=${fixture.runId}/price`,
  ),
)
const { chromium } = await import(
  process.env.OPTION_REFERENCE_PLAYWRIGHT_MODULE || "playwright-core"
)
const browser = await chromium.launch({
  headless: true,
  ...(process.env.OPTION_REFERENCE_CHROMIUM
    ? { executablePath: process.env.OPTION_REFERENCE_CHROMIUM }
    : {}),
})
let paused = false
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
  await context.addInitScript((session) => {
    localStorage.setItem("surprising-ex.session", JSON.stringify(session))
    localStorage.setItem("surprising-ex.language", "en")
  }, fixture.session)
  const page = await context.newPage()
  const errors = [],
    posts = []
  page.on("pageerror", (e) => errors.push(String(e)))
  const ready = async (id) =>
    page
      .locator(`[data-reference-instrument="${id}"]`)
      .waitFor({ state: "visible", timeout: 30000 })
  const apiQuote = async (id) => {
    const response = await page.request.get(
      `http://127.0.0.1:9094/api/v1/gateway/candlestick/options/quote?instrumentId=${id}`,
      { headers: { "X-Product-Line": "OPTION" } },
    )
    assert.equal(response.status(), 200)
    return response.json()
  }
  await page.goto(`http://127.0.0.1:5173/trade/options?instrumentId=${fixture.instrumentId}`)
  await ready(fixture.instrumentId)
  const call = await apiQuote(fixture.instrumentId)
  assert.equal(call.model, "BLACK_76_ZERO_RATE_ACT_365")
  assert(call.greeks.forwardDelta > 0)
  assert.equal(Number(call.underlyingIndexPrice), 50000)
  assert.equal(Number(call.sameExpiryForwardPrice), 50500)
  await page.getByRole("button", { name: /QA-OPTION-PUT-/ }).click()
  await ready(fixture.optionCompanionId)
  assert(new URL(page.url()).searchParams.get("instrumentId") === String(fixture.optionCompanionId))
  const put = await apiQuote(fixture.optionCompanionId)
  assert(put.greeks.forwardDelta < 0)
  assert.equal(Number(put.premiumPrice), 500)
  assert(Math.abs(call.greeks.forwardDelta - put.greeks.forwardDelta - 1) < 1e-7)
  await page
    .locator('.option-chain-contract[aria-pressed="false"]')
    .filter({ hasNotText: "QA-OPTION-PUT-" })
    .first()
    .click()
  await ready(fixture.instrumentId)
  process.kill(pid, "SIGSTOP")
  paused = true
  await page.waitForFunction(
    () => document.body.innerText.includes("Option reference is unavailable or stale."),
    null,
    { timeout: 15000 },
  )
  const stale = await page.request.get(
    `http://127.0.0.1:9094/api/v1/gateway/candlestick/options/quote?instrumentId=${fixture.instrumentId}`,
    { headers: { "X-Product-Line": "OPTION" } },
  )
  assert.equal(stale.status(), 503)
  assert.equal(await page.locator('[data-reference-instrument=""]').count(), 1)
  process.kill(pid, "SIGCONT")
  paused = false
  await ready(fixture.instrumentId)
  for (const [width, theme] of [
    [1440, "dark"],
    [390, "dark"],
    [320, "light"],
  ]) {
    await page.setViewportSize({ width, height: 1100 })
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== theme)
      await page
        .getByRole("button", {
          name: theme === "dark" ? "Use dark theme" : "Use light theme",
          exact: true,
        })
        .click()
    await page
      .locator(".option-market-panel")
      .screenshot({ path: path.join(root, `reference-web-${width}-${theme}.png`) })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  }
  await page.locator(".top-nav .language-picker .dropdown-select").click()
  await page.getByRole("option", { name: /简体中文/ }).click()
  await page.getByRole("heading", { name: "期权行情与参考估值", exact: true }).waitFor()
  await page.locator(".top-nav .language-picker .dropdown-select").click()
  await page.getByRole("option", { name: /English/ }).click()
  await page.getByRole("heading", { name: "Option market reference", exact: true }).waitFor()
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  assert(
    await page.getByRole("navigation", { name: "Primary navigation", exact: true }).isVisible(),
  )
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  await page
    .getByLabel("Limit price", { exact: true })
    .fill(String((Number(fixture.bidPriceTicks) + 40) / 10))
  await page.getByLabel("Order quantity", { exact: true }).fill("1")
  await page.route("**/api/v1/gateway/trading", async (route) => {
    const request = route.request()
    assert.equal(request.method(), "POST")
    assert.equal(request.headers()["x-product-line"], "OPTION")
    const body = request.postDataJSON()
    posts.push(body)
    assert.equal(String(body.instrumentId), fixture.instrumentId)
    assert.equal(Number(body.quantitySteps), 1)
    const saved = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("surprising-ex.pending-command:"))
        .map(([, value]) => JSON.parse(value)),
    )
    assert.equal(saved[0].clientOrderId, body.clientOrderId)
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort("failed")
  })
  await page.getByRole("button", { name: "Buy option", exact: true }).click()
  await page.getByRole("button", { name: "Check order result", exact: true }).waitFor()
  await page.reload()
  await page.getByRole("button", { name: "Check order result", exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes("Check order result"))
  assert.equal(posts.length, 1)
  assert.deepEqual(errors, [])
  fs.writeFileSync(
    path.join(root, "reference-web-evidence.json"),
    JSON.stringify(
      {
        productLine: "OPTION",
        callDelta: call.greeks.forwardDelta,
        putDelta: put.greeks.forwardDelta,
        model: call.model,
        discountFactor: call.discountFactor,
        unit: call.unit,
        underlyingIndexPrice: call.underlyingIndexPrice,
        sameExpiryForwardPrice: call.sameExpiryForwardPrice,
        chainSwitch: true,
        languageMenuAndTheme: true,
        stale503: true,
        expiredValuesHidden: true,
        resumed: true,
        widths: [320, 390, 1440],
        postCount: posts.length,
        lostResponseRecovered: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
  console.log(
    "OPTION_REFERENCE_WEB_PASS callPutSwitch=true stale503=true valuesHidden=true resumed=true posts=1 widths=320,390,1440",
  )
} catch (error) {
  console.error(error)
  throw error
} finally {
  if (paused) process.kill(pid, "SIGCONT")
  await browser.close()
}
