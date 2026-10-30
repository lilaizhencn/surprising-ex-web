// Isolated HTTP fixtures. No real wallet or funds operations.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-withdrawal-client-qa"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const session = {
  accessToken: "withdrawal-ui-fixture",
  refreshToken: "withdrawal-ui-fixture",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
  user: {
    userId: "1",
    username: "fixture",
    roles: ["USER"],
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
  },
}
await context.addInitScript((value) => {
  if(!localStorage.getItem("surprising-ex.language")) localStorage.setItem("surprising-ex.language", "en")
  const set = Storage.prototype.setItem,
    remove = Storage.prototype.removeItem
  Storage.prototype.setItem = function (key, value) {
    if (window.__denyIntentWrite && key.startsWith("surprising-ex.withdrawal-intent:"))
      throw new DOMException("blocked", "SecurityError")
    return set.call(this, key, value)
  }
  Storage.prototype.removeItem = function (key) {
    if (window.__denyIntentClear && key.startsWith("surprising-ex.withdrawal-intent:"))
      throw new DOMException("blocked", "SecurityError")
    return remove.call(this, key)
  }
}, session)
const network = (code, name, min, fee) => ({
  networkId: code === "ETH" ? 1 : 2,
  networkCode: code,
  displayName: name,
  minDeposit: "1E-8",
  minWithdrawal: min,
  withdrawalFee: fee,
  confirmations: 12,
})
const catalog = [
  {
    asset: "USDT",
    displayName: "Tether",
    logoUrl: "",
    networks: [network("ETH", "Ethereum", "0.01", "0.0001"), network("TRON", "Tron", "1", "1E-8")],
  },
  {
    asset: "BTC",
    displayName: "Bitcoin",
    logoUrl: "",
    networks: [network("BTC", "Bitcoin", "0.0002", "0.0001")],
  },
]
const quoteFor = (body) => {
  const fee = body.chain === "TRON" ? "0.00000001" : "0.0001";
  const units = (value) => { const [whole, fraction=""] = value.split("."); return BigInt(whole + fraction.padEnd(8,"0")); };
  const net = (units(body.amount)-units(fee)).toString().padStart(9,"0");
  return {asset:body.assetSymbol, chain:body.chain, amount:body.amount, fee, receivedAmount:net.slice(0,-8)+"."+net.slice(-8), networkRevision:17};
};
let failCatalog = true,
  failHistory = false,
  postMode = "unknown",
  holdPost = false,
  releasePost,
  holdHistory = false,
  releaseHistory,
  spotEnabled = true,
  excludeBTC = false,
  excludeETH = false,
  holdDeposit = true,
  releaseDeposit,
  depositFailure = false
const requests = [],
  errors = [],
  checks = []
await context.route(
  (url) => url.pathname.startsWith("/api/"),
  async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      endpoint = url.pathname.split("/").at(-1)
    requests.push({
      path: url.pathname,
      query: url.search,
      method: req.method(),
      body: req.postData(),
      headers: req.headers(),
    })
    let status = 200,
      data = {}
    if (endpoint === "csrf") data={token:"test-only-csrf"}
    else if (url.pathname.endsWith("/browser/refresh")) data={...session,browserSession:true,refreshToken:undefined}
    else if (endpoint === "assets") {
      status = failCatalog ? 503 : 200
      data = failCatalog
        ? { message: "Synthetic catalog unavailable" }
        : excludeBTC
          ? catalog.filter((row) => row.asset !== "BTC")
          : catalog.map((row) => ({
              ...row,
              networks: excludeETH
                ? row.networks.filter((network) => network.networkCode !== "ETH")
                : row.networks,
            }))
    } else if (endpoint === "deposit-address") {
      const body = JSON.parse(req.postData())
      data = {
        asset: body.asset,
        network: body.network,
        address: "0x" + "b".repeat(40),
        memo: "required-memo-123",
      }
    } else if (endpoint === "deposits") {
      if (holdDeposit) await new Promise((resolve) => (releaseDeposit = resolve))
      status = depositFailure ? 503 : 200
      data = depositFailure ? { message: "Synthetic deposit records unavailable" } : []
    } else if (endpoint === "runtime")
      data = { productLines: spotEnabled ? ["SPOT", "LINEAR_PERPETUAL"] : ["LINEAR_PERPETUAL"] }
    else if (endpoint === "asset-scales") data = { USDT: "100000000", BTC: "100000000" }
    else if (endpoint === "transfers")
      data = {
        count: 0,
        transfers: [],
        nextCursor: null,
        hasMore: false,
        sort: "createdAt.desc",
        limit: 100,
      }
    else if (endpoint === "balances" || endpoint === "product-balances")
      data = {
        balances: [
          { asset: "USDT", availableUnits: "9007199254740993", lockedUnits: "0" },
          { asset: "BTC", availableUnits: "100000000", lockedUnits: "0" },
        ],
      }
    else if (endpoint === "quote") data = quoteFor(JSON.parse(req.postData()))
    else if (endpoint === "submission") {
      status = 404; data = {message:"Original request is not yet known. Retry only the original reference."}
    }
    else if (endpoint === "withdrawals" && req.method() === "POST") {
      if (holdPost) await new Promise((resolve) => (releasePost = resolve))
      status = postMode === "unknown" ? 503 : postMode === "rejected" ? 428 : 200
      data =
        status === 200
          ? {
              id: "wallet-fixture",
              withdrawalId: "11111111-1111-4111-8111-111111111111",
              status: "PENDING_APPROVAL",
              success: true,
              amount: JSON.parse(req.postData()).amount,
              platformFee: quoteFor(JSON.parse(req.postData())).fee,
              receivedAmount: quoteFor(JSON.parse(req.postData())).receivedAmount,
              networkRevision: 17,
            }
          : {
              message:
                postMode === "rejected"
                  ? "security verification is required or invalid"
                  : "Synthetic unknown withdrawal",
            }
    } else if (endpoint === "withdrawals") {
      const asset = url.searchParams.get("asset") || "USDT"
      if (holdHistory && asset === "USDT")
        await new Promise((resolve) => (releaseHistory = resolve))
      status = failHistory ? 503 : 200
      data = failHistory
        ? { message: "Synthetic history unavailable" }
        : [
            {
              id: `history-${asset}`,
              gatewayWithdrawalId:
                asset === "USDT"
                  ? "22222222-2222-4222-8222-222222222222"
                  : "33333333-3333-4333-8333-333333333333",
              asset,
              amount: asset === "USDT" ? "0.00000001" : "0.2",
              chain: asset === "USDT" ? "ETH" : "BTC",
              status: "SUBMITTED",
              toAddress:
                "long_recipient_address_for_complete_mobile_layout_012345678901234567890123456789",
              createdAt: "2026-10-26T12:00:00Z",
              custodyWalletUnavailable: true,
            },
          ]
    } else if (req.method() === "POST" && url.pathname.includes("challenge"))
      data = { challengeId: 1, expiresAt: "2030-01-01T00:00:00Z", simulated: true }
    try {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) })
    } catch {
      /* Deliberately cancelled read. */
    }
  },
)
await context.routeWebSocket(
  (url) => url.pathname === "/ws/v1",
  (socket) => {
    socket.onMessage((raw) => {
      const frame = JSON.parse(String(raw))
      if (frame.op === "authenticate")
        socket.send(JSON.stringify({ op: "authenticated", id: frame.id }))
      if (frame.op === "ping") socket.send(JSON.stringify({ op: "pong" }))
      if (frame.op === "subscribe" && frame.channel === "accountState")
        socket.send(
          JSON.stringify({
            op: "snapshot",
            userId: "1",
            productLine: frame.productLine,
            eventTime: new Date().toISOString(),
            data: {
              status: "READY",
              snapshotVersion: "0000000000000000001:0000000000",
              account: {
                positionMode: "ONE_WAY",
                balances: [],
                reservations: [],
                leverages: [],
                positions: [],
              },
              openOrders: [],
              triggerOrders: [],
              positionRisks: [],
            },
          }),
        )
    })
  },
)
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !/^Failed to load resource: the server responded with a status of (503|428)\b/.test(
        message.text(),
      )
    )
      errors.push(message.text())
  })
}
const page = await context.newPage()
watch(page)
const until = async (condition) => {
  const end = Date.now() + 7000
  while (!condition()) {
    assert(Date.now() < end, "condition timed out")
    await page.waitForTimeout(25)
  }
}
const capture = async (name) => {
  await page.waitForTimeout(120)
  await page.screenshot({ path: path.join(out, name + ".png") })
}
const fit = async () =>
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "page overflows",
  )
const choose = async (page, name, label) => {
  await page.getByRole("combobox", { name, exact: true }).click()
  await page.getByRole("option", { name: label, exact: true }).click()
}
const codes = async (page) => {
  await page.getByRole("textbox", { name: "Email code", exact: true }).fill("123456")
  await page.getByRole("textbox", { name: "Authenticator code", exact: true }).fill("654321")
}
const form = async (page, value = "0.05") => {
  await choose(page, "Network", "Ethereum (ETH)")
  await page
    .getByRole("textbox", { name: "Recipient wallet address", exact: true })
    .fill("  0x" + "a".repeat(40) + "  ")
  await page.getByRole("textbox", { name: "Withdrawal amount", exact: true }).fill(value)
  await codes(page)
}
const posts = () =>
  requests.filter((request) => request.method === "POST" && request.path.endsWith("/withdrawals"))
let cdp
try {
  await page.goto("http://127.0.0.1:5183/assets/withdraw?asset=USDT")
  await page.getByRole("button", { name: "Retry", exact: true }).first().waitFor()
  assert(await page.getByRole("button", { name: "Review withdrawal", exact: true }).isDisabled())
  failCatalog = false
  await page.getByRole("button", { name: "Retry", exact: true }).first().click()
  await page
    .locator(".withdraw-available strong")
    .getByText("90071992.54740993 USDT", { exact: true })
    .waitFor()
  await form(page, "0.009")
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await page.getByText("The amount is below the network minimum.", { exact: true }).waitFor()
  await page.getByRole("textbox", { name: "Withdrawal amount", exact: true }).fill("0.000000001")
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await page.getByText("Quantity exceeds asset precision.", { exact: true }).waitFor()
  await page
    .getByRole("textbox", { name: "Withdrawal amount", exact: true })
    .fill("90071992.54740994")
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await page.getByText("Insufficient available balance.", { exact: true }).waitFor()
  assert.equal(posts().length, 0)
  checks.push(
    "catalog failure/retry; exact available balance, minimum, precision and insufficient-funds validation before sending",
  )
  excludeETH = true
  await page.getByRole("button", { name: "Refresh balance", exact: true }).click()
  await page
    .getByRole("combobox", { name: "Network", exact: true })
    .getByText("Select network", { exact: true })
    .waitFor()
  assert(await page.getByRole("button", { name: "Review withdrawal", exact: true }).isDisabled())
  excludeETH = false
  await page.getByRole("button", { name: "Refresh balance", exact: true }).click()
  checks.push(
    "a disabled selected network clears the selection and requires a new explicit network choice",
  )
  await choose(page, "Network", "Tron (TRON)")
  assert((await page.locator(".withdraw-limits").innerText()).includes("0.00000001 USDT"))
  await form(page)
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  const review = page.getByRole("dialog", { name: "Review withdrawal", exact: true })
  await review.waitFor()
  assert((await review.innerText()).includes("0x" + "a".repeat(40)))
  assert((await review.innerText()).includes("0.0001 USDT"))
  assert.equal(posts().length, 0)
  await review.press("Escape")
  assert(
    await page
      .getByRole("button", { name: "Review withdrawal", exact: true })
      .evaluate((element) => element === document.activeElement),
  )
  await page.locator(".withdraw-back").scrollIntoViewIfNeeded()
  await capture("withdraw-desktop-light")
  await page
    .getByRole("link", { name: "Transfer funds to the funding account", exact: true })
    .click()
  await page
    .getByRole("combobox", { name: "Source account", exact: true })
    .getByText("Spot", { exact: true })
    .waitFor()
  assert(
    (
      await page.getByRole("combobox", { name: "Destination account", exact: true }).innerText()
    ).includes("Funding account"),
  )
  assert(
    (await page.getByRole("combobox", { name: "Asset", exact: true }).innerText()).includes("USDT"),
  )
  await page.goBack()
  await form(page)
  checks.push(
    "the funding top-up link preserves the asset and presets a product source and funding destination",
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await fit()
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await review.waitFor()
  await capture("withdraw-review-mobile-light")
  await review.press("Escape")
  checks.push(
    "configured network fee stays precise; review shows complete address/network/amount/fee, Escape restores focus, and no POST occurs before confirmation",
  )
  await page.evaluate(() => (window.__denyIntentWrite = true))
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await review.getByRole("button", { name: "Confirm withdrawal", exact: true }).click()
  await page
    .getByText("Cannot save the withdrawal reference. Check browser storage before submitting.", {
      exact: true,
    })
    .waitFor()
  assert.equal(posts().length, 0)
  await page.evaluate(() => (window.__denyIntentWrite = false))
  const fresh = await context.newPage()
  watch(fresh)
  await fresh.goto("http://127.0.0.1:5183/assets/withdraw?asset=USDT")
  await form(fresh)
  await fresh.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await fresh.getByRole("dialog", { name: "Review withdrawal", exact: true }).waitFor()

  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await review.getByRole("button", { name: "Confirm withdrawal", exact: true }).click()
  await page
    .getByRole("heading", { name: "Withdrawal result needs confirmation", exact: true })
    .waitFor()
  await fresh
    .getByRole("heading", { name: "Withdrawal result needs confirmation", exact: true })
    .waitFor()
  assert.equal(
    await fresh.getByRole("dialog", { name: "Review withdrawal", exact: true }).count(),
    0,
  )
  await fresh.close()
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }),
  )
  await page.getByRole("button", { name: "Copy request reference", exact: true }).click()
  await page.getByText("Copy failed. Copy the reference manually.", { exact: true }).waitFor()
  checks.push(
    "another tab’s stored request invalidates an open confirmation; unavailable clipboard is recoverable without crashing or sending another request",
  )

  const first = posts()[0],
    body = JSON.parse(first.body),
    reference = body.externalReference
  assert.equal(body.amount, "0.05")
  assert.equal(body.toAddress, "0x" + "a".repeat(40))
  assert.equal(first.headers["idempotency-key"], reference)
  assert.equal(
    await page.getByRole("button", { name: "Start a new withdrawal", exact: true }).count(),
    0,
  )
  const saved = await page.evaluate(() => localStorage.getItem("surprising-ex.withdrawal-intent:1"))
  assert(!saved.includes("123456") && !saved.includes("654321"))
  await page.reload()
  await page.getByText(reference, { exact: true }).waitFor()
  assert.equal(posts().length, 1)
  assert.equal(
    await page.getByRole("textbox", { name: "Email code", exact: true }).inputValue(),
    "",
  )
  checks.push(
    "denied durable storage prevents POST; unknown response preserves original details/reference across reload without saving security codes or allowing a new request",
  )
  const second = await context.newPage()
  watch(second)
  await second.goto("http://127.0.0.1:5183/assets/withdraw?asset=USDT")
  await second.getByText(reference, { exact: true }).waitFor()
  await codes(page)
  await codes(second)
  holdPost = true
  postMode = "accepted"
  await page.getByRole("button", { name: "Retry original withdrawal", exact: true }).click()
  await until(() => !!releasePost)
  await second.getByRole("button", { name: "Retry original withdrawal", exact: true }).click()
  await second
    .getByText("Another tab is handling this withdrawal. Check its result before retrying.", {
      exact: true,
    })
    .waitFor()
  assert.equal(posts().length, 2)
  releasePost()
  holdPost = false
  await page.getByRole("heading", { name: "Withdrawal request recorded", exact: true }).waitFor()
  await second.getByRole("heading", { name: "Withdrawal request recorded", exact: true }).waitFor()
  assert.equal(JSON.parse(posts()[1].body).externalReference, reference)
  assert.deepEqual(JSON.parse(posts()[1].body), body)
  await second.close()
  await capture("withdraw-recorded-mobile-light")
  checks.push(
    "cross-tab lock allows only one in-flight retry; the original body/reference is reused; recorded response synchronizes across tabs without claiming blockchain completion",
  )
  await page.evaluate(() => (window.__denyIntentClear = true))
  await page.getByRole("button", { name: "Start a new withdrawal", exact: true }).click()
  await page
    .getByText("Cannot save withdrawal confirmation. Keep the original reference and retry.", {
      exact: true,
    })
    .waitFor()
  assert(
    await page
      .getByRole("heading", { name: "Withdrawal request recorded", exact: true })
      .isVisible(),
  )
  await page.evaluate(() => (window.__denyIntentClear = false))
  await page.getByRole("button", { name: "Start a new withdrawal", exact: true }).click()
  await form(page)
  postMode = "rejected"
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).click()
  await review.getByRole("button", { name: "Confirm withdrawal", exact: true }).click()
  await page.getByRole("heading", { name: "Withdrawal request rejected", exact: true }).waitFor()
  await page.getByRole("button", { name: "Start a new withdrawal", exact: true }).click()
  checks.push(
    "an explicit first-request policy rejection is shown separately and requires an explicit new-request action",
  )
  holdHistory = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await until(() => !!releaseHistory)
  await choose(page, "Asset", "BTC Bitcoin")
  await page.getByText("0.2 BTC", { exact: true }).waitFor()
  releaseHistory()
  holdHistory = false
  assert(!(await page.locator(".withdraw-history").innerText()).includes("0.00000001 USDT"))
  failHistory = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor()
  assert.equal(await page.locator(".withdraw-history li").count(), 0)
  failHistory = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByText("0.2 BTC", { exact: true }).waitFor()
  spotEnabled = false
  await page.getByRole("button", { name: "Refresh balance", exact: true }).click()
  await page
    .getByText("The SPOT funding account is not enabled for withdrawals.", { exact: true })
    .waitFor()
  assert(await page.getByRole("button", { name: "Review withdrawal", exact: true }).isDisabled())
  spotEnabled = true
  await page.getByRole("button", { name: "Refresh balance", exact: true }).click()
  checks.push(
    "asset-scoped history cancels stale reads, failure clears old records and retries; disabled SPOT does not show a spendable zero balance",
  )
  const postCountBeforeSwitch = posts().length
  await page.evaluate(
    async ({ raw, session }) => {
      localStorage.setItem("surprising-ex.withdrawal-intent:1", raw)
      const state=await import('/src/state/session.ts');
      state.saveSession({...session,accessToken:"owner-2-fixture",user:{...session.user,userId:"2"}});
    },
    { raw: saved, session },
  )
  await page.getByRole("button", { name: "Review withdrawal", exact: true }).waitFor()
  assert.equal(await page.getByText(reference, { exact: true }).count(), 0)
  await page.evaluate(async (session) => {
    (await import("/src/state/session.ts")).saveSession(session)
  }, session)
  await page.getByText(reference, { exact: true }).waitFor()
  assert.equal(posts().length, postCountBeforeSwitch)
  await page.evaluate(() => {
    localStorage.removeItem("surprising-ex.withdrawal-intent:1")
    window.dispatchEvent(new Event("surprising-ex.withdrawal-intent-changed"))
  })
  checks.push(
    "failed receipt removal retains the original request; switching login owners hides another user’s pending request and restoring the owner restores its reference without POST",
  )
  excludeBTC = true
  await page.goto("http://127.0.0.1:5183/assets/withdraw?asset=BTC")
  await page
    .getByText("This asset is not enabled for withdrawals. Select an available asset.", {
      exact: true,
    })
    .waitFor()
  assert(await page.getByRole("button", { name: "Review withdrawal", exact: true }).isDisabled())
  const assignedBeforeUnsupported = requests.filter((r) =>
    r.path.endsWith("/deposit-address"),
  ).length
  await page.goto("http://127.0.0.1:5183/assets/deposit?asset=BTC")
  await page
    .getByText("This asset is not enabled for deposits. Select an available asset.", {
      exact: true,
    })
    .waitFor()
  assert.equal(
    requests.filter((r) => r.path.endsWith("/deposit-address")).length,
    assignedBeforeUnsupported,
  )
  await choose(page, "Asset", "USDT Tether")
  checks.push(
    "an unsupported requested asset never silently switches to another asset or allocates its deposit address; an explicit available-asset selection is required",
  )
  await choose(page, "Network", "Ethereum (ETH)")
  await until(() => !!releaseDeposit)
  const deposits = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Deposit history", exact: true }) })
  await deposits.getByText("Loading records", { exact: true }).waitFor()
  assert(!(await deposits.innerText()).includes("No deposit records yet."))
  assert((await page.locator(".deposit-facts").innerText()).includes("0.00000001 USDT"))
  depositFailure = true
  releaseDeposit()
  holdDeposit = false
  await deposits.getByRole("button", { name: "Retry deposit records", exact: true }).waitFor()
  const addressRequests = requests.filter((r) => r.path.endsWith("/deposit-address")).length
  depositFailure = false
  await deposits.getByRole("button", { name: "Retry deposit records", exact: true }).click()
  await deposits.getByText("No deposit records yet.", { exact: true }).waitFor()
  assert.equal(requests.filter((r) => r.path.endsWith("/deposit-address")).length, addressRequests)
  await page.locator(".deposit-qr").waitFor()
  await capture("deposit-records-mobile-light")
  checks.push(
    "deposit network amounts normalize exactly; records distinguish loading, error and real empty; retry does not reassign the deposit address",
  )
  excludeBTC = false
  await page.goto("http://127.0.0.1:5183/assets/withdraw?asset=BTC")
  await page.setViewportSize({ width: 320, height: 760 })
  await fit()
  await capture("withdraw-mobile-320-light")
  await page.evaluate(() => {
    localStorage.setItem("surprising-ex.language", "zh")
    localStorage.setItem("surprising-ex.theme", "dark")
  })
  await page.reload()
  await page.locator(".withdraw-page h1").waitFor()
  assert(/[\u4e00-\u9fff]/.test(await page.locator(".withdraw-page h1").innerText()))
  await page.setViewportSize({ width: 390, height: 844 })
  await fit()
  await capture("withdraw-mobile-dark-zh")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await capture("withdraw-desktop-dark-zh")
  await page.evaluate(() => localStorage.setItem("surprising-ex.withdrawal-intent:1", "broken"))
  await page.reload()
  await page
    .getByText("无法读取已保存的提现编号。再次提交前，请先核对原请求。", { exact: true })
    .waitFor()
  assert.equal(await page.getByRole("button", { name: "复核提现信息", exact: true }).count(), 0)
  await page.evaluate(() => localStorage.removeItem("surprising-ex.withdrawal-intent:1"))
  await page.reload()
  checks.push(
    "light/dark and Chinese layouts at 1440/390/320px fit; corrupt stored intent blocks a replacement submission and offers recovery",
  )
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
      requests: requests.length,
    })
    if (index < 6) await page.waitForTimeout(10000)
  }
  assert.equal(errors.length, 0, errors.join("\n"))
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      {
        browser: browser.version(),
        checks,
        errors,
        requests,
        samples,
        limitations: [
          "HTTP fixtures only; no real funds, custody, KYC, security-code or approval execution.",
          "No live crash/restart or blockchain recovery verified.",
        ],
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ checks: checks.length, errors, samples }))
} catch (error) {
  await capture("failure")
  await fs.writeFile(
    path.join(out, "failure.json"),
    JSON.stringify({ error: String(error), checks, errors, requests }, null, 2),
  )
  throw error
} finally {
  if (cdp) await cdp.detach()
  await context.close()
  await browser.close()
}
