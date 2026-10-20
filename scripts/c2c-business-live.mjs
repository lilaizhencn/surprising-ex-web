// 本机专用：真实交易鉴权、PostgreSQL、Core 与 realtime。只读指定 owner 的私有测试会话。
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
const { chromium } = await import(process.env.C2C_PLAYWRIGHT_MODULE || "playwright")
const root = process.env.C2C_LIVE_QA_ROOT
if (!/^\/(?:private\/)?tmp\/surprising-c2c-\d{8}_\d{6}\/live$/.test(root || "")) throw Error("需要本轮独立本机 C2C 运行目录")
const owner = JSON.parse(await readFile(`${root}/../owner.json`, "utf8"))
assert.equal(owner.purpose, "C2C authenticated HTTP, settlement lifecycle, security and admin integration")
const processes = JSON.parse(await readFile(`${root}/processes.json`, "utf8"))
const command = execFileSync("ps", ["-p", String(processes.gateway.pid), "-o", "command="], {encoding:"utf8"})
assert(command.includes(root) && command.includes("gateway"), "Gateway must belong to this local runtime")
assert(execFileSync("lsof", ["-nP", "-t", "-iTCP:9094", "-sTCP:LISTEN"], {encoding:"utf8"}).split(/\s+/).includes(String(processes.gateway.pid)))
const fixture = JSON.parse(await readFile(`${root}/private-fixture.json`, "utf8"))
const evidence = { scope: "真实本地交易鉴权、Core 资金及 realtime；合成 KYC、验证码与站外法币付款", steps: [], errors: [], orders: [], passed: false }
const browser = await chromium.launch({ headless: true, ...(process.env.C2C_CHROMIUM_EXECUTABLE ? { executablePath: process.env.C2C_CHROMIUM_EXECUTABLE } : {}) })
const contexts = [], pages = {}, socketMetrics = {}
function step(message) { evidence.steps.push(message); console.log("PASS", message) }
let stage = "start"
async function api(role, method, path, body, expected = 200, extra = {}) {
  assert(path.startsWith("/api/v1/"))
  const response = await fetch(`http://127.0.0.1:9094${path}`, { method, headers: { "Content-Type": "application/json", "X-Product-Line": "SPOT", Authorization: `Bearer ${fixture.users[role].accessToken}`, ...extra }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) })
  const result = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(result)}`)
  return result
}
function responseFor(page, predicate) { const pending = page.waitForResponse(predicate); void pending.catch(() => {}); return pending }
async function wait(read, test, label, seconds = 30) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) { const value = await read(); if (test(value)) return value; await new Promise((resolve) => setTimeout(resolve, 250)) }
  throw Error(`超时：${label}`)
}
async function open(role, admin = false, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1050 } }); contexts.push(context)
  await context.addInitScript(({ session, admin }) => { localStorage.setItem(admin ? "surprising-admin.session" : "surprising-ex.session", JSON.stringify(session)); localStorage.setItem("surprising-ex.language", "zh") }, { session: fixture.users[role], admin })
  const page = await context.newPage(); page.setDefaultTimeout(12000); pages[role] = page
  const active = new Set(), metrics = { opened:0, frames:[] }
  socketMetrics[role] = metrics
  page.on("websocket", (socket) => {
    if(new URL(socket.url()).pathname !== "/ws/v1") return
    const id = ++metrics.opened; active.add(id)
    socket.on("close", () => active.delete(id))
    socket.on("framereceived", ({payload}) => {
      try { const frame=JSON.parse(payload); if(metrics.frames.length<100) metrics.frames.push({socket:id,op:frame.op,channel:frame.channel}) } catch {}
    })
  })
  page.on("pageerror", (failure) => evidence.errors.push({ role, stage, message: failure.message }))
  page.on("dialog", (dialog) => dialog.accept())
  await page.goto(`http://127.0.0.1:${admin ? 5174 : 5173}${admin ? "/" : "/c2c"}`)
  if (admin) await page.getByRole("button", { name: /C2C (订单会话|运营)/ }).click()
  else await page.getByRole("button", { name: "商家中心", exact: true }).waitFor()
  return page
}
async function approvalFor(path, method, raw) {
  const request = await api("admin", "POST", "/api/v1/admin/approvals", { service: "c2c", httpMethod: method, requestPath: path, queryString: null, requestBodySha256: raw ? createHash("sha256").update(raw).digest("hex") : null, reason: "本地商家买卖验收，核对原对象和资金" })
  await api("reviewer", "POST", `/api/v1/admin/approvals/${request.approvalId}/approve`, { reason: "另一管理员已核对本地合成场景和固定收款方" })
  return String(request.approvalId)
}
async function adminClick(page, button, path, method = "POST") {
  const response = responseFor(page, (r) => new URL(r.url()).pathname === path && r.request().method() === method && r.status() === 403)
  await button.click()
  const rejected = await response
  const raw = rejected.request().postData() || undefined
  const id = await approvalFor(path, method, raw)
  await page.getByLabel("审批单 ID", { exact: true }).fill(id)
  const completed = responseFor(page, (r) => new URL(r.url()).pathname === path && r.request().method() === method && r.status() === 200)
  await page.getByRole("button", { name: "继续", exact: true }).click()
  await completed
}
async function challenge(page) {
  const response = responseFor(page, (r) => r.url().includes("/security/verification/challenge") && r.request().method() === "POST")
  await page.getByRole("button", { name: "获取资金验证码", exact: true }).first().click(); const checked = await response; assert.equal(checked.status(), 200, await checked.text())
  await page.getByLabel("邮箱验证码", { exact: true }).first().fill("123456")
}
async function assertNoOverflow(page, label) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} horizontal overflow`)
}
async function publish(page, side, quantity) {
  const current = await api("seller", "GET", "/api/v1/c2c/me/ads")
  const ready = current.items.find((row) => row.side === side && row.status === "ACTIVE" && row.terms === "本地商家买卖真实 Core 验收")
  if (ready) return ready
  await page.getByRole("button", { name: "商家中心", exact: true }).click()
  await wait(() => api("seller", "GET", "/api/v1/c2c/me"), (v) => v.merchant?.status === "APPROVED", "merchant approval")
  const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "发布广告", exact: true }) })
  await form.getByLabel("广告方向").selectOption(side)
  await form.getByLabel("单价", { exact: true }).fill("6.65")
  await form.getByLabel("总数量", { exact: true }).fill(quantity)
  await form.getByLabel("单笔最低法币金额").fill("1")
  await form.getByLabel("单笔最高法币金额").fill("10000")
  if (side === "SELL") await form.getByLabel("收款账户", { exact: true }).selectOption(fixture.sellerAccount)
  await form.getByLabel("交易条款").fill("本地商家买卖真实 Core 验收")
  await challenge(page)
  const response = responseFor(page, (r) => new URL(r.url()).pathname === "/api/v1/c2c/ads" && r.request().method() === "POST")
  await form.getByRole("button", { name: "确认发布广告", exact: true }).click()
  const result = await (await response).json(); assert.equal(result.status, "SUCCEEDED", JSON.stringify(result))
  const ad = await wait(() => api("seller", "GET", "/api/v1/c2c/me/ads"), (v) => v.items.some((a) => a.adId === result.resultId && a.status === "ACTIVE"), "ad Core reserve")
  return ad.items.find((a) => a.adId === result.resultId)
}
async function createOrder(page, role, side, lostResponse = false) {
  await page.getByRole("button", { name: "自选交易", exact: true }).click()
  await page.getByRole("button", { name: side === "BUY" ? "我要买" : "我要卖", exact: true }).click()
  await page.getByRole("button", { name: side === "BUY" ? "购买" : "出售", exact: true }).first().click()
  const region = page.getByRole("region", { name: "确认交易", exact: true })
  await region.getByLabel("交易数量").fill("1")
  await region.getByRole("button", { name: "获取报价", exact: true }).click()
  await region.getByRole("button", { name: "确认下单", exact: true }).waitFor()
  if (side === "SELL") await challenge(page)
  let committed, writes = 0
  if (lostResponse) await page.route("**/api/v1/c2c/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    writes++; const response = await route.fetch(); committed = await response.json(); await route.abort("failed")
  })
  if (lostResponse) {
    await region.getByRole("button", { name: "确认下单", exact: true }).click()
    await page.getByRole("button", { name: "查询原请求", exact: true }).waitFor()
    await wait(async () => committed, (v) => !!v?.resultId, "committed unknown response")
    await page.getByRole("button", { name: "查询原请求", exact: true }).click()
    await page.getByRole("region", { name: "确认交易", exact: true }).waitFor({ state: "detached" })
    assert.equal(writes, 1); await page.unroute("**/api/v1/c2c/orders")
    step("已提交订单丢失响应后查询原回执，未产生第二次下单 POST")
  } else {
    const response = responseFor(page, (r) => new URL(r.url()).pathname === "/api/v1/c2c/orders" && r.request().method() === "POST")
    await region.getByRole("button", { name: "确认下单", exact: true }).click(); committed = await (await response).json()
  }
  assert.equal(committed.status, "SUCCEEDED", JSON.stringify(committed)); const id = committed.resultId
  evidence.orders.push(id)
  await wait(() => api(role, "GET", `/api/v1/c2c/orders/${id}`), (v) => v.status === "PAYMENT_PENDING", "Core order reservation")
  return id
}
async function selectOrder(page, id) {
  await page.getByRole("button", { name: "我的订单", exact: true }).click()
  await page.getByRole("button").filter({ hasText: id }).first().click()
}
try {
  stage = "merchant deposit"
  const merchant = await open("seller"), admin = await open("admin", true)
  await merchant.getByRole("button", { name: "商家中心", exact: true }).click()
  const initial = await api("seller", "GET", "/api/v1/c2c/me/merchant-bond")
  if (!initial.bond || ["FAILED", "RETURNED"].includes(initial.bond.status)) {
    await challenge(merchant)
    const response = responseFor(merchant, (r) => r.url().endsWith("/api/v1/c2c/me/merchant-bond") && r.request().method() === "POST")
    await merchant.getByRole("button", { name: "确认质押", exact: true }).click(); assert.equal((await response).status(), 200)
  }
  await wait(() => api("seller", "GET", "/api/v1/c2c/me/merchant-bond"), (v) => v.bond?.status === "LOCKED", "real Core merchant bond")
  step("商家在页面确认质押，真实 Core 扣减后显示 LOCKED")
  stage = "merchant review"
  const profile = await api("seller", "GET", "/api/v1/c2c/me")
  if (profile.merchant.status !== "APPROVED") {
    await admin.getByRole("button", { name: "刷新", exact: true }).first().click()
    const row = admin.getByRole("row").filter({ hasText: fixture.users.seller.user.userId.toString() }).filter({ hasText: "Synthetic merchant" })
    await row.getByRole("button", { name: "处理", exact: true }).click()
    await admin.getByLabel("处理原因").fill("本地核对商家认证与已到账质押")
    await adminClick(admin, admin.getByRole("button", { name: "核实后通过", exact: true }), `/api/v1/admin/c2c/merchants/${fixture.users.seller.user.userId}/review`)
  }
  step("后台按原请求经另一管理员审批后通过商家审核")
  stage = "market initialization"
  await admin.getByRole("button", { name: "经营配置", exact: true }).click()
  const config = await api("admin", "GET", "/api/v1/admin/c2c/configuration")
  if (!config.enabled) {
    await adminClick(admin, admin.getByRole("button", { name: "初始化内部账户（零金额）", exact: true }), "/api/v1/admin/c2c/initialization")
    await wait(() => api("admin", "GET", "/api/v1/admin/c2c/reconciliation"), (v) => v.status === "MATCHED", "private account reconciliation")
    await admin.getByLabel("本次配置原因").fill("本地资金核对一致后开放 C2C 市场")
    await adminClick(admin, admin.getByRole("button", { name: "核对后开放交易", exact: true }), "/api/v1/admin/c2c/configuration", "PUT")
  }
  stage = "merchant sell ad"
  await merchant.getByRole("button", { name: "刷新状态", exact: true }).click()
  const sellAd = await publish(merchant, "SELL", "20"); fixture.browserSellAd = sellAd.adId
  step("商家发布出售广告，真实托管确认后上架")
  stage = "buyer order"
  const buyer = await open("buyer")
  const order = await createOrder(buyer, "buyer", "BUY", true)
  stage = "buyer payment"
  await buyer.getByRole("button", { name: "查看订单收款资料", exact: true }).click()
  await buyer.getByText(/qa-synthetic-seller/).waitFor()
  await buyer.getByRole("button", { name: "我已付款，通知卖家", exact: true }).click()
  await wait(() => api("buyer", "GET", `/api/v1/c2c/orders/${order}`), (v) => v.status === "PAID", "payment confirmation without fund release")
  stage = "seller release"
  await selectOrder(merchant, order); await merchant.getByRole("button", { name: "确认到账并放币", exact: true }).waitFor()
  await challenge(merchant); await merchant.getByRole("button", { name: "确认到账并放币", exact: true }).click()
  await wait(() => api("buyer", "GET", `/api/v1/c2c/orders/${order}`), (v) => v.status === "COMPLETED", "real Core release")
  step("买家读取订单收款快照、确认已付款，卖家核实后通过安全验证放币，Core 完成净额和手续费")
  stage = "order chat on shared market connection"
  await buyer.getByRole("button",{name:"进入订单消息",exact:true}).click()
  await merchant.getByRole("button",{name:"进入订单消息",exact:true}).click()
  await buyer.getByRole("textbox",{name:"消息",exact:true}).waitFor()
  await merchant.getByRole("textbox",{name:"消息",exact:true}).waitFor()
  await buyer.evaluate(async ({token,instrument})=>{
    const {acquireRealtimeConnections}=await import("/src/sharedRealtimeConnections.ts")
    const {config}=await import("/src/lib/config.ts")
    window.__c2cMarket=acquireRealtimeConnections(config.wsBaseUrlForProductLine,token,()=>{},()=>{})
    window.__c2cMarket.update([{channel:"trades",productLine:"SPOT",instrumentId:instrument}])
  },{token:fixture.users.buyer.accessToken,instrument:String(fixture.instrument.instrumentId)})
  const text=`本地真实订单沟通 ${Date.now()}`
  await buyer.getByRole("textbox",{name:"消息",exact:true}).fill(text)
  await buyer.getByRole("button",{name:"发送",exact:true}).click()
  await merchant.locator(".c2c-timeline").getByText(text,{exact:true}).waitFor()
  await wait(async()=>socketMetrics.buyer.frames,(frames)=>frames.some((f)=>f.channel==="trades") && frames.some((f)=>f.channel==="c2c.messages"),"real shared market and chat frames")
  const frames=socketMetrics.buyer.frames
  assert(frames.some((a)=>a.channel==="trades" && frames.some((b)=>b.channel==="c2c.messages" && b.socket===a.socket)))
  await buyer.evaluate(()=>window.__c2cMarket.close())
  await api("other","POST","/api/v1/c2c/conversations",{orderId:order},403)
  step("原订单直接进入会话，真实鉴权的聊天和行情帧来自同一条 WebSocket；第三方无法加入")
  await buyer.screenshot({path:`${root}/business-shared-chat.png`,fullPage:true})
  stage = "merchant buy ad"
  const buyAd = await publish(merchant, "BUY", "20"); fixture.browserBuyAd = buyAd.adId
  stage = "user sells"
  const seller = await open("other", false, 390)
  const reverse = await createOrder(seller, "other", "SELL")
  await selectOrder(merchant, reverse); await merchant.getByRole("button", { name: "我已付款，通知卖家", exact: true }).click()
  await selectOrder(seller, reverse); await seller.getByRole("button", { name: "确认到账并放币", exact: true }).waitFor()
  await challenge(seller); await seller.getByRole("button", { name: "确认到账并放币", exact: true }).click()
  await wait(() => api("other", "GET", `/api/v1/c2c/orders/${reverse}`), (v) => v.status === "COMPLETED", "reverse Core release")
  step("390 宽度卖家向商家买入广告出售，商家确认付款，卖家验证后放币")
  stage = "customer payment account and audited approval"
  await buyer.getByRole("button",{name:"收款账户",exact:true}).click()
  if (!fixture.browserPaymentAccountId) {
    const form=buyer.locator("form").filter({has:buyer.getByRole("heading",{name:"添加实名收款账户",exact:true})})
    await form.getByLabel("本人姓名",{exact:true}).fill("QA local buyer")
    await form.getByLabel("收款账号",{exact:true}).fill("qa-local-buyer-reviewed")
    const challengeResponse=responseFor(buyer,(r)=>r.url().includes("/security/verification/challenge") && r.request().method()==="POST")
    await form.getByRole("button",{name:"获取设置验证码",exact:true}).click()
    assert.equal((await challengeResponse).status(),200)
    await form.getByLabel("邮箱验证码",{exact:true}).fill("123456")
    const saved=responseFor(buyer,(r)=>new URL(r.url()).pathname==="/api/v1/c2c/payment-accounts" && r.request().method()==="POST")
    await form.getByRole("button",{name:"提交实名收款审核",exact:true}).click()
    const response=await saved;assert.equal(response.status(),200)
    fixture.browserPaymentAccountId=(await response.json()).accountId
    await writeFile(`${root}/private-fixture.json`,JSON.stringify(fixture,null,2),{mode:0o600})
  }
  const paymentId=fixture.browserPaymentAccountId
  const account=await api("buyer","GET",`/api/v1/c2c/payment-accounts/${paymentId}`)
  if(account.status!=="APPROVED") {
    await admin.getByRole("button",{name:"收款审核",exact:true}).click()
    const row=admin.getByRole("row").filter({hasText:paymentId})
    await row.getByRole("button",{name:"处理",exact:true}).click()
    await admin.getByRole("button",{name:"审计后查阅实名收款资料",exact:true}).click()
    await admin.getByText("qa-local-buyer-reviewed",{exact:true}).waitFor()
    await admin.getByLabel("已核对收款实名与有效身份认证资料").check()
    await admin.getByLabel("处理原因",{exact:true}).fill("本地合成身份资料与收款实名已人工核对")
    await adminClick(admin,admin.getByRole("button",{name:"核实后通过",exact:true}),`/api/v1/admin/c2c/payment-accounts/${paymentId}/review`)
  }
  assert.equal((await api("buyer","GET",`/api/v1/c2c/payment-accounts/${paymentId}`)).status,"APPROVED")
  step("用户新增实名收款账户，后台审计查阅、人工核验和另一管理员审批后通过")
  evidence.sockets=socketMetrics
  for (const [role, page] of Object.entries(pages)) { await assertNoOverflow(page, role); await page.screenshot({ path: `${root}/business-${role}.png`, fullPage: true }) }
  await writeFile(`${root}/private-fixture.json`, JSON.stringify(fixture, null, 2), { mode: 0o600 })
  assert.deepEqual(evidence.errors, []); evidence.passed = true
} catch (failure) {
  evidence.failure = { stage, message: failure.message }
  for (const [role, page] of Object.entries(pages)) await page.screenshot({ path: `${root}/business-failure-${role}.png`, fullPage: true, timeout: 3000 }).catch(() => {})
  throw failure
} finally {
  await writeFile(`${root}/business-browser-evidence.json`, JSON.stringify(evidence, null, 2))
  for (const context of contexts) await context.close(); await browser.close()
  console.log(JSON.stringify(evidence, null, 2))
}
