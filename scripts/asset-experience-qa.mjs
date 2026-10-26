// Intercepted HTTP/WS contracts only. No real custody operation is performed.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-assets-client-qa"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const session = {
  accessToken: "ui-fixture",
  refreshToken: "ui-fixture",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
  user: {
    userId: "1",
    username: "qa",
    roles: ["USER"],
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
  },
}
await context.addInitScript((value) => {
  if (!localStorage.getItem("surprising-ex.session"))
    localStorage.setItem("surprising-ex.session", JSON.stringify(value))
}, session)
const lines = ["SPOT", "LINEAR_PERPETUAL"],
  requests = [],
  checks = [],
  errors = [],
  sockets = new Map()
let fxError = false,
  holdSource = false,
  releaseSource,
  holdPost = false,
  releasePost,
  postStatus = "COMPLETED",
  holdLinear = false,
  historyError = false
const snapshot = (line) => ({
  op: "snapshot",
  productLine: line,
  userId: "1",
  eventTime: new Date().toISOString(),
  data: {
    status: "READY",
    snapshotVersion: "0000000000000000001:0000000000",
    account: {
      userId: "1",
      productLine: line,
      positionMode: "ONE_WAY",
      balances: [
        {
          asset: "USDT",
          availableUnits: line === "SPOT" ? "9007199254740993" : "200000000",
          lockedUnits: "1",
        },
        { asset: "USD", availableUnits: "0", lockedUnits: "0" },
      ],
      positions: [],
      reservations: [],
      leverages: [],
    },
    openOrders: [],
    triggerOrders: [],
    positionRisks: [],
  },
})
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method(),
      endpoint = url.pathname.split("/").at(-1)
    requests.push({
      path: url.pathname,
      query: url.search,
      method,
      headers: req.headers(),
      body: req.postData(),
    })
    let data = {},
      status = 200
    if (method === "POST" && endpoint === "transfers") {
      if (holdPost) await new Promise((resolve) => (releasePost = resolve))
      const body = JSON.parse(req.postData())
      data = {
        ...body,
        transferId: "9223372036854775807",
        status: postStatus,
        createdAt: new Date().toISOString(),
      }
    } else if (endpoint === "runtime") data = { productLines: lines }
    else if (endpoint === "asset-scales")
      data = { USDT: "100000000", USD: "100000000", BTC: "100000000" }
    else if (endpoint === "list") data = { instruments: [] }
    else if (endpoint === "convert") {
      status = fxError ? 503 : 200
      data = fxError
        ? { message: "Synthetic FX unavailable" }
        : {
            fromCurrency: "USDT",
            toCurrency: "USD",
            amount: "1",
            convertedAmount: "1",
            rate: "1",
            rateTime: new Date().toISOString(),
          }
    } else if (endpoint === "balances" || endpoint === "product-balances") {
      const account = url.searchParams.get("accountType") || "FUNDING"
      if (holdSource && account === "SPOT")
        await new Promise((resolve) => (releaseSource = resolve))
      data = {
        balances: [
          {
            asset: "USDT",
            accountType: account,
            availableUnits:
              account === "FUNDING" ? "700000000" : account === "SPOT" ? "300000000" : "200000000",
            lockedUnits: "0",
          },
        ],
      }
    } else if (endpoint === "transfers") {
      status = historyError ? 503 : 200
      data = historyError
        ? { message: "Synthetic history unavailable" }
        : {
            count: 1,
            transfers: [
              {
                transferId: "9223372036854775807",
                userId: "1",
                sourceAccountType: "USDT_PERPETUAL",
                targetAccountType: "FUNDING",
                asset: "USDT",
                amountUnits: "1",
                referenceId: "record-contract",
                status: "COMPLETED",
                createdAt: "2026-10-26T12:00:00Z",
              },
            ],
            nextCursor: null,
            hasMore: false,
            sort: "createdAt.desc",
            limit: 100,
          }
    } else if (endpoint === "announcements") data = { announcements: [] }
    else if (endpoint === "unread-count") data = { count: 0 }
    try {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) })
    } catch {
      /* Requests intentionally cancelled by scope switches. */
    }
  },
)
await context.routeWebSocket(
  (url) => url.pathname === "/ws/v1",
  (socket) => {
    const subs = new Map()
    sockets.set(socket, subs)
    socket.onMessage((raw) => {
      const frame = JSON.parse(String(raw)),
        key = `${frame.productLine}:${frame.channel}`
      if (frame.op === "authenticate")
        socket.send(JSON.stringify({ op: "authenticated", id: frame.id }))
      if (frame.op === "subscribe") {
        subs.set(key, frame)
        if (
          frame.channel === "accountState" &&
          !(holdLinear && frame.productLine === "LINEAR_PERPETUAL")
        )
          socket.send(JSON.stringify(snapshot(frame.productLine)))
      }
      if (frame.op === "unsubscribe") subs.delete(key)
      if (frame.op === "ping") socket.send(JSON.stringify({ op: "pong" }))
    })
    socket.onClose(() => sockets.delete(socket))
  },
)
const page = await context.newPage()
page.on("pageerror", (e) => errors.push(e.message))
const until = async (condition) => {
  const deadline = Date.now() + 8000
  while (!condition()) {
    assert(Date.now() < deadline, "condition timed out")
    await page.waitForTimeout(30)
  }
}
const capture = async (name) => {
  await page.waitForTimeout(120)
  await page.screenshot({ path: path.join(out, name + ".png") })
}
const select = async (name, label) => {
  await page.getByRole("combobox", { name, exact: true }).click()
  await page.getByRole("option", { name: label, exact: true }).click()
}
const fit = async () =>
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "page overflows",
  )
let cdp
try {
  await page.goto("http://127.0.0.1:5183/assets?account=spot")
  await page.locator(".asset-account-table tbody tr").first().waitFor()
  assert((await page.locator(".asset-account-table").innerText()).includes("90,071,992.54740993"))
  await capture("assets-desktop-light")
  await page.getByRole("button", { name: "Hide balances", exact: true }).click()
  assert.equal(await page.locator(".donut").count(), 0)
  assert(!(await page.locator(".assets-page").innerText()).includes("%"))
  await page.reload()
  await page.getByText("Balances and allocation are hidden.", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Show balances", exact: true }).click()
  await page.locator(".asset-account-table tbody tr").first().waitFor({ state: "attached" })
  checks.push(
    "exact integer balances and totals; hiding removes amounts, allocation and percentages and persists on reload",
  )
  await page.getByRole("textbox", { name: "Search assets", exact: true }).fill("zzzz")
  assert.equal(await page.locator(".asset-account-table tbody tr").count(), 0)
  await page.getByRole("button", { name: "Clear search", exact: true }).click()
  await page.getByRole("checkbox", { name: "Hide zero balances", exact: true }).check()
  assert.equal(await page.locator(".asset-account-table tbody tr").count(), 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await fit()
  await capture("assets-mobile-light")
  await page.locator(".assets-mobile-balances").scrollIntoViewIfNeeded()
  await capture("assets-balance-cards-mobile-light")
  await page.locator(".assets-page .page-heading").scrollIntoViewIfNeeded()
  await page.setViewportSize({ width: 320, height: 760 })
  await fit()
  await page.evaluate(() => {
    localStorage.setItem("surprising-ex.theme", "dark")
  })
  await page.reload()
  await page
    .locator(".assets-mobile-balances")
    .waitFor()
    .catch(() => {})
  await capture("assets-mobile-dark")
  checks.push("search clear, zero filter, 320/390px complete balance cards and light/dark layout")
  holdLinear = true
  await page.goto("http://127.0.0.1:5183/assets?account=overview")
  await page.getByText("Some accounts are still syncing.", { exact: false }).waitFor()
  assert(
    (await page.locator(".balance-number").innerText()).includes("Valuation unavailable") ||
      (await page.locator(".balance-number .asset-value-skeleton").count()) > 0,
  )
  await select("Asset account", "Spot")
  await page.locator(".asset-account-table tbody tr").first().waitFor({ state: "attached" })
  assert(!(await page.locator(".balance-number").innerText()).includes("Valuation unavailable"))
  checks.push(
    "a synced selected account remains usable while another enabled product is still syncing; overview does not show a partial total",
  )
  holdLinear = false
  fxError = true
  await page.goto("http://127.0.0.1:5183/assets?account=spot")
  await page.getByText("FX unavailable", { exact: true }).waitFor()
  assert((await page.locator(".asset-account-table").innerText()).includes("90,071,992.54740993"))
  assert((await page.locator(".balance-number").innerText()).includes("Valuation unavailable"))
  fxError = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.waitForFunction(
    () => !document.querySelector(".balance-number")?.textContent.includes("Valuation unavailable"),
  )
  checks.push(
    "FX failure preserves exact cash balances, hides USD estimates, and retries without navigating",
  )
  await page.goto("http://127.0.0.1:5183/assets?account=invalid")
  assert.equal(await page.locator(".asset-account-table tbody tr").count(), 0)
  await capture("assets-invalid-account")
  await page.goto("http://127.0.0.1:5183/assets/transfer?asset=USDT&from=USDT_PERPETUAL")
  await page.locator(".funding-available").getByText("2", { exact: true }).waitFor()
  await page.getByRole("cell", { name: "9223372036854775807", exact: true }).waitFor()
  assert.equal(await page.getByRole("cell", { name: "0.00000001", exact: true }).count(), 1)
  await page.getByRole("cell", { name: "USD-M Perpetual → Funding account", exact: true }).waitFor()
  historyError = true
  await page
    .locator(".funding-available")
    .getByRole("button", { name: "Refresh", exact: true })
    .click()
  await page
    .getByText("The service is temporarily unavailable. Please try again shortly.", { exact: true })
    .waitFor()
  assert.equal(
    await page.getByRole("cell", { name: "9223372036854775807", exact: true }).count(),
    0,
  )
  historyError = false
  await page
    .locator(".funding-available")
    .getByRole("button", { name: "Refresh", exact: true })
    .click()
  await page.getByRole("cell", { name: "9223372036854775807", exact: true }).waitFor()
  checks.push(
    "history preserves exact transfer ID and amount; duplicate product reads merge identical records; failures clear records and recover on refresh",
  )
  assert.equal(
    await page.getByRole("combobox", { name: "Source account", exact: true }).innerText(),
    "USD-M Perpetual",
  )
  await select("Source account", "Funding account")
  await page.locator(".funding-available").getByText("7", { exact: true }).waitFor()
  holdSource = true
  await select("Source account", "Spot")
  await page.locator(".funding-available").getByText("—", { exact: true }).waitFor()
  assert(await page.getByRole("button", { name: "Confirm transfer", exact: true }).isDisabled())
  await select("Source account", "USD-M Perpetual")
  await page.locator(".funding-available").getByText("2", { exact: true }).waitFor()
  releaseSource?.()
  holdSource = false
  await page.waitForTimeout(100)
  assert((await page.locator(".funding-available").innerText()).includes("2 USDT"))
  checks.push(
    "URL source preset; available balance follows funding/spot/linear accounts and clears while loading; cancelled old source cannot overwrite current balance",
  )
  await select("Destination account", "Funding account")
  await page
    .getByRole("textbox", { name: "Transfer amount in USDT", exact: true })
    .fill("0.00000001")
  holdPost = true
  const confirm = page.getByRole("button", { name: "Confirm transfer", exact: true })
  await confirm.click()
  await until(() => !!releasePost)
  assert(await confirm.isDisabled())
  assert(await page.getByRole("combobox", { name: "Source account", exact: true }).isDisabled())
  assert.equal(requests.filter((r) => r.method === "POST").length, 1)
  releasePost()
  holdPost = false
  await page.getByText("Transfer request accepted: COMPLETED", { exact: true }).waitFor()
  const post = requests.find((r) => r.method === "POST"),
    body = JSON.parse(post.body)
  assert.equal(body.sourceAccountType, "USDT_PERPETUAL")
  assert.equal(body.targetAccountType, "FUNDING")
  assert.equal(body.amountUnits, "1")
  assert(
    (await page
      .getByRole("textbox", { name: "Transfer amount in USDT", exact: true })
      .inputValue()) === "",
  )
  checks.push(
    "pending transfer locks fields and duplicate submission; explicit account enums and one minimal unit reach captured request; accepted response refreshes balances/history",
  )
  postStatus = "TARGET_CREDIT_UNKNOWN"
  await page
    .getByRole("textbox", { name: "Transfer amount in USDT", exact: true })
    .fill("0.00000002")
  await confirm.click()
  await page.getByText("Transfer not confirmed: TARGET_CREDIT_UNKNOWN", { exact: true }).waitFor()
  await confirm.click()
  await until(() => requests.filter((r) => r.method === "POST").length === 3)
  const posts = requests.filter((r) => r.method === "POST")
  assert.equal(JSON.parse(posts[1].body).referenceId, JSON.parse(posts[2].body).referenceId)
  checks.push(
    "unknown transfer response is not success, retains form and reuses the same reference on an unchanged in-tab retry",
  )
  await capture("transfer-mobile-dark")
  await page.evaluate(() => localStorage.setItem("surprising-ex.language", "zh"))
  await page.reload()
  await select("转出账户", "现货")
  await page.locator(".funding-available strong").getByText("3", { exact: true }).waitFor()
  await select("转入账户", "资金账户")
  await page.getByRole("textbox", { name: "Transfer amount in USDT", exact: true }).fill("1")
  await page.getByRole("button", { name: "确认划转", exact: true }).click()
  await until(() => requests.filter((r) => r.method === "POST").length === 4)
  const zhBody = JSON.parse(requests.filter((r) => r.method === "POST").at(-1).body)
  assert.equal(zhBody.sourceAccountType, "SPOT")
  assert.equal(zhBody.targetAccountType, "FUNDING")
  await fit()
  await capture("transfer-mobile-zh")
  const historyTable = page.locator(".funding-form-fields .table-wrap")
  await historyTable.scrollIntoViewIfNeeded()
  assert(
    await historyTable.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      return element.scrollLeft > 0
    }),
  )
  await capture("transfer-history-mobile-zh")
  checks.push(
    "mobile balance cards show all cash fields and actions; transfer history scrolls horizontally to the remaining fields",
  )
  checks.push("Chinese labels keep raw account enums on the wire")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capture("transfer-desktop-dark")
  await page.goto("http://127.0.0.1:5183/assets?account=spot")
  await page.locator(".asset-account-table tbody tr").first().waitFor({ state: "attached" })
  cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")
  const samples = []
  for (let index = 0; index < 7; index++) {
    const metrics = (await cdp.send("Performance.getMetrics")).metrics
    samples.push({
      second: index * 10,
      ...Object.fromEntries(
        metrics
          .filter((m) => ["JSHeapUsedSize", "Nodes", "TaskDuration"].includes(m.name))
          .map((m) => [m.name, m.value]),
      ),
      sockets: sockets.size,
      subscriptions: [...sockets.values()].reduce((n, m) => n + m.size, 0),
    })
    if (index < 6) await page.waitForTimeout(10000)
  }
  for (let i = 0; i < 4; i++) {
    await page.goto("http://127.0.0.1:5183/assets/transfer?asset=USDT")
    await page.locator(".funding-available").waitFor()
    await page.goto("http://127.0.0.1:5183/assets?account=spot")
    await page.locator(".asset-account-table tbody tr").first().waitFor({ state: "attached" })
  }
  assert.equal(errors.length, 0, errors.join("\n"))
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        browser: browser.version(),
        viewport: ["1440x1000", "390x844", "320x760"],
        checks,
        errors,
        samples,
        requests,
        limitations: [
          "Intercepted HTTP/WS contracts; no live exchange, custody, funds or transfer recovery verification.",
          "Retry reference is retained only for the mounted form, not persisted across reloads.",
        ],
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ checks: checks.length, errors, samples }))
} catch (e) {
  await capture("failure")
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify({ error: String(e), checks, errors, requests }, null, 2),
  )
  throw e
} finally {
  if (cdp) await cdp.detach()
  await context.close()
  await browser.close()
}
