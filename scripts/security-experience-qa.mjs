// Synthetic account/security contracts only. No real passwords, API keys or device changes.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-security-client"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const iso = "2026-10-26T10:00:00Z", keyId = "sx_" + "a".repeat(32), deviceId = "11111111-1111-4111-8111-111111111111"
const secret = "synthetic-secret-for-isolated-ui-test-only"
const session = { accessToken: "security-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: { userId: "1", username: "fixture", status: "ACTIVE", roles: ["USER"], createdAt: iso } }
await context.addInitScript(value => {
  if (!sessionStorage.securityQaInitialized) { localStorage.setItem("surprising-ex.session", JSON.stringify(value)); localStorage.setItem("surprising-ex.language", "en"); sessionStorage.securityQaInitialized = "yes" }
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { if (window.__denyCopy) throw new Error("synthetic clipboard failure"); window.__copiedSecret = value } } })
}, session)
const key = { apiKey: keyId, label: "Synthetic read key", permissions: "READ", status: "ACTIVE", ipAllowlist: [], createdAt: iso, lastUsedAt: null, revokedAt: null }
let keys = [key], malformedKeys = true, mfaMalformed = false, failIps = true, createMode = "success", writeStatus = 200,
  holdSend = false, releaseSend, holdCreate = false, releaseCreate, holdList = false, releaseList, sequence = 1
const devices = [
  { sessionId: "1", deviceId, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", ipAddress: "198.51.100.1", lastSeen: iso, active: true, current: true, blocked: false },
  { sessionId: "9007199254740993", deviceId: null, userAgent: "Mozilla/5.0 (Windows NT 10)", ipAddress: "203.0.113.9", lastSeen: iso, active: true, current: false, blocked: false },
  { sessionId: "3", deviceId: "22222222-2222-4222-8222-222222222222", userAgent: "Mozilla/5.0 (Android)", ipAddress: "203.0.113.10", lastSeen: iso, active: true, current: false, blocked: false },
]
const ips = ["198.51.100.1", "203.0.113.9", "203.0.113.10"].map(ipAddress => ({ ipAddress, loginCount: "9007199254740993", lastSeen: iso, blocked: false }))
const scenes = ["LOGIN", "CHANGE_PASSWORD", "SECURITY_SETTINGS", "WITHDRAWAL", "API_WITHDRAWAL", "WHITELIST", "LARGE_TRANSFER", "TRANSFER"].map(sceneCode => ({ sceneCode, label: sceneCode, enabled: sceneCode !== "TRANSFER" }))
const requests = [], checks = [], errors = []
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), method = req.method(), owner = req.headers()["x-user-id"] || "guest"
  requests.push({ path: url.pathname, method, body: req.postData(), headers: req.headers(), owner })
  let status = 200, data = {}
  if (url.pathname === "/api/v1/security/api-keys") {
    if (method === "GET") {
      if (holdList && owner === "1") await new Promise(resolve => releaseList = resolve)
      data = malformedKeys ? {} : owner === "2" ? [{ ...key, apiKey: "sx_" + "z".repeat(32), label: "Owner 2 read key" }] : keys
    } else {
      status = writeStatus
      const body = JSON.parse(req.postData())
      if (method === "POST") {
        if (holdCreate) await new Promise(resolve => releaseCreate = resolve)
        const created = { ...key, apiKey: "sx_" + String(sequence++).repeat(32), label: body.label, permissions: body.permissions.join(","), ipAllowlist: body.ipAllowlist }
        if (status === 200) keys.push(created)
        data = status !== 200 ? {} : createMode === "malformed" ? { apiKey: null, secret } : { apiKey: created, secret }
      } else {
        if (status === 200) { const row = keys.find(row => row.apiKey === body.apiKey); if (method === "DELETE") { row.status = "REVOKED"; row.revokedAt = iso } else row.ipAllowlist = body.ipAllowlist }
        data = null
      }
    }
  } else if (url.pathname === "/api/v1/security/mfa") data = mfaMalformed ? {} : { enabled: true, verifiedAt: iso, withdrawalsRestrictedUntil: null }
  else if (url.pathname.endsWith("/verification/challenge")) {
    if (holdSend) await new Promise(resolve => releaseSend = resolve)
    data = { expiresAt: "2030-01-01T00:00:00Z" }
  } else if (url.pathname === "/api/v1/security/devices") data = devices
  else if (url.pathname === "/api/v1/security/ips") { status = failIps ? 503 : 200; data = failIps ? {} : ips }
  else if (url.pathname.endsWith("/revoke") && url.pathname.includes("/sessions/")) { devices[1].active = false; data = { revoked: 1 } }
  else if (url.pathname.includes("/devices/") && method === "POST") {
    const id = url.pathname.split("/").at(-2), row = devices.find(row => row.deviceId === id)
    row.blocked = url.pathname.endsWith("/block"); data = null
  } else if (url.pathname === "/api/v1/security/scenes") data = scenes
  else if (url.pathname.includes("/scenes/")) {
    status = writeStatus
    const body = JSON.parse(req.postData()), scene = scenes.find(row => row.sceneCode === url.pathname.split("/").at(-1))
    if (status === 200) scene.enabled = body.enabled
    data = status === 200 ? scene : {}
  } else if (url.pathname.endsWith("/password")) data = null
  else if (url.pathname.endsWith("/login-verification")) data = [{ type: "EMAIL", bound: true, enabled: true, destination: "f***@example.test" }, { type: "PHONE", bound: false, enabled: false, destination: null }, { type: "TOTP", bound: true, enabled: true, destination: null }]
  else if (url.pathname.endsWith("/login-verification/authentication")) data = { passwordRequired: true, reauthenticationRequired: false, authenticatedUntil: null }
  else if (url.pathname === "/api/v1/announcements") data = { announcements: [], unreadCount: 0, offset: Number(url.searchParams.get("offset")), limit: Number(url.searchParams.get("limit")), hasMore: false }
  else if (url.pathname.endsWith("/runtime")) data = { productLines: ["SPOT"] }
  else if (url.pathname.endsWith("/asset-scales")) data = { USDT: "100000000" }
  else if (url.pathname.endsWith("/list")) data = []
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) })
})
await context.routeWebSocket(/\/ws\/v1/, ws => ws.onMessage(raw => { const f = JSON.parse(String(raw)); if (f.op === "authenticate") ws.send(JSON.stringify({ op: "authenticated", id: f.id })); if (f.op === "ping") ws.send(JSON.stringify({ op: "pong" })) }))
const page = await context.newPage()
page.on("pageerror", error => errors.push(error.message))
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()) })
let nativeAccept = false
page.on("dialog", dialog => nativeAccept ? dialog.accept() : dialog.dismiss())
const goto = route => page.goto("http://127.0.0.1:5183/" + route)
const modal = name => page.getByRole("dialog", { name, exact: true })
const codes = async dialog => { await dialog.getByRole("textbox", { name: "Email code", exact: true }).fill("123456"); await dialog.getByRole("textbox", { name: "Authenticator code", exact: true }).fill("234567") }
const capture = name => page.screenshot({ path: path.join(out, name + ".png") })
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow")
const until = async condition => { for (let n = 0; n < 150; n++) { if (condition()) return; await page.waitForTimeout(30) } throw Error("request fixture was not reached") }
const writes = suffix => requests.filter(row => row.method !== "GET" && row.path.endsWith(suffix))
const identity = value => page.evaluate(value => { if (value) localStorage.setItem("surprising-ex.session", JSON.stringify(value)); else localStorage.removeItem("surprising-ex.session"); window.dispatchEvent(new Event("surprising-ex.session-changed")) }, value)
let cdp
try {
  await goto("api")
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor()
  assert.equal(await page.getByText("No API keys yet.", { exact: true }).count(), 0)
  malformedKeys = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByRole("heading", { name: "Synthetic read key", exact: true }).waitFor()
  await page.getByRole("button", { name: "Create API key", exact: true }).click()
  const create = modal("Create API key")
  await codes(create)
  await create.getByRole("button", { name: "Confirm", exact: true }).click()
  await create.getByText("Use a key name from 1 to 80 characters.", { exact: true }).waitFor()
  await create.getByRole("textbox", { name: "Name", exact: true }).fill("Synthetic trading key")
  await create.getByRole("checkbox", { name: "Trade", exact: true }).check()
  await create.getByRole("checkbox", { name: "Withdraw", exact: true }).check()
  await create.getByRole("textbox", { name: "IP allowlist", exact: true }).fill("198.51.100.5, 2001:db8::/64")
  holdSend = true
  await create.getByRole("button", { name: "Send code", exact: true }).click()
  await until(() => Boolean(releaseSend))
  assert(await create.getByRole("button", { name: "Close", exact: true }).isDisabled())
  await page.keyboard.press("Escape")
  assert(await create.isVisible())
  holdSend = false; releaseSend()
  await create.getByText("Verification code sent. Check your email.", { exact: true }).waitFor()
  holdCreate = true
  await create.getByRole("button", { name: "Confirm", exact: true }).evaluate(el => { el.click(); el.click() })
  await until(() => Boolean(releaseCreate))
  assert.equal(writes("/api-keys").filter(row => row.method === "POST").length, 1)
  assert.deepEqual(JSON.parse(writes("/api-keys")[0].body).ipAllowlist, ["198.51.100.5", "2001:db8::/64"])
  holdCreate = false; releaseCreate()
  const receipt = modal("Save your API secret now")
  await receipt.waitFor()
  assert.equal(await receipt.getByLabel("API secret", { exact: true }).getAttribute("type"), "password")
  await page.evaluate(() => window.__denyCopy = true)
  await receipt.getByRole("button", { name: "Copy secret", exact: true }).click()
  await receipt.getByText("Copy failed. Select and copy the secret manually.", { exact: true }).waitFor()
  await page.evaluate(() => window.__denyCopy = false)
  await receipt.getByRole("button", { name: "Show secret", exact: true }).click()
  assert.equal(await receipt.getByLabel("API secret", { exact: true }).inputValue(), secret)
  await receipt.getByRole("button", { name: "Copy secret", exact: true }).click()
  await receipt.getByText("Copied.", { exact: true }).waitFor()
  await page.keyboard.press("Escape")
  assert(await receipt.isVisible())
  await capture("api-secret-receipt-desktop-light")
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await fit(); await capture("api-secret-receipt-mobile-" + width) }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await receipt.getByRole("button", { name: "I have saved it", exact: true }).click()
  checks.push("key list error never becomes empty; permission/IP review, one create, pending dialog lock, masked one-time receipt, copy failure/retry and explicit secret dismissal")
  createMode = "malformed"
  await page.getByRole("button", { name: "Create API key", exact: true }).click()
  await create.getByRole("textbox", { name: "Name", exact: true }).fill("Unconfirmed synthetic key")
  await codes(create)
  await create.getByRole("button", { name: "Confirm", exact: true }).click()
  await create.getByRole("button", { name: "Refresh and check", exact: true }).waitFor()
  await create.getByRole("button", { name: "Refresh and check", exact: true }).click()
  await page.getByRole("heading", { name: "Unconfirmed synthetic key", exact: true }).waitFor()
  const card = page.locator(".api-key-card").filter({ has: page.getByRole("heading", { name: "Synthetic trading key", exact: true }) })
  await card.getByRole("button", { name: "Edit IPs", exact: true }).click()
  const editIps = modal("Edit IP allowlist")
  assert.equal(await editIps.getByRole("textbox", { name: "IP allowlist", exact: true }).inputValue(), "198.51.100.5, 2001:db8::/64")
  await editIps.getByRole("textbox", { name: "IP allowlist", exact: true }).fill("198.51.100.6/32")
  await codes(editIps)
  await editIps.getByRole("button", { name: "Confirm", exact: true }).evaluate(el => { el.click(); el.click() })
  await editIps.waitFor({ state: "hidden" })
  assert.equal(writes("/api-keys").filter(row => row.method === "PATCH").length, 1)
  await card.locator("summary").click()
  await card.getByText("198.51.100.6/32", { exact: true }).waitFor()
  checks.push("editing an exact key IP/CIDR allowlist sends one PATCH and refreshes the saved addresses")
  await card.getByRole("button", { name: "Revoke", exact: true }).click()
  const revoke = modal("Revoke API key")
  assert((await revoke.innerText()).includes(keys[1].apiKey))
  await codes(revoke); writeStatus = 503
  await revoke.getByRole("button", { name: "Confirm", exact: true }).click()
  await revoke.getByRole("button", { name: "Refresh and check", exact: true }).waitFor()
  assert.equal(writes("/api-keys").filter(row => row.method === "DELETE").length, 1)
  writeStatus = 200
  await revoke.getByRole("button", { name: "Refresh and check", exact: true }).click()
  await card.getByRole("button", { name: "Revoke", exact: true }).click()
  await codes(revoke); await revoke.getByRole("button", { name: "Confirm", exact: true }).click()
  await card.getByText("Revoked", { exact: true }).waitFor()
  checks.push("incomplete create receipt cannot silently succeed; full revoke target is shown and unknown result requires a fresh key read")
  createMode = "success"; holdList = true
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await until(() => Boolean(releaseList))
  await identity({ ...session, user: { ...session.user, userId: "2" } })
  await page.getByRole("heading", { name: "Owner 2 read key", exact: true }).waitFor()
  holdList = false; releaseList(); await page.waitForTimeout(100)
  assert.equal(await page.getByRole("heading", { name: "Synthetic read key", exact: true }).count(), 0)
  await identity(session)
  await goto("security/devices")
  await page.getByText("Windows PC", { exact: true }).waitFor()
  assert.equal(await page.getByText("No devices yet.", { exact: true }).count(), 0)
  failIps = false
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  const row = page.locator("tr").filter({ hasText: "Windows PC" })
  await row.getByRole("button", { name: "Sign out", exact: true }).click()
  const signOut = modal("Sign out device")
  assert((await signOut.innerText()).includes("9007199254740993"))
  await signOut.getByRole("button", { name: "Confirm", exact: true }).click()
  await page.getByText("Account access setting updated.", { exact: true }).waitFor()
  assert(writes("/9007199254740993/revoke").length === 1)
  const android = page.locator("tr").filter({ hasText: "Android device" })
  await android.getByRole("button", { name: "Block login", exact: true }).click()
  const block = modal("Block access")
  assert((await block.innerText()).includes(devices[2].deviceId))
  await codes(block); await block.getByRole("button", { name: "Confirm", exact: true }).click()
  await android.getByText("Blocked", { exact: true }).waitFor()
  checks.push("owner change cancels old key reads; device/IP partial failure preserves devices; exact session/device target sign-out and verified blocking refresh actual state")
  mfaMalformed = true
  await goto("security/account")
  await page.getByRole("button", { name: "Change password", exact: true }).waitFor()
  assert(await page.getByRole("button", { name: "Change password", exact: true }).isDisabled())
  mfaMalformed = false
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByRole("button", { name: "Change password", exact: true }).click()
  const password = modal("Change password")
  await password.getByLabel("Current password", { exact: true }).fill("Synthetic-old-password")
  await password.getByLabel("New password", { exact: true }).fill("Synthetic-new-password")
  await password.getByLabel("Confirm new password", { exact: true }).fill("does-not-match")
  await codes(password); await password.getByRole("button", { name: "Confirm", exact: true }).click()
  await password.getByText("The new passwords do not match.", { exact: true }).waitFor()
  assert.equal(writes("/password").length, 0)
  await password.getByLabel("Confirm new password", { exact: true }).fill("Synthetic-new-password")
  await password.getByRole("button", { name: "Confirm", exact: true }).evaluate(el => { el.click(); el.click() })
  await page.getByText("Security setting updated.", { exact: true }).waitFor()
  assert.equal(writes("/password").length, 1)
  await page.getByRole("switch", { name: "Product transfers", exact: true }).click()
  const scene = modal("Product transfers")
  await codes(scene); writeStatus = 503
  await scene.getByRole("button", { name: "Confirm", exact: true }).click()
  await scene.getByRole("button", { name: "Refresh and check", exact: true }).click()
  writeStatus = 200
  await page.getByRole("switch", { name: "Product transfers", exact: true }).click()
  await codes(scene); await scene.getByRole("button", { name: "Confirm", exact: true }).click()
  await page.waitForFunction(() => document.querySelector('button[role=switch][aria-label="Product transfers"]')?.getAttribute("aria-checked") === "true")
  assert(await page.getByRole("switch", { name: "Withdrawals", exact: true }).isDisabled())
  assert(await page.evaluate(() => !JSON.stringify(localStorage).includes("Synthetic-new-password") && !JSON.stringify(localStorage).includes("synthetic-secret-for")))
  checks.push("missing MFA requirements disable sensitive writes; password confirmation and single submit, failed scene refresh/retry, mandatory withdrawal protection, no password/secret persistence")
  for (const width of [390, 320]) {
    await goto("security/account"); await page.getByRole("button", { name: "Change password", exact: true }).waitFor()
    await page.setViewportSize({ width, height: 844 }); await fit(); await capture("account-security-mobile-" + width)
    await goto("api"); await page.getByRole("heading", { name: "Synthetic read key", exact: true }).waitFor(); await fit(); await capture("api-keys-mobile-" + width)
    await goto("security/devices"); await page.getByText("Windows PC", { exact: true }).waitFor(); await fit(); await capture("devices-mobile-" + width)
  }
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click(); await fit(); await capture("devices-mobile-dark")
  await goto("api"); await page.getByRole("heading", { name: "Synthetic read key", exact: true }).waitFor(); await fit(); await capture("api-keys-mobile-dark")
  await goto("security/account"); await page.getByRole("button", { name: "Change password", exact: true }).waitFor(); await fit(); await capture("account-security-mobile-dark")
  await page.setViewportSize({ width: 1440, height: 1000 }); await fit(); await capture("account-security-desktop-dark")
  await goto("api"); await page.getByRole("heading", { name: "Synthetic read key", exact: true }).waitFor(); await fit(); await capture("api-keys-desktop-dark")
  await goto("security/devices"); await page.getByText("Windows PC", { exact: true }).waitFor(); await fit(); await capture("devices-desktop-dark")
  await identity(null); await goto("api")
  await page.waitForURL("**/auth/login?reason=session-expired")
  await page.getByRole("heading", { name: "Sign in to your account", exact: true }).waitFor()
  await identity(session); await goto("security/devices"); await page.getByText("Windows PC", { exact: true }).waitFor()
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage")
  const fields = ["Nodes", "JSEventListeners", "JSHeapUsedSize", "TaskDuration", "ScriptDuration"], samples = []
  for (let n = 0; n < 7; n++) { const result = await cdp.send("Performance.getMetrics"); samples.push(Object.fromEntries(result.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value]))); if (n < 6) await page.waitForTimeout(10_000) }
  await cdp.send("HeapProfiler.collectGarbage"); const retained = await cdp.send("Performance.getMetrics")
  assert.deepEqual(errors, [])
  checks.push("1440/390/320 light/dark layouts, guest sign-in, repeated navigation and 60-second runtime observation")
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, errors, samples, retained: Object.fromEntries(retained.metrics.filter(row => fields.includes(row.name)).map(row => [row.name, row.value])), browser: browser.version(), fixtureOnly: true }, null, 2))
  console.log(JSON.stringify({ checks, errors, out }))
} catch (error) { await capture("client-failure"); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(error), errors, checks, body: await page.locator("body").innerText() }, null, 2)); throw error }
finally { if (cdp) await cdp.detach(); await context.close(); await browser.close() }
