// Public market and synthetic authentication fixtures only; no live accounts or funds.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-c2c-visitor"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
context.setDefaultTimeout(12000)
await context.addInitScript(() => localStorage.setItem("surprising-ex.language", "en"))
const iso = "2026-10-27T01:00:00Z", uid = n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`
const market = { marketId: uid(1), asset: "USDT", fiat: "CNY", assetScale: "100000000", minFiat: "1", maxFiat: "100000", paymentWindowSeconds: 900 }
const methods = [{ code: "BANK", label: "银行卡", currencies: ["CNY"], requiresBankName: true, supportsQr: false }]
const ad = (n, side = "SELL", nickname = "合成公开商家 · " + "长名称测试".repeat(25)) => ({ adId: uid(n), makerUserId: "9007199254740993", market, side, price: "6.650000000000000001", availableQuantity: "100", minFiat: "1", maxFiat: "665", revision: "9007199254740993", status: "ACTIVE", methodCodes: ["BANK"], merchant: { nickname } })
const session = { accessToken: "visitor-auth-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: { userId: "1", username: "合成登录用户", status: "ACTIVE", roles: ["USER"], createdAt: iso } }
let runtime = true, business = true, malformed = true, failAds = false, empty = false, wrongAds = false, holdAmount = false, releaseOffers, challenge = false, emailRequired = false
const requests = [], checks = [], errors = []
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method()
  requests.push({ path: p, method, query: url.search, headers: req.headers() })
  let status = 200, data = {}
  if (p === "/api/v1/c2c/status") data = { runtimeEnabled: runtime, businessEnabled: business, available: runtime && business, reason: "" }
  else if (p === "/api/v1/c2c/markets") data = { markets: [market], paymentMethods: methods }
  else if (p === "/api/v1/c2c/ads" && method === "GET") {
    const amount = url.searchParams.get("amount"), side = url.searchParams.get("side") === "BUY" ? "SELL" : "BUY", offset = Number(url.searchParams.get("offset"))
    const row = ad(offset ? 20 : 10, wrongAds ? "BUY" : side, amount === "11" ? "过期筛选公开商家" : amount === "22" ? "当前筛选公开商家" : offset ? "第二页公开商家" : undefined)
    data = malformed ? {} : { items: empty ? [] : [row], hasMore: !empty && offset === 0, offset }
    if (holdAmount && amount === "11") await new Promise(resolve => releaseOffers = resolve)
    if (failAds) { status = 503; data = { message: "Synthetic public offers unavailable" } }
  } else if (p === "/api/v1/auth/telegram/config") data = { enabled: false }
  else if (p === "/api/v1/auth/login") data = challenge ? { requiresVerification: true, challengeToken: "visitor-fixture-challenge", expiresAt: "2030-01-01T00:00:00Z", methods: [{ type: "EMAIL", destination: "fixture@example.test" }] } : { ...session, requiresEmailVerification: emailRequired }
  else if (p === "/api/v1/auth/login/verify" || p === "/api/v1/auth/register") data = { ...session, requiresEmailVerification: emailRequired }
  else if (p === "/api/v1/auth/verify-email") data = true
  else if (p === "/api/v1/c2c/payment-accounts") data = { items: [] }
  else if (p === "/api/v1/c2c/me") data = { kycVerified: true, merchant: null }
  else if (p === "/api/v1/c2c/me/merchant-bond") data = { policy: { configured: false, revision: "0" }, bond: null }
  else if (p === "/api/v1/c2c/me/ads") data = { items: [] }
  else if (p === "/api/v1/c2c/orders") data = { items: [], hasMore: false, offset: Number(url.searchParams.get("offset") || 0) }
  else if (p === "/api/v1/c2c/conversations") data = { items: [], hasMore: false }
  else if (p === "/api/v1/announcements" || p.endsWith("/notifications")) data = { items: [], hasMore: false, nextCursor: null }
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) })
})
await context.routeWebSocket(/\/ws\/v1/, ws => ws.onMessage(raw => { const frame = JSON.parse(String(raw)); if (frame.op === "authenticate") ws.send(JSON.stringify({ op: "authenticated", id: frame.id })); if (frame.op === "ping") ws.send(JSON.stringify({ op: "pong" })) }))
const page = await context.newPage()
page.on("pageerror", error => errors.push(error.message))
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()) })
const publicMarket = page.getByRole("region", { name: "C2C 公开市场", exact: true })
const capture = name => page.screenshot({ path: path.join(out, name + ".png") })
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow")
const until = async predicate => { for (let n = 0; n < 200; n++) { if (predicate()) return; await page.waitForTimeout(30) } throw Error("fixture not reached") }
const clearSession = () => page.evaluate(() => { localStorage.removeItem("surprising-ex.session"); window.dispatchEvent(new Event("surprising-ex.session-changed")) })
const signIn = async () => { await page.locator(".auth-form").getByRole("button", { name: "Log In", exact: true }).waitFor(); await page.getByRole("textbox", { name: "Email or phone", exact: true }).fill("fixture@example.test"); await page.getByLabel("Password", { exact: true }).fill("synthetic-password"); await page.locator(".auth-form").getByRole("button", { name: "Log In", exact: true }).click() }
let cdp
try {
  await page.goto("http://127.0.0.1:5183/c2c")
  await publicMarket.getByRole("button", { name: "重新查询广告", exact: true }).waitFor()
  assert.equal(await publicMarket.getByText("暂无符合条件的广告", { exact: true }).count(), 0)
  malformed = false; await publicMarket.getByRole("button", { name: "重新查询广告", exact: true }).click(); await publicMarket.locator(".c2c-offer-card").waitFor()
  assert(!requests.some(row => /\/c2c\/(me|orders|payment-accounts|conversations)/.test(row.path)))
  assert(!requests.some(row => row.headers.authorization)); assert.equal(requests.filter(row => row.method === "POST").length, 0)
  await capture("visitor-desktop-light"); await fit()
  checks.push("visitor opens the public market; incomplete offers remain a recoverable error; no private read, authentication header or write is sent")
  await publicMarket.getByRole("button", { name: "下一页", exact: true }).click(); await publicMarket.getByRole("heading", { name: "第二页公开商家", exact: true }).waitFor(); await publicMarket.getByRole("button", { name: "上一页", exact: true }).click()
  holdAmount = true; await publicMarket.getByLabel("法币金额筛选（CNY）", { exact: true }).fill("11"); await until(() => Boolean(releaseOffers))
  await publicMarket.getByLabel("法币金额筛选（CNY）", { exact: true }).fill("22"); await publicMarket.getByRole("heading", { name: "当前筛选公开商家", exact: true }).waitFor(); holdAmount = false; releaseOffers(); await page.waitForTimeout(100); assert.equal(await publicMarket.getByRole("heading", { name: "过期筛选公开商家", exact: true }).count(), 0)
  const reads = requests.filter(row => row.path === "/api/v1/c2c/ads").length; await publicMarket.getByLabel("法币金额筛选（CNY）", { exact: true }).fill("1e4"); await publicMarket.getByText("请输入大于零的法币金额，使用普通十进制格式。", { exact: true }).waitFor(); await page.waitForTimeout(300); assert.equal(requests.filter(row => row.path === "/api/v1/c2c/ads").length, reads)
  await publicMarket.getByLabel("法币金额筛选（CNY）", { exact: true }).fill(""); await publicMarket.getByRole("button", { name: "我要卖", exact: true }).click(); await publicMarket.getByRole("link", { name: "登录后出售", exact: true }).waitFor(); await publicMarket.getByRole("button", { name: "我要买", exact: true }).click()
  wrongAds = true; await publicMarket.getByRole("button", { name: "刷新市场", exact: true }).click(); await publicMarket.getByText("广告响应与当前市场或方向不匹配，请重新查询。", { exact: true }).waitFor(); wrongAds = false
  failAds = true; await publicMarket.getByRole("button", { name: "重新查询广告", exact: true }).click(); await publicMarket.getByText("The service is temporarily unavailable. Please try again shortly.", { exact: true }).waitFor(); await page.waitForTimeout(350); failAds = false; await publicMarket.getByRole("button", { name: "重新查询广告", exact: true }).click(); await publicMarket.locator(".c2c-offer-card").waitFor()
  checks.push("offer pagination, both directions, exact amount filters, stale-response cancellation, invalid amount prevention, mismatched data and service failure recovery were clicked")
  empty = true; await publicMarket.getByRole("button", { name: "刷新市场", exact: true }).click(); await publicMarket.getByText("暂无符合条件的广告", { exact: true }).waitFor(); empty = false; business = false; await publicMarket.getByRole("button", { name: "刷新市场", exact: true }).click(); await publicMarket.getByText("C2C 市场暂未开放", { exact: true }).waitFor(); runtime = false; await publicMarket.getByRole("button", { name: "刷新市场", exact: true }).click(); await publicMarket.getByText("C2C 市场暂未开放", { exact: true }).waitFor(); runtime = true; business = true; await publicMarket.getByRole("button", { name: "刷新市场", exact: true }).click(); await publicMarket.locator(".c2c-offer-card").waitFor()
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click(); await page.waitForTimeout(350); await capture("visitor-desktop-dark")
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await page.evaluate(() => window.scrollTo(0, 0)); await fit(); await capture(`visitor-${width}-dark`); await publicMarket.locator(".c2c-offer-card").scrollIntoViewIfNeeded(); assert.equal(await publicMarket.locator(".c2c-offer-price").evaluate(node => { const range = document.createRange(); range.selectNodeContents(node.firstChild); return range.getClientRects().length }), 1, "precise price splits within its digits"); await capture(`visitor-${width}-offer-dark`) }
  await page.getByRole("button", { name: "Use light theme", exact: true }).click(); await page.waitForTimeout(350); await capture("visitor-320-offer-light"); await page.evaluate(() => window.scrollTo(0, 0)); await capture("visitor-320-light"); await fit(); await page.setViewportSize({ width: 1440, height: 1000 })
  checks.push("empty results and business/runtime closure are distinct; complete long merchant names fit desktop/390/320 and light/dark themes")
  await publicMarket.getByRole("link", { name: "登录交易", exact: true }).click(); assert.equal(new URL(page.url()).searchParams.get("redirect"), "/c2c")
  await page.getByRole("link", { name: "Create Account", exact: true }).last().click(); assert.equal(new URL(page.url()).searchParams.get("redirect"), "/c2c"); await page.getByRole("link", { name: "Back to login", exact: true }).click(); await signIn()
  await page.getByRole("navigation", { name: "C2C 功能", exact: true }).getByRole("button", { name: "我的订单", exact: true }).waitFor(); assert.equal(new URL(page.url()).pathname, "/c2c")
  assert.equal(requests.filter(row => row.method === "POST" && row.path.startsWith("/api/v1/c2c/")).length, 0)
  await clearSession(); await page.goto("http://127.0.0.1:5183/c2c/messages"); await page.locator(".c2c-login").getByRole("link", { name: "Sign in", exact: true }).click(); challenge = true; await signIn()
  const dialog = page.getByRole("dialog", { name: "Security verification", exact: true }); await dialog.getByRole("textbox", { name: "Email verification code", exact: true }).fill("123456"); await dialog.getByRole("button", { name: "Confirm", exact: true }).click(); await page.locator(".c2c-workspace").waitFor(); assert.equal(new URL(page.url()).pathname, "/c2c/messages")
  checks.push("login/register/back links preserve the C2C destination; normal login returns to the market, verification login returns to the inbox, and neither creates an order")
  await clearSession(); challenge = false; emailRequired = true; await page.goto("http://127.0.0.1:5183/auth/login?redirect=%2Fc2c"); await signIn(); await page.getByRole("textbox", { name: "Verification code", exact: true }).waitFor(); assert.equal(new URL(page.url()).pathname, "/auth/verify-email"); assert.equal(new URL(page.url()).searchParams.get("redirect"), "/c2c")
  await page.getByRole("textbox", { name: "Email or phone", exact: true }).fill("fixture@example.test"); await page.getByRole("textbox", { name: "Verification code", exact: true }).fill("123456"); await page.locator(".auth-form").getByRole("button", { name: "Verify Email", exact: true }).click(); await page.getByRole("navigation", { name: "C2C 功能", exact: true }).getByRole("button", { name: "我的订单", exact: true }).waitFor(); assert.equal(new URL(page.url()).pathname, "/c2c")
  await clearSession(); await page.goto("http://127.0.0.1:5183/c2c"); await publicMarket.locator(".c2c-offer-card").waitFor()
  checks.push("required email verification retains the market destination until verification completes; logout returns to public discovery")
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage")
  const samples = [], before = requests.length
  for (let n = 0; n <= 6; n++) { if (n) await page.waitForTimeout(10000); const { metrics } = await cdp.send("Performance.getMetrics"); samples.push({ seconds: n * 10, ...Object.fromEntries(metrics.filter(row => ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration"].includes(row.name)).map(row => [row.name, row.value])) }) }
  await cdp.send("HeapProfiler.collectGarbage"); const afterGc = (await cdp.send("Performance.getMetrics")).metrics; assert.equal(requests.slice(before).filter(row => row.path.startsWith("/api/v1/c2c/")).length, 0)
  checks.push("60-second public page observation sampled every 10 seconds; no background private reads or unnecessary C2C polling")
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ fixtureOnly: true, browser: browser.version(), checks, errors, sizes: ["1440x1000", "390x844", "320x844"], requests, observation: { durationSeconds: 60, sampleIntervalSeconds: 10, samples, afterGc, limitation: "Short synthetic local observation; task duration is a main-thread proxy, not production CPU or a long-term leak guarantee." } }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, errors, requestCount: requests.length, output: out }))
} catch (error) { await capture("failure").catch(() => {}); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, requests }, null, 2)); throw error }
finally { releaseOffers?.(); await cdp?.detach().catch(() => {}); await context.close(); await browser.close() }
