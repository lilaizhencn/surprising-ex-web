// Synthetic C2C contracts only. No live accounts, transfers, payment confirmations or disputes.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-c2c-client"
await fs.mkdir(out, {recursive: true})
const browser = await chromium.launch({headless: true, executablePath: process.env.QA_CHROMIUM})
const context = await browser.newContext({viewport: {width: 1440, height: 1000}})
context.setDefaultTimeout(12_000)
const uid = n => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`
const iso = "2026-10-27T00:00:00Z", session = {accessToken: "c2c-ui-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: {userId: "1", username: "C2C fixture", status: "ACTIVE", roles: ["USER"], createdAt: iso}}
await context.addInitScript(value => {if (!sessionStorage.c2cQaInitialized) {localStorage.setItem("surprising-ex.session", JSON.stringify(value)); localStorage.setItem("surprising-ex.language", "en"); sessionStorage.c2cQaInitialized = "yes"} Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText: async value => {window.__copied = value}}})}, session)
const market = {marketId: uid(1), asset: "USDT", fiat: "CNY", assetScale: "100000000", minFiat: "1", maxFiat: "100000", paymentWindowSeconds: 900}
const methods = [{code: "BANK", label: "银行卡", currencies: ["CNY"], requiresBankName: true, supportsQr: false}, {code: "CASH", label: "现金方式", currencies: ["CNY"], requiresBankName: false, supportsQr: false}]
const accounts = [{accountId: uid(30), methodCode: "CASH", fiat: "CNY", maskedLabel: "****0030", status: "APPROVED", revision: "9007199254740993"}, {accountId: uid(31), methodCode: "BANK", fiat: "CNY", maskedLabel: "****0031", status: "APPROVED", revision: "9007199254740993"}]
for (let n = 0; n < 7; n++) accounts.push({...accounts[1], accountId: uid(100 + n), maskedLabel: "****010" + n})
const ad = (n, side, nickname) => ({adId: uid(n), makerUserId: "9007199254740993", market, side, price: "6.65", availableQuantity: "100", minFiat: "1", maxFiat: "665", revision: "9007199254740993", status: "ACTIVE", methodCodes: ["BANK"], merchant: {nickname, completedTotal: "9007199254740993"}, paymentOptions: side === "SELL" ? [{accountId: uid(32), methodCode: "BANK", maskedLabel: "****0032"}] : []})
const sell = ad(10, "SELL", "合成商家 · " + "长名称测试".repeat(8)), buy = ad(11, "BUY", "合成买入商家")
const ownAds = []
const orders = [
  {orderId: uid(20), market, buyerUserId: "1", sellerUserId: "9007199254740993", quantity: "1.25", fiatAmount: "8.3125", price: "6.65", buyerFeeUnits: "1250", buyerReceivesUnits: "124998750", paymentExpiresAt: null, terms: "合成订单条款\n" + "请核对实际到账。".repeat(20), status: "PAYMENT_PENDING"},
  {orderId: uid(21), market, buyerUserId: "9007199254740993", sellerUserId: "1", quantity: "2", fiatAmount: "13.3", price: "6.65", buyerFeeUnits: "2000", buyerReceivesUnits: "199998000", paymentExpiresAt: null, terms: "合成卖家订单", status: "PAID"},
  {orderId: uid(22), market, buyerUserId: "1", sellerUserId: "2", quantity: "1", fiatAmount: "6.65", price: "6.65", buyerFeeUnits: "0", buyerReceivesUnits: "100000000", paymentExpiresAt: null, terms: "合成到期订单", status: "PAYMENT_PENDING"},
]
const detail = row => {const server = Date.now() + 3600000; return {...row, serverTime: new Date(server).toISOString(), paymentExpiresAt: row.orderId === uid(22) ? new Date(server - 1000).toISOString() : new Date(server + 600000).toISOString(), payment: {holderName: "合成收款人", accountNumber: "synthetic-account-0032", bankName: "合成银行", methodCode: "BANK", fiat: "CNY"}, events: [], appeals: row.status === "APPEALED" ? [{appealId: uid(40), status: "OPEN", reason: "合成争议原因", decision: null, decisionReason: null, createdAt: iso}] : []}}
let badBondPolicy = false, failAds = true, failMe = true, badOrders = true, badQuote = false, quoteInvalid = false, quoteMs = 1400, quote,
  holdOffers = false, releaseOffers, holdCreate = false, releaseCreate, createStatus = 503, writeStatus = 200, holdWrite = false, releaseWrite, holdOrder = "", releaseOrder, original,
  receiptStatus = "UNKNOWN", receiptResult = null, receiptCode = null
const requests = [], checks = [], errors = [], nativeMessages = []
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), method = req.method(), p = url.pathname, owner = req.headers()["x-user-id"] || "1"
  requests.push({path: p, method, body: req.postData(), query: url.search})
  let status = 200, data = {}
  if (p === "/api/v1/c2c/status") data = {runtimeEnabled: true, businessEnabled: true, available: true, reason: ""}
  else if (p === "/api/v1/c2c/markets") data = {markets: [market], paymentMethods: methods}
  else if (p === "/api/v1/c2c/payment-accounts" && method === "GET") data = {items: owner === "1" ? accounts : []}
  else if (p === "/api/v1/c2c/me") {status = failMe ? 503 : 200; data = failMe ? {message: "Synthetic profile unavailable"} : {kycVerified: true, merchant: {status: "APPROVED", revision: "1", reviewReason: null}}}
  else if (p === "/api/v1/c2c/me/merchant-bond") data = {policy: badBondPolicy ? {configured: true, revision: "1"} : {configured: true, revision: "1", asset: "USDT", amount: "100"}, bond: {bondId: uid(90), requestId: uid(91), asset: "USDT", amount: "100", status: "LOCKED"}}
  else if (p === "/api/v1/c2c/me/ads") data = {items: ownAds}
  else if (p === "/api/v1/c2c/ads" && method === "GET") {
    const amount = url.searchParams.get("amount"), direction = url.searchParams.get("side")
    if (holdOffers && amount === "11") await new Promise(resolve => releaseOffers = resolve)
    status = failAds ? 503 : 200
    const item = direction === "SELL" ? buy : amount === "22" ? ad(12, "SELL", "当前筛选商家") : amount === "11" ? ad(13, "SELL", "过期筛选商家") : Number(url.searchParams.get("offset")) > 0 ? ad(14, "SELL", "第二页合成商家") : sell
    data = status === 200 ? {items: [item], hasMore: Number(url.searchParams.get("offset")) === 0, offset: Number(url.searchParams.get("offset"))} : {message: "Synthetic offers unavailable"}
  } else if (p === "/api/v1/c2c/ads" && method === "POST") {
    original = JSON.parse(req.postData()); if (holdCreate) await new Promise(resolve => releaseCreate = resolve)
    const payload = original.payload; ownAds.push({...sell, adId: uid(60), makerUserId: "1", status: "RESERVING", revision: "1", side: payload.side, price: payload.price, availableQuantity: payload.quantity, minFiat: payload.minFiat, maxFiat: payload.maxFiat, methodCodes: payload.methodCodes})
    receiptStatus = "SUCCEEDED"; receiptResult = uid(60); receiptCode = null; data = {status: receiptStatus}
  } else if (p.startsWith("/api/v1/c2c/ads/") && method === "GET") {const n = Number(p.split("/").at(-1).slice(-12)); data = n === 11 ? buy : ad(n, "SELL", n === 12 ? "当前筛选商家" : sell.merchant.nickname)}
  else if (p === "/api/v1/c2c/quotes" && method === "POST") {
    const body = JSON.parse(req.postData()), now = Date.now() + 3600000
    quote = {quoteId: uid(50), ownerUserId: badQuote ? "2" : "1", adId: body.adId, paymentAccountId: body.paymentAccountId, market, quantity: body.amount, fiatAmount: "6.65", price: "6.65", buyerFeeUnits: "0", buyerReceivesUnits: "100000000", serverTime: new Date(now).toISOString(), expiresAt: new Date(now + quoteMs).toISOString(), valid: true}; data = quote
  } else if (p.startsWith("/api/v1/c2c/quotes/")) data = {...quote, valid: !quoteInvalid}
  else if (p === "/api/v1/c2c/orders" && method === "GET") data = badOrders ? {} : {items: Number(url.searchParams.get("offset")) > 0 ? [] : orders.filter(row => row.orderId !== uid(23) && [row.buyerUserId, row.sellerUserId].includes(owner)), hasMore: Number(url.searchParams.get("offset")) === 0, offset: Number(url.searchParams.get("offset"))}
  else if (p === "/api/v1/c2c/orders" && method === "POST") {
    original = JSON.parse(req.postData()); if (holdCreate) await new Promise(resolve => releaseCreate = resolve)
    status = createStatus
    if (status === 200) {receiptStatus = "SUCCEEDED"; receiptResult = uid(23); if (!orders.some(row => row.orderId === uid(23))) orders.push({...orders[0], orderId: uid(23)}); data = {status: receiptStatus}}
    else data = {message: "Synthetic create outcome unknown"}
  } else if (p.startsWith("/api/v1/c2c/submissions/")) {
    if (method === "POST") {receiptStatus = "REJECTED"; receiptCode = "REQUEST_STOPPED"}
    const body = method === "POST" ? JSON.parse(req.postData()) : Object.fromEntries(url.searchParams)
    data = {ownerUserId: "1", requestKey: p.split("/")[5], kind: body.kind, requestHash: body.requestHash, status: receiptStatus, resultId: receiptResult, errorCode: receiptCode, message: receiptCode ? "原请求已停止" : null}
  } else if (p.startsWith("/api/v1/c2c/orders/")) {
    const parts = p.split("/"), target = orders.find(row => row.orderId === parts[5])
    if (method === "GET" && holdOrder === target.orderId) await new Promise(resolve => releaseOrder = resolve)
    if (method === "POST") {
      if (holdWrite) await new Promise(resolve => releaseWrite = resolve)
      status = writeStatus
      if (status === 200) target.status = {paid: "PAID", release: "RELEASE_PENDING", cancel: "CANCELED", appeal: "APPEALED"}[parts[6]]
    }
    data = status !== 200 ? {message: "Synthetic order outcome unknown"} : parts[6] === "appeal" ? {appealId: uid(40), order: detail(target)} : detail(target)
  } else if (p === "/api/v1/c2c/payment-accounts" && method === "POST") {
    const body = JSON.parse(req.postData()), row = {accountId: uid(33), methodCode: body.methodCode, fiat: body.fiat, maskedLabel: "****" + body.details.accountNumber.slice(-4), status: "PENDING", revision: "1"}; accounts.push(row); data = {...row, ownerUserId: "1"}
  } else if (p.endsWith("/verification/challenge")) data = {expiresAt: "2030-01-01T00:00:00Z"}
  else if (p === "/api/v1/c2c/conversations") {status = 503; data = {message: "Synthetic chat unavailable"}}
  else if (p === "/api/v1/announcements") data = {announcements: [], unreadCount: 0, limit: Number(url.searchParams.get("limit")), offset: Number(url.searchParams.get("offset")), hasMore: false}
  await route.fulfill({status, contentType: "application/json", body: JSON.stringify(data)})
})
await context.routeWebSocket(/\/ws\/v1/, ws => ws.onMessage(raw => {const f = JSON.parse(String(raw)); if (f.op === "authenticate") ws.send(JSON.stringify({op: "authenticated", id: f.id})); if (f.op === "ping") ws.send(JSON.stringify({op: "pong"}))}))
const page = await context.newPage()
page.on("pageerror", error => errors.push(error.message)); page.on("console", message => {if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text())})
let accept = false
page.on("dialog", dialog => {nativeMessages.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss()})
const tab = name => page.getByRole("navigation", {name: "C2C 功能", exact: true}).getByRole("button", {name, exact: true})
const trade = page.getByRole("region", {name: "确认交易", exact: true}), panel = page.getByRole("region", {name: "交易订单", exact: true})
const capture = name => page.screenshot({path: path.join(out, name + ".png")})
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow")
const until = async predicate => {for (let n = 0; n < 200; n++) {if (predicate()) return; await page.waitForTimeout(30)} throw Error("fixture was not reached")}
const writes = suffix => requests.filter(row => row.method === "POST" && row.path.endsWith(suffix))
const choose = async () => {await page.getByRole("button", {name: "购买", exact: true}).click(); await trade.getByLabel("交易数量", {exact: true}).fill("1")}
const getQuote = () => trade.getByRole("button", {name: "获取报价", exact: true}).click()
const openOrder = async n => {await tab("我的订单").click(); await page.locator("button.c2c-panel").filter({hasText: uid(n)}).click(); await panel.getByText(uid(n), {exact: true}).waitFor()}
let cdp
try {
  await page.goto("http://127.0.0.1:5183/c2c")
  await page.getByRole("button", {name: "重新查询广告", exact: true}).waitFor()
  assert.equal(await page.getByText("暂无符合条件的广告", {exact: true}).count(), 0)
  failAds = false; await page.getByRole("button", {name: "重新查询广告", exact: true}).click(); await page.getByRole("button", {name: "购买", exact: true}).waitFor()
  await capture("market-desktop-light")
  holdOffers = true; await page.getByLabel("法币金额筛选（CNY）", {exact: true}).fill("11"); await until(() => Boolean(releaseOffers))
  await page.getByLabel("法币金额筛选（CNY）", {exact: true}).fill("22"); await page.getByRole("heading", {name: "当前筛选商家", exact: true}).waitFor(); holdOffers = false; releaseOffers(); await page.waitForTimeout(100)
  assert.equal(await page.getByRole("heading", {name: "过期筛选商家", exact: true}).count(), 0)
  await page.getByLabel("法币金额筛选（CNY）", {exact: true}).fill(""); await page.getByRole("button", {name: "下一页", exact: true}).click(); await page.getByRole("heading", {name: "第二页合成商家", exact: true}).waitFor(); await page.getByRole("button", {name: "上一页", exact: true}).click()
  checks.push("offer failure never becomes empty; unrelated profile failure preserves market; filters cancel late responses and bounded ad pagination works")
  await choose(); badQuote = true; await getQuote(); await page.getByText("报价与当前广告或收款方式不匹配", {exact: true}).waitFor(); assert.equal(await trade.getByRole("button", {name: "确认下单", exact: true}).count(), 0)
  badQuote = false; await getQuote(); await trade.getByText("报价已到期，请重新获取报价后确认。", {exact: true}).waitFor(); assert(await trade.getByRole("button", {name: "确认下单", exact: true}).isDisabled())
  quoteMs = 120000; await getQuote(); quoteInvalid = true; accept = true; await trade.getByRole("button", {name: "确认下单", exact: true}).click(); await page.getByText("报价或收款方式已变更，请重新获取报价", {exact: true}).waitFor(); assert.equal(writes("/orders").length, 0)
  quoteInvalid = false; await getQuote(); await trade.getByRole("button", {name: "确认下单", exact: true}).click(); await page.getByRole("button", {name: "查询原请求", exact: true}).waitFor()
  const persisted = await page.evaluate(() => JSON.parse(sessionStorage.getItem("surprising.c2c.trade.1")))
  assert.equal(persisted.body.quoteId, uid(50)); assert(!JSON.stringify(persisted).includes("verification")); assert.equal(writes("/orders").length, 1)
  await page.getByRole("button", {name: "查询原请求", exact: true}).click(); await page.getByRole("button", {name: "按原请求重试", exact: true}).waitFor(); assert.equal(writes("/orders").length, 1)
  accept = false; await page.getByRole("button", {name: "停止未开始的请求", exact: true}).click(); assert.equal(writes("/stop").length, 0); assert.equal(await page.getByText("已查询并停止尚未开始的原请求", {exact: true}).count(), 0)
  accept = true; await page.getByRole("button", {name: "停止未开始的请求", exact: true}).click(); await page.getByRole("button", {name: "查询原请求", exact: true}).waitFor({state: "hidden"})
  checks.push("quote identity, monotonic expiry and pre-submit validity are checked; unknown create persists one original identity; receipt reads never resend and explicit stop clears only confirmed original")
  await getQuote(); createStatus = 200; holdCreate = true; const beforeCreateConfirms = nativeMessages.length; await trade.getByRole("button", {name: "确认下单", exact: true}).evaluate(el => {el.click(); el.click()}); await until(() => Boolean(releaseCreate))
  assert(await tab("我的订单").isDisabled()); assert.equal(nativeMessages.length - beforeCreateConfirms, 1); assert.equal(writes("/orders").length, 2); holdCreate = false; releaseCreate()
  await panel.getByText(uid(23), {exact: true}).waitFor(); await panel.getByRole("heading", {name: "待付款", exact: true}).waitFor(); assert.equal(await page.evaluate(() => sessionStorage.getItem("surprising.c2c.trade.1")), null)
  await panel.getByRole("button", {name: "返回列表", exact: true}).click()
  badOrders = false; failMe = false; await page.getByRole("button", {name: "刷新状态", exact: true}).click()
  await openOrder(20); await panel.getByRole("button", {name: "查看订单收款资料", exact: true}).click(); await panel.getByText("synthetic-account-0032", {exact: true}).waitFor()
  accept = false; await panel.getByRole("button", {name: "取消未付款订单", exact: true}).click(); assert.equal(writes("/cancel").length, 0)
  accept = true; holdWrite = true; await panel.getByRole("button", {name: "我已付款，通知卖家", exact: true}).evaluate(el => {el.click(); el.click()}); await until(() => Boolean(releaseWrite)); assert.equal(writes("/paid").length, 1); assert.equal(nativeMessages.filter(message => message.startsWith("确认已经实际完成付款并通知卖家")).length, 1); assert(await panel.getByRole("button", {name: "返回列表", exact: true}).isDisabled()); holdWrite = false; releaseWrite()
  await panel.getByRole("heading", {name: "已付款，待放币", exact: true}).waitFor(); assert.equal(await panel.getByRole("button", {name: "取消未付款订单", exact: true}).count(), 0)
  await panel.getByLabel("取消或申诉原因", {exact: true}).fill("合成争议原因"); await panel.getByRole("button", {name: "提交申诉", exact: true}).click(); await panel.getByRole("heading", {name: "申诉中", exact: true}).waitFor(); await panel.locator("summary").click(); await panel.getByText("合成争议原因", {exact: true}).waitFor()
  await capture("buyer-appeal-desktop-light")
  checks.push("one create opens exact receipt order even outside current list; payment snapshot, cancellation confirmation, one paid request and appeal refresh use original targets")
  await panel.getByRole("button", {name: "返回列表", exact: true}).click(); await openOrder(21); await panel.getByRole("heading", {name: "已付款，待放币", exact: true}).waitFor()
  assert(await panel.getByRole("button", {name: "确认到账并放币", exact: true}).isDisabled())
  await panel.getByRole("checkbox", {name: "已核对本订单款项实际到账", exact: true}).check(); await panel.getByLabel("邮箱验证码", {exact: true}).fill("123456"); writeStatus = 503
  await panel.getByRole("button", {name: "确认到账并放币", exact: true}).click(); await panel.getByText("操作结果需要重新核对，请读取原订单，不要重复提交。", {exact: true}).waitFor()
  writeStatus = 200; await panel.getByRole("button", {name: "重新读取订单", exact: true}).click(); await panel.getByRole("checkbox", {name: "已核对本订单款项实际到账", exact: true}).waitFor(); assert.equal(await panel.getByLabel("邮箱验证码", {exact: true}).inputValue(), "")
  await panel.getByRole("checkbox", {name: "已核对本订单款项实际到账", exact: true}).check(); await panel.getByRole("button", {name: "确认到账并放币", exact: true}).click(); await panel.getByRole("heading", {name: "放币处理中", exact: true}).waitFor()
  await panel.getByRole("button", {name: "返回列表", exact: true}).click(); await openOrder(22); await panel.getByText("付款窗口已结束，勿继续转账；请刷新核对订单终态，已付款争议可发起申诉。", {exact: true}).waitFor(); assert(await panel.getByRole("button", {name: "我已付款，通知卖家", exact: true}).isDisabled()); assert(await panel.getByRole("heading", {name: "待付款", exact: true}).isVisible())
  await panel.getByRole("button", {name: "进入订单消息", exact: true}).click(); await page.getByText("订单消息暂不可用，请稍后重试。", {exact: true}).waitFor(); assert.equal(JSON.parse(writes("/conversations")[0].body).orderId, uid(22))
  checks.push("release requires explicit actual-receipt check; failure hides stale actions and clears codes; cached verification remains supported; payment-window expiry does not invent an order terminal; chat errors remain recoverable")
  await panel.getByRole("button", {name: "返回列表", exact: true}).click(); await tab("收款账户").click()
  await page.getByRole("navigation", {name: "收款账户分页", exact: true}).getByRole("button", {name: "下一页", exact: true}).click(); await page.getByText("****0106", {exact: false}).first().waitFor(); await page.getByRole("navigation", {name: "收款账户分页", exact: true}).getByRole("button", {name: "上一页", exact: true}).click()
  const form = page.locator("form").filter({has: page.getByRole("heading", {name: "添加实名收款账户", exact: true})})
  await form.getByLabel("本人姓名", {exact: true}).fill("合成实名"); await form.getByLabel("收款账号", {exact: true}).fill("synthetic-5566"); await form.getByRole("button", {name: "提交实名收款审核", exact: true}).click(); await page.getByText("该收款方式需要填写开户银行。", {exact: true}).waitFor(); assert.equal(writes("/payment-accounts").length, 0)
  await form.getByLabel("开户银行（银行卡必填）", {exact: true}).fill("合成银行"); await form.getByRole("button", {name: "提交实名收款审核", exact: true}).evaluate(el => {el.click(); el.click()}); await page.getByText("收款资料已提交，审核通过后可使用", {exact: true}).waitFor(); assert.equal(writes("/payment-accounts").length, 1); assert.equal(await form.getByLabel("本人姓名", {exact: true}).inputValue(), "")
  await tab("自选交易").click(); await page.getByRole("button", {name: "我要卖", exact: true}).click(); await page.getByRole("button", {name: "出售", exact: true}).click(); assert.equal(await trade.getByLabel("收款方式", {exact: true}).inputValue(), uid(31))
  checks.push("payment form enforces matching field lengths/bank requirements and one submit; sell default chooses an approved account accepted by the ad method")
  badBondPolicy = true; await tab("商家中心").click(); await page.getByRole("button", {name: "刷新状态", exact: true}).click(); await page.getByText("当前业务资料暂不可用，请刷新后继续。", {exact: true}).waitFor(); assert.equal(await page.getByRole("button", {name: "确认发布广告", exact: true}).count(), 0); badBondPolicy = false; await page.getByRole("button", {name: "刷新状态", exact: true}).click()
  const publish = page.locator("form").filter({has: page.getByRole("heading", {name: "发布广告", exact: true})})
  await publish.getByLabel("单价", {exact: true}).fill("6.65"); await publish.getByLabel("总数量", {exact: true}).fill("3"); await publish.getByLabel("单笔最低法币金额", {exact: true}).fill("1"); await publish.getByLabel("单笔最高法币金额", {exact: true}).fill("19.95"); await publish.getByRole("combobox", {name: "收款账户", exact: true}).selectOption(uid(31)); await publish.getByLabel("邮箱验证码", {exact: true}).fill("123456")
  holdCreate = true; releaseCreate = undefined; await publish.getByRole("button", {name: "确认发布广告", exact: true}).evaluate(el => {el.click(); el.click()}); await until(() => Boolean(releaseCreate))
  const adOriginal = await page.evaluate(() => JSON.parse(sessionStorage.getItem("surprising.c2c.trade.1"))); assert.equal(adOriginal.kind, "AD_PUBLISH"); assert(!JSON.stringify(adOriginal).includes("verification")); assert.deepEqual(adOriginal.body.payload.paymentAccountIds, [uid(31)]); assert.equal(writes("/ads").length, 1)
  holdCreate = false; releaseCreate(); await page.getByText(/资金确认中/).first().waitFor(); assert.equal(await page.evaluate(() => sessionStorage.getItem("surprising.c2c.trade.1")), null); await page.evaluate(() => window.scrollTo(0, 0)); await capture("merchant-publish-desktop-light")
  checks.push("approved merchant publishing retains one exact ad payload/request identity without storing codes; accepted receipt shows reserving state rather than inventing active funds")
  for (const width of [390, 320]) {await page.setViewportSize({width, height: 844}); await fit(); await capture("market-mobile-" + width); await tab("我的订单").click(); await fit(); await capture("orders-mobile-" + width); await tab("收款账户").click(); await fit(); await capture("accounts-mobile-" + width); await tab("商家中心").click(); await fit(); await capture("merchant-mobile-" + width); await tab("自选交易").click()}
  await page.getByRole("button", {name: "Use dark theme", exact: true}).click(); await fit(); await capture("market-mobile-dark"); await openOrder(22); await panel.getByRole("heading", {name: "待付款", exact: true}).waitFor(); await fit(); await capture("order-mobile-dark")
  await page.setViewportSize({width: 1440, height: 1000}); await fit(); await capture("order-desktop-dark")
  await page.evaluate(value => {localStorage.setItem("surprising-ex.session", JSON.stringify(value)); window.dispatchEvent(new Event("surprising-ex.session-changed"))}, {...session, user: {...session.user, userId: "2"}})
  await page.getByRole("button", {name: "购买", exact: true}).waitFor(); assert.equal(await panel.count(), 0)
  await page.evaluate(() => sessionStorage.setItem("surprising.c2c.trade.2", "{broken-json")); await page.reload()
  await page.getByRole("button", {name: "重新读取本地请求", exact: true}).waitFor(); assert(await page.getByRole("button", {name: "购买", exact: true}).isDisabled())
  await page.evaluate(() => sessionStorage.removeItem("surprising.c2c.trade.2")); await page.getByRole("button", {name: "重新读取本地请求", exact: true}).click(); assert(await page.getByRole("button", {name: "购买", exact: true}).isEnabled())
  checks.push("owner transition removes old order details; corrupt original request blocks new creation without crashing and explicit storage re-read restores operations")
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage")
  const fields = ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration"], samples = []
  for (let n = 0; n < 7; n++) {const result = await cdp.send("Performance.getMetrics"); samples.push(Object.fromEntries(result.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value]))); if (n < 6) await page.waitForTimeout(10000)}
  await cdp.send("HeapProfiler.collectGarbage"); const retained = await cdp.send("Performance.getMetrics")
  assert.deepEqual(errors, []); checks.push("1440/390/320, light/dark, long text, repeated tabs and 60-second runtime observation")
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({checks, errors, nativeMessages, samples, retained: Object.fromEntries(retained.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value])), browser: browser.version(), fixtureOnly: true}, null, 2)); console.log(JSON.stringify({checks, errors, out}))
} catch (error) {await capture("client-failure"); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({error: String(error), checks, errors, body: await page.locator("body").innerText()}, null, 2)); throw error}
finally {if (cdp) await cdp.detach(); await context.close(); await browser.close()}
