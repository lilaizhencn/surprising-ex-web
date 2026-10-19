import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const fixturePath = process.env.OPTION_SINGLE_LIVE_FIXTURE
assert(fixturePath?.startsWith("/tmp/surprising-option-fused-"))
const root = path.dirname(fs.realpathSync(fixturePath)), fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
assert.equal(fixture.productLine, "OPTION")
const { chromium } = await import(process.env.OPTION_SINGLE_PLAYWRIGHT_MODULE || "playwright-core")
const browser = await chromium.launch({ headless: true, ...(process.env.OPTION_SINGLE_CHROMIUM ? { executablePath: process.env.OPTION_SINGLE_CHROMIUM } : {}) })
let page
const evidence = { productLine: "OPTION", posts: [], pageErrors: [], widths: [1440, 320] }
const parse = (text) => JSON.parse(text, (_key, value, context) => typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value) ? context.source : value)
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await context.addInitScript((session) => {
    localStorage.setItem("surprising-ex.session", JSON.stringify(session))
    localStorage.setItem("surprising-ex.language", "en")
  }, fixture.session)
  page = await context.newPage()
  page.on("pageerror", (e) => evidence.pageErrors.push(String(e)))
  await page.goto(`http://127.0.0.1:5173/trade/options?instrumentId=${fixture.instrumentId}`)
  await page.locator(`[data-reference-instrument="${fixture.instrumentId}"]`).waitFor({ timeout: 30000 })
  await page.getByRole("button", { name: "TP / SL", exact: true }).click()
  await page.getByLabel("TP/SL trigger price", { exact: true }).fill("800")
  await page.getByLabel("TP/SL close quantity", { exact: true }).fill("1")
  let triggerId
  const saved = () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("surprising-ex.pending-command:")).map(([,v]) => JSON.parse(v)))
  await page.route("**/api/v1/gateway/trading-trigger", async (route) => {
    const body = route.request().postDataJSON()
    assert.equal(route.request().method(), "POST")
    assert.equal(String(body.instrumentId), fixture.instrumentId)
    const rows = await saved()
    assert.equal(rows.length, 1); assert.equal(rows[0].clientTriggerOrderId, body.clientTriggerOrderId)
    assert.equal(rows[0].productLine, "OPTION")
    evidence.posts.push({ operation: "place", clientTriggerOrderId: body.clientTriggerOrderId })
    const response = await route.fetch(); assert.equal(response.status(), 200)
    triggerId = String(parse(await response.text()).triggerOrderId)
    assert(/^[1-9]\d*$/.test(triggerId))
    await route.abort("failed")
  })
  await page.getByRole("button", { name: /^Set stop loss/ }).click()
  await page.getByRole("button", { name: "Check order result", exact: true }).waitFor()
  await page.reload()
  await page.getByRole("button", { name: "Check order result", exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes("Check order result"))
  assert.equal(evidence.posts.length, 1)
  await page.getByRole("tab", { name: "TP & SL", exact: true }).click()
  const row = page.getByRole("row").filter({ has: page.getByText(`#${triggerId}`, { exact: true }) })
  await row.waitFor({ timeout: 20000 })
  await page.locator(".trade-ticket").screenshot({ path: path.join(root, "single-trigger-web-desktop.png") })
  page.on("dialog", (dialog) => dialog.accept())
  await page.route("**/api/v1/gateway/trading-trigger/cancel", async (route) => {
    const body = route.request().postDataJSON()
    assert.equal(String(body.triggerOrderId), triggerId)
    const rows = await saved(); assert.equal(rows[0].cancelTriggerOrderId, triggerId)
    evidence.posts.push({ operation: "cancel", triggerOrderId: triggerId })
    const response = await route.fetch(); assert.equal(response.status(), 200)
    assert.equal(parse(await response.text()).status, "CANCELED")
    await route.abort("failed")
  })
  await row.getByRole("button", { name: "Revoke", exact: true }).click()
  await page.getByRole("button", { name: "Check cancellation result", exact: true }).waitFor()
  await page.reload()
  await page.getByRole("button", { name: "Check cancellation result", exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes("Check cancellation result"))
  await page.setViewportSize({ width: 320, height: 1100 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.locator(".trade-ticket").screenshot({ path: path.join(root, "single-trigger-web-mobile.png") })
  assert.equal((await saved()).length, 0)
  assert.deepEqual(evidence.pageErrors, [])
  assert.equal(evidence.posts.length, 2)
  fs.writeFileSync(path.join(root, "single-trigger-web-evidence.json"), JSON.stringify({ ...evidence, triggerId, placePosts: 1, cancelPosts: 1, placeReloadRecovered: true, cancelReloadRecovered: true, noBodyOverflow: true }, null, 2))
  console.log("OPTION_SINGLE_TRIGGER_WEB_PASS placePosts=1 cancelPosts=1 reloadRecovered=both widths=1440,320")
} catch(error) {
  if (page) {
    await page.screenshot({ path: path.join(root, "single-trigger-web-failure.png"), fullPage: true })
    fs.writeFileSync(path.join(root, "single-trigger-web-failure.txt"), await page.locator("body").innerText())
  }
  throw error
} finally { await browser.close() }
