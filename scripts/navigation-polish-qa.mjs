// Local UI contract test. HTTP failures and the optional session are isolated browser fixtures.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"

const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const output = process.env.QA_OUTPUT || "/tmp/surprising-client-navigation-qa"
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: "light",
})
const errors = []
const checks = []
const page = await context.newPage()
page.on("pageerror", (error) => errors.push(error.message))
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Service temporarily unavailable" }),
    }),
)
const checkWidth = async () =>
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "page must fit viewport",
  )
const screenshot = async (name) => {
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(output, `${name}.png`) })
}

try {
  await page.goto(`${process.env.QA_URL || "http://127.0.0.1:5183"}/markets`)
  await page.getByRole("heading", { name: "Market Center", exact: true }).waitFor()
  const trigger = page.getByRole("button", { name: "Perpetuals: Show options", exact: true })
  await trigger.focus()
  await trigger.press("Enter")
  assert.equal(await trigger.getAttribute("aria-expanded"), "true")
  await page.keyboard.press("Tab")
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("href")),
    "/trade/usd-perpetual",
  )
  await page.keyboard.press("Escape")
  assert(await trigger.evaluate((element) => element === document.activeElement))
  assert.equal(await trigger.getAttribute("aria-expanded"), "false")
  checks.push("desktop submenu keyboard, Escape and focus return")
  await trigger.click()
  await page
    .locator("#navigation-Perpetuals")
    .getByRole("link", { name: "Coin-M", exact: true })
    .click()
  await page.waitForURL("**/trade/coin-perpetual")
  await page.locator('.top-links a.active[href="/trade/usd-perpetual"]').waitFor()
  assert(
    await page
      .locator(".top-links")
      .getByRole("link", { name: "Perpetuals", exact: true })
      .evaluate((element) => element.classList.contains("active")),
  )
  await page.goBack()
  await page.getByRole("heading", { name: "Market Center", exact: true }).waitFor()
  checks.push("Coin-M route keeps product navigation active; browser Back")
  await screenshot("desktop-light")
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click()
  await page.reload()
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark")
  await screenshot("desktop-dark")
  checks.push("theme switching and reload persistence")

  for (const width of [320, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await checkWidth()
    const toggle = page.getByRole("button", { name: "Open navigation", exact: true })
    await toggle.click()
    const dialog = page.getByRole("dialog", { name: "Primary navigation", exact: true })
    await dialog.waitFor()
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden")
    for (let index = 0; index < 24; index++) {
      await page.keyboard.press("Tab")
      assert(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        "focus stays in drawer",
      )
    }
    if (width === 390) await screenshot("mobile-dark-drawer")
    await page.keyboard.press("Escape")
    assert.equal(await dialog.count(), 0)
    assert(await toggle.evaluate((element) => element === document.activeElement))
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden")
  }
  checks.push(
    "320/390/768/1024/1280px: no overflow, focus trap, Escape, focus return and scroll restoration",
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Use light theme", exact: true }).click()
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  await screenshot("mobile-light-drawer")
  await page.mouse.click(5, 200)
  assert.equal(await page.getByRole("dialog").count(), 0)
  checks.push("backdrop closes mobile navigation")
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  await page.getByRole("dialog").locator('a[href="/trade/coin-m-delivery"]').click()
  await page.waitForURL("**/trade/coin-m-delivery")
  assert.equal(await page.getByRole("dialog").count(), 0)
  await page.goBack()
  await screenshot("mobile-light")
  checks.push("mobile Coin-M delivery selection closes navigation and browser Back restores page")

  await page.evaluate(() => {
    localStorage.setItem(
      "surprising-ex.session",
      JSON.stringify({
        accessToken: "local-ui-fixture",
        user: { userId: "1", displayName: "Long display name for narrow navigation" },
      }),
    )
  })
  await page.reload()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await checkWidth()
  }
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Sign out", exact: true }).click()
  await page.waitForURL(`${process.env.QA_URL || "http://127.0.0.1:5183"}/`)
  assert.equal(await page.evaluate(() => localStorage.getItem("surprising-ex.session")), null)
  checks.push("authenticated 320/390px layout and mobile sign-out")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  assert.equal(
    await page.getByRole("dialog").evaluate((element) => getComputedStyle(element).animationName),
    "none",
  )
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole("dialog").waitFor({ state: "detached" })
  checks.push("reduced motion and resize to desktop closes drawer")
  const lifecycle = []
  const soakMs = Math.min(180000, Math.max(0, Number(process.env.QA_SOAK_MS) || 0))
  if (soakMs > 0) {
    await page.setViewportSize({ width: 390, height: 844 })
    const cdp = await context.newCDPSession(page)
    await cdp.send("Performance.enable")
    const started = Date.now()
    const sample = async () => {
      await cdp.send("HeapProfiler.collectGarbage")
      const { metrics } = await cdp.send("Performance.getMetrics")
      lifecycle.push({
        elapsedMs: Date.now() - started,
        ...Object.fromEntries(
          metrics
            .filter((item) =>
              ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration"].includes(item.name),
            )
            .map((item) => [item.name, item.value]),
        ),
      })
    }
    await sample()
    let cycles = 0
    while (Date.now() - started < soakMs) {
      await page.getByRole("button", { name: "Open navigation", exact: true }).click()
      await page.keyboard.press("Escape")
      assert.equal(await page.getByRole("dialog").count(), 0)
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden")
      cycles++
      await page.waitForTimeout(2000)
      if (cycles % 10 === 0) await sample()
    }
    await sample()
    await cdp.detach()
    checks.push(
      `navigation lifecycle: ${cycles} open/close cycles over ${Date.now() - started}ms; scrolling restored each time`,
    )
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        checks,
        errors,
        lifecycle,
        limitation: "Controlled HTTP/session fixtures; no live trading or backend writes.",
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2))
} finally {
  await browser.close()
}
