// Isolated HTTP/WebSocket UI contracts. No backend writes or actual trading.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const output = process.env.QA_OUTPUT || "/tmp/surprising-market-experience-qa"
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  colorScheme: "light",
})
const lines = [
  "SPOT",
  "LINEAR_PERPETUAL",
  "INVERSE_PERPETUAL",
  "LINEAR_DELIVERY",
  "INVERSE_DELIVERY",
  "OPTION",
]
const labels = [
  "Spot",
  "USD-M Perpetual",
  "Coin-M Perpetual",
  "USD-M Delivery",
  "Coin-M Delivery",
  "Options",
]
let mode = "error",
  many = false,
  heldLine = "",
  release
let longSymbol = false
const requests = [],
  errors = [],
  checks = [],
  subscriptions = new Map()
function rows(line) {
  const prefix = line === "LINEAR_PERPETUAL" ? "" : `${line}_`
  const base = {
    baseAsset: "BTC",
    quoteAsset: "USDT",
    settleAsset: "USDT",
    productLine: line,
    contractType: line === "OPTION" ? "VANILLA_OPTION" : line,
    status: "TRADING",
    priceTickUnits: "1",
    quantityStepUnits: "1",
    pricePrecision: 8,
    quantityPrecision: 8,
  }
  const result = [
    {
      ...base,
      symbol: `${prefix}AAA/USDT`,
      instrumentId: "1",
      lastPrice: "10",
      change24h: "1",
      volume24h: "10000",
      quoteVolume24h: "1",
      high24h: "12",
      low24h: "9",
      trend: [9, 10, 9.5, 10],
    },
    {
      ...base,
      symbol: `${prefix}BBB/USDT`,
      instrumentId: "9007199254740993",
      lastPrice: "0.00000001",
      change24h: "-7",
      volume24h: "2",
      quoteVolume24h: "100",
      high24h: "0.00000002",
      low24h: "0.00000001",
    },
    { ...base, symbol: `${prefix}CCC/USDT`, instrumentId: "3" },
  ]
  if (longSymbol) result[0].symbol = "VERY_LONG_INSTRUMENT_IDENTIFIER_FOR_NARROW_LAYOUT/USDT"
  if (many)
    for (let index = 4; index <= 105; index++)
      result.push({
        ...base,
        symbol: `${prefix}TOKEN${String(index).padStart(3, "0")}/USDT`,
        instrumentId: String(index),
        lastPrice: "1",
        change24h: "0",
      })
  return result
}
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  async (route) => {
    const url = new URL(route.request().url())
    assert.equal(route.request().method(), "GET")
    let data
    if (url.pathname.endsWith("/runtime")) data = { productLines: lines }
    else if (url.pathname.endsWith("/asset-scales")) data = { USDT: "100000000", BTC: "100000000" }
    else if (url.pathname.endsWith("/instrument/list")) {
      const line = url.searchParams.get("productLine") || "LINEAR_PERPETUAL"
      requests.push(line)
      if (line === heldLine)
        await new Promise((resolve) => {
          release = resolve
        })
      if (mode === "error")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporarily unavailable" }),
        })
      data = {
        instruments:
          mode === "malformed" ? [{ instrumentId: "invalid", symbol: "BAD" }] : rows(line),
      }
    } else if (
      url.pathname.endsWith("/instrument/latest") ||
      url.pathname.endsWith("/instrument/default")
    ) {
      const line =
        url.searchParams.get("productLine") ||
        route.request().headers()["x-product-line"] ||
        "LINEAR_PERPETUAL"
      data =
        rows(line).find((row) => row.instrumentId === url.searchParams.get("instrumentId")) ||
        rows(line)[0]
    }
    try {
      await route.fulfill({
        status: data ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify(data || { message: "Unavailable in UI contract test" }),
      })
    } catch {
      /* The rapid-switch test cancels its previous HTTP request. */
    }
  },
)
await context.routeWebSocket(
  (url) => url.pathname === "/ws/v1",
  (socket) => {
    const installed = new Map()
    subscriptions.set(socket, installed)
    socket.onMessage((raw) => {
      const frame = JSON.parse(String(raw))
      const key = `${frame.productLine}:${frame.channel}:${frame.instrumentId}`
      if (frame.op === "subscribe") installed.set(key, frame)
      if (frame.op === "unsubscribe") installed.delete(key)
      if (frame.op === "ping") socket.send(JSON.stringify({ op: "pong" }))
    })
    socket.onClose(() => subscriptions.delete(socket))
  },
)
const page = await context.newPage()
page.on("pageerror", (error) => errors.push(error.message))
const until = async (condition) => {
  const deadline = Date.now() + 7000
  while (!condition()) {
    assert(Date.now() < deadline, "condition timed out")
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
const installed = () => [...subscriptions.values()].flatMap((items) => [...items.values()])
const widthCheck = async () =>
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
const capture = async (name) => {
  await page.waitForTimeout(150)
  await page.screenshot({ path: path.join(output, `${name}.png`) })
}
const select = async (name, label) => {
  await page.getByRole("combobox", { name, exact: true }).click()
  await page.getByRole("option", { name: label, exact: true }).click()
}
const names = () =>
  page.locator(".market-desktop-table tbody .market-list-name strong").allTextContents()
try {
  await page.goto(`${process.env.QA_URL || "http://127.0.0.1:5183"}/markets`)
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor()
  await page.getByRole("textbox", { name: "Search coin...", exact: true }).fill("  bbb  ")
  const origin = await page.evaluate(() => performance.timeOrigin)
  mode = "success"
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByRole("table").waitFor()
  assert.deepEqual(await names(), ["BBB/USDT"])
  assert.equal(await page.evaluate(() => performance.timeOrigin), origin)
  await page.getByRole("button", { name: "Clear search", exact: true }).click()
  assert(
    await page
      .getByRole("textbox", { name: "Search coin...", exact: true })
      .evaluate((element) => document.activeElement === element),
  )
  assert(
    await page
      .locator(".market-desktop-table")
      .innerText()
      .then((text) => text.includes("0.00000001")),
  )
  checks.push(
    "initial failure retries in place, keeps query, preserves tiny price and clear-search focus",
  )
  await page.getByRole("button", { name: "Price", exact: true }).click()
  assert.deepEqual(await names(), ["AAA/USDT", "BBB/USDT", "CCC/USDT"])
  await page.getByRole("button", { name: "Price", exact: true }).click()
  assert.deepEqual(await names(), ["BBB/USDT", "AAA/USDT", "CCC/USDT"])
  await page.getByRole("button", { name: "24h turnover", exact: true }).click()
  assert.equal((await names())[0], "BBB/USDT")
  checks.push(
    "bidirectional price sorting, unavailable values last, quote-turnover sorting and visible quote units",
  )
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  await select("Minimum absolute 24h change", "5%")
  await page.getByRole("textbox", { name: "Search coin...", exact: true }).fill("aaa")
  await page
    .locator(".state-view")
    .getByRole("button", { name: "Reset filters", exact: true })
    .click()
  assert.equal(
    await page.getByRole("textbox", { name: "Search coin...", exact: true }).inputValue(),
    "",
  )
  assert.equal(
    await page
      .getByRole("combobox", { name: "Minimum absolute 24h change", exact: true })
      .innerText(),
    "Any",
  )
  await page.getByRole("button", { name: "Filters", exact: true }).click()
  checks.push("empty filter result resets both search and change threshold")
  await page
    .locator(".market-desktop-table")
    .getByRole("button", { name: "Add to favorites: AAA/USDT", exact: true })
    .click()
  await page.getByRole("button", { name: /^Favorites/ }).click()
  assert.deepEqual(await names(), ["AAA/USDT"])
  await page
    .locator(".market-desktop-table")
    .getByRole("button", { name: "Remove from favorites: AAA/USDT", exact: true })
    .click()
  await page.getByRole("button", { name: "Browse markets", exact: true }).click()
  await page
    .locator(".market-desktop-table")
    .getByRole("button", { name: "Add to favorites: BBB/USDT", exact: true })
    .click()
  await page.reload()
  assert.equal(
    await page
      .locator(".market-desktop-table")
      .getByRole("button", { name: "Remove from favorites: BBB/USDT", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  )
  checks.push("favorite add/remove, meaningful empty state and persistence across reload")
  for (let index = 0; index < lines.length; index++) {
    await select("Product line", labels[index])
    await until(() => requests.includes(lines[index]))
    await page
      .locator(".market-desktop-table tbody")
      .getByText(rows(lines[index])[0].symbol, { exact: true })
      .waitFor()
    await until(
      () =>
        installed().length > 0 && installed().every((item) => item.productLine === lines[index]),
    )
    assert(installed().length <= 100)
    assert(installed().every((item) => lines[index] !== "SPOT" || item.channel === "trades"))
  }
  heldLine = "SPOT"
  await select("Product line", "Spot")
  await until(() => !!release)
  await select("Product line", "Options")
  heldLine = ""
  release()
  await page
    .locator(".market-desktop-table tbody")
    .getByText("OPTION_AAA/USDT", { exact: true })
    .waitFor()
  await page.waitForTimeout(200)
  assert((await names()).every((name) => name.startsWith("OPTION_")))
  checks.push(
    "six products load isolated rows/subscriptions; a delayed old product cannot overwrite the latest selection",
  )
  await select("Product line", "USD-M Perpetual")
  await page.locator(".market-desktop-table tbody").getByText("AAA/USDT", { exact: true }).waitFor()
  mode = "malformed"
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByText("Showing previously loaded markets.", { exact: false }).waitFor()
  assert.equal((await names()).length, 3)
  mode = "success"
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page
    .getByText("Showing previously loaded markets.", { exact: false })
    .waitFor({ state: "detached" })
  checks.push(
    "malformed refresh surfaces an error without replacing last loaded markets with fake zero values",
  )
  await capture("desktop-light")
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click()
  await capture("desktop-dark")
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await widthCheck()
    assert(await page.locator(".market-card-list").isVisible())
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await select("Sort markets", "Price · Ascending")
  await page.locator(".market-card-details summary").first().click()
  assert(
    await page
      .locator(".market-card-details[open]")
      .first()
      .innerText()
      .then((text) => text.includes("0.00000001")),
  )
  await capture("mobile-dark")
  await page.getByRole("button", { name: "Use light theme", exact: true }).click()
  await capture("mobile-light")
  checks.push(
    "320/390/768px cards fit the page; mobile sorting/details and both themes remain usable",
  )
  many = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByRole("navigation", { name: "Market pages", exact: true }).waitFor()
  assert.equal(await page.locator(".market-card-list > li").count(), 50)
  await until(() => installed().length <= 100 && installed().length > 0)
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  assert.equal(await page.locator(".market-card-list > li").count(), 50)
  await page.getByRole("button", { name: "Next page", exact: true }).click()
  assert.equal(await page.locator(".market-card-list > li").count(), 5)
  assert(await page.getByRole("button", { name: "Next page", exact: true }).isDisabled())
  await page.getByRole("textbox", { name: "Search coin...", exact: true }).fill("bbb")
  assert.equal(await page.locator(".market-card-list > li").count(), 1)
  assert.equal(await page.getByRole("navigation", { name: "Market pages", exact: true }).count(), 0)
  await page.getByRole("button", { name: "Clear search", exact: true }).click()
  checks.push(
    "105 markets paginate 50/50/5; filtering resets pagination and visible subscriptions remain bounded",
  )
  many = false
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page
    .getByRole("navigation", { name: "Market pages", exact: true })
    .waitFor({ state: "detached" })
  const other = await context.newPage()
  await other.goto(`${process.env.QA_URL || "http://127.0.0.1:5183"}/markets`)
  await other.getByRole("table").waitFor()
  await other
    .locator(".market-desktop-table")
    .getByRole("button", { name: "Add to favorites: AAA/USDT", exact: true })
    .click()
  await page.bringToFront()
  await page
    .locator(".market-card-list")
    .getByRole("button", { name: "Remove from favorites: AAA/USDT", exact: true })
    .waitFor()
  await other.close()
  checks.push("favorites synchronize from another browser tab without a reload")
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole("link", { name: "Trade BBB/USDT", exact: true }).click()
  await page.waitForURL(
    (url) =>
      url.pathname === "/trade/usd-perpetual" &&
      url.searchParams.get("instrumentId") === "9007199254740993",
  )
  await page.locator(".trade-pair-trigger").click()
  await page.getByRole("button", { name: "Remove BBB/USDT favorite", exact: true }).click()
  await page.goBack()
  await page
    .locator(".market-desktop-table")
    .getByRole("button", { name: "Add to favorites: BBB/USDT", exact: true })
    .waitFor()
  checks.push("trade-page favorite changes are retained when returning to the market page")
  const disconnected = [...subscriptions.keys()][0]
  disconnected.close({ code: 1012, reason: "controlled network interruption" })
  await until(
    () =>
      [...subscriptions.keys()].some((socket) => socket !== disconnected) && installed().length > 0,
  )
  assert.equal((await names()).length, 3)
  const badSocket = [...subscriptions.keys()][0]
  badSocket.send("{bad-json")
  await until(
    () =>
      [...subscriptions.keys()].some((socket) => socket !== badSocket) && installed().length > 0,
  )
  assert.equal((await names()).length, 3)
  checks.push(
    "disconnection and malformed realtime input recover subscriptions without losing loaded rows",
  )
  const denied = await context.newPage()
  await denied.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage disabled", "SecurityError")
      },
    }),
  )
  await denied.goto(`${process.env.QA_URL || "http://127.0.0.1:5183"}/markets`)
  await denied
    .locator(".market-desktop-table")
    .getByRole("button", { name: "Add to favorites: AAA/USDT", exact: true })
    .click()
  assert.equal(
    await denied
      .locator(".market-desktop-table")
      .getByRole("button", { name: "Remove from favorites: AAA/USDT", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  )
  await denied.close()
  await page.bringToFront()
  checks.push("blocked browser storage still allows favorites within the current tab")
  await page.setViewportSize({ width: 390, height: 844 })

  const lifecycle = []
  const soakMs = Math.min(180000, Math.max(0, Number(process.env.QA_SOAK_MS) || 0))
  if (soakMs) {
    const cdp = await context.newCDPSession(page)
    await cdp.send("Performance.enable")
    const start = Date.now()
    const sample = async () => {
      await cdp.send("HeapProfiler.collectGarbage")
      const { metrics } = await cdp.send("Performance.getMetrics")
      lifecycle.push({
        elapsedMs: Date.now() - start,
        subscriptions: installed().length,
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
    while (Date.now() - start < soakMs) {
      await page.getByRole("button", { name: /^Favorites/ }).click()
      await page.getByRole("button", { name: "All Markets", exact: true }).click()
      await page.getByRole("button", { name: "Filters", exact: true }).click()
      await page.getByRole("button", { name: "Filters", exact: true }).click()
      await page.waitForTimeout(2000)
      cycles++
      if (cycles % 10 === 0) await sample()
      assert(installed().length <= 100)
    }
    await sample()
    await cdp.detach()
    checks.push(
      `${cycles} repeated filter/favorite cycles over ${Date.now() - start}ms with bounded subscriptions`,
    )
  }
  longSymbol = true
  await page.setViewportSize({ width: 320, height: 844 })
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page
    .locator(".market-card-list")
    .getByText("VERY_LONG_INSTRUMENT_IDENTIFIER_FOR_NARROW_LAYOUT/USDT", { exact: true })
    .waitFor()
  await widthCheck()
  await page
    .locator(".market-list-card")
    .filter({ hasText: "VERY_LONG_INSTRUMENT_IDENTIFIER_FOR_NARROW_LAYOUT/USDT" })
    .scrollIntoViewIfNeeded()
  await capture("mobile-long-symbol")
  await page.evaluate(() => localStorage.setItem("surprising-ex.language", "zh"))
  await page.reload()
  await page.getByRole("combobox", { name: "产品线", exact: true }).waitFor()
  assert.match(await page.getByRole("heading", { level: 1 }).innerText(), /[\u3400-\u9fff]/)
  await page.getByRole("textbox", { name: "搜索币种…", exact: true }).fill("bbb")
  const clearSearch = page.getByRole("button", { name: "清除搜索", exact: true })
  const clearBounds = await clearSearch.boundingBox()
  assert(clearBounds && clearBounds.width >= 44 && clearBounds.height >= 44)
  await widthCheck()
  await capture("mobile-chinese")
  checks.push(
    "320px long-symbol and Chinese layouts fit the page; clear-search touch target is at least 44px",
  )
  assert.deepEqual(errors, [])
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        browser: await browser.version(),
        checks,
        errors,
        lifecycle,
        limitation: "Controlled HTTP/WebSocket contracts; no live exchange or backend writes.",
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ passed: checks.length, checks, output }, null, 2))
} finally {
  if (release) release()
  await context.close()
  await browser.close()
}
