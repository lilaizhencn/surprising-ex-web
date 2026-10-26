// Isolated identity fixtures and synthetic files only. No real identity/provider submission.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-kyc-client-qa"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await context.addInitScript(() => {
  localStorage.setItem("surprising-ex.session", JSON.stringify({
    accessToken: "kyc-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
    user: { userId: "1", username: "fixture", status: "ACTIVE", roles: ["USER"], createdAt: "2026-01-01T00:00:00Z" }
  }))
  localStorage.setItem("surprising-ex.language", "en")
})
let profile = null, provider = "SELF", failProfile = true, failProvider = false, failCountries = false,
  holdProfile = false, releaseProfile, holdUpload = false, releaseUpload, badOwner = false, badUploadOwner = false, holdSubmit = false, releaseSubmit
const requests = [], checks = [], errors = []
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split("/").at(-1)
  requests.push({ path: url.pathname, method: request.method(), body: request.postData() })
  let status = 200, data = {}
  if (url.pathname === "/api/v1/compliance/kyc") {
    if (request.method() === "POST") {
      if (holdSubmit) await new Promise(resolve => releaseSubmit = resolve)
      profile = { userId: "1", status: "PENDING", kycLevel: "BASIC", provider }
      data = { profile, verificationSession: { provider } }
    } else {
      if (holdProfile) await new Promise(resolve => releaseProfile = resolve)
      status = failProfile ? 503 : 200
      data = failProfile ? { message: "Synthetic KYC outage" } : badOwner ? { userId: "2", status: "VERIFIED" } : profile
    }
  } else if (endpoint === "provider") {
    status = failProvider ? 503 : 200
    data = failProvider ? {} : { provider, simulationEnabled: false }
  } else if (endpoint === "countries") {
    status = failCountries ? 503 : 200
    data = failCountries ? {} : [{ code: "SG", flag: "🇸🇬", names: { en: "Singapore", zh: "新加坡" } }]
  } else if (endpoint === "documents") {
    if (holdUpload) await new Promise(resolve => releaseUpload = resolve)
    data = { documentId: "9007199254740993", userId: badUploadOwner ? "2" : "1" }
  } else if (request.method() === "DELETE") { status = 204; data = null }
  else if (endpoint === "refresh") data = { provider, launchToken: "synthetic-sdk-token" }
  else if (endpoint === "runtime") data = { productLines: ["SPOT"] }
  else if (endpoint === "asset-scales") data = { USDT: "100000000" }
  else if (endpoint === "list" || endpoint === "announcements" || endpoint === "articles") data = []
  else if (endpoint === "summary") data = {}
  await route.fulfill({ status, contentType: "application/json", body: status === 204 ? "" : JSON.stringify(data) })
})
await context.routeWebSocket(/\/ws\/v1/, ws => ws.onMessage(raw => {
  const frame = JSON.parse(String(raw))
  if (frame.op === "authenticate") ws.send(JSON.stringify({ op: "authenticated", id: frame.id }))
  if (frame.op === "ping") ws.send(JSON.stringify({ op: "pong" }))
}))
await context.route("https://static.sumsub.com/idensic/static/sns-websdk-builder.js", route => route.fulfill({
  contentType: "application/javascript",
  body: `window.snsWebSdk = {init(){ const callbacks={}; const builder={withConf(){return builder},on(name,cb){callbacks[name]=cb;return builder},build(){return {launch(selector){window.__sdkLaunch=(window.__sdkLaunch||0)+1;const frame=document.createElement('iframe');frame.title='Synthetic identity SDK';frame.srcdoc='<p>Isolated verification fixture</p>';document.querySelector(selector).append(frame)},destroy(){window.__sdkDestroy=(window.__sdkDestroy||0)+1;document.querySelector('#sumsub-websdk-container')?.replaceChildren()}}}};return builder}};`
}))
const page = await context.newPage()
page.on("pageerror", error => errors.push(error.message))
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()) })
const capture = name => page.screenshot({ path: path.join(out, name + ".png") })
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow")
const choose = async (label, value) => {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: value, exact: true }).click()
}
const go = () => page.goto("http://127.0.0.1:5183/account/kyc")
let cdp
try {
  await go()
  await page.getByRole("heading", { name: "Verification status unavailable" }).waitFor()
  assert.equal(await page.locator(".kyc-application").count(), 0)
  await capture("client-kyc-unavailable-light")
  failProfile = false; holdProfile = true
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByText("Loading verification status…", { exact: true }).waitFor()
  holdProfile = false; releaseProfile()
  await page.locator(".kyc-application").waitFor()
  await choose("Country or region", "🇸🇬 Singapore")
  await choose("Applicant type", "Individual")
  await choose("Verification level", "Basic")
  await choose("Document type", "Passport")
  await page.getByRole("button", { name: "Document expiry date", exact: true }).click()
  await page.locator(".date-picker-calendar button.rdp-day_button:not([disabled])").first().click()
  const input = page.getByLabel("Passport — personal details page", { exact: true })
  await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic invalid") })
  await page.getByText("Use a JPG, PNG or PDF file up to 15 MB.", { exact: true }).waitFor()
  holdUpload = true
  await input.setInputFiles({ name: "synthetic-passport.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=", "base64") })
  await page.getByText("Uploading…", { exact: true }).waitFor()
  assert(await page.getByRole("button", { name: "Submit for verification", exact: true }).isDisabled())
  holdUpload = false; releaseUpload()
  await page.getByText("Required documents uploaded: 1 / 1", { exact: true }).waitFor()
  await capture("client-kyc-application-desktop-light")
  await page.getByRole("button", { name: "Remove Passport — personal details page", exact: true }).click()
  await page.getByText("Required documents uploaded: 0 / 1", { exact: true }).waitFor()
  assert(requests.some(row => row.method === "DELETE" && row.path.endsWith("/9007199254740993")))
  badUploadOwner = true
  await input.setInputFiles({ name: "wrong-owner.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 synthetic fixture") })
  await page.locator(".kyc-document-slot [role=alert]").waitFor()
  await page.getByText("Required documents uploaded: 0 / 1", { exact: true }).waitFor()
  badUploadOwner = false
  await input.setInputFiles({ name: "synthetic-passport.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 synthetic fixture") })
  await page.getByText("Required documents uploaded: 1 / 1", { exact: true }).waitFor()
  holdSubmit = true
  await page.getByRole("button", { name: "Submit for verification", exact: true }).click()
  await page.waitForTimeout(120)
  assert.equal(requests.filter(row => row.path === "/api/v1/compliance/kyc" && row.method === "POST").length, 1)
  const sent = JSON.parse(requests.find(row => row.path === "/api/v1/compliance/kyc" && row.method === "POST").body)
  assert.deepEqual(sent.documentIds, ["9007199254740993"])
  holdSubmit = false; releaseSubmit()
  await page.getByRole("heading", { name: "Verification in progress" }).waitFor()
  checks.push("load failure/retry, loading, selections, date calendar, invalid file, upload/remove with exact ID, wrong upload owner rejection, document progress, one submit and pending result")
  profile = { userId: "1", status: "REJECTED", rejectionReason: "Synthetic long rejection reason ".repeat(25) }
  await page.getByRole("button", { name: "Check review status", exact: true }).click()
  await page.getByRole("heading", { name: "Verification was not approved" }).waitFor()
  await page.getByRole("button", { name: "Verify again", exact: true }).click()
  await page.locator(".kyc-application").waitFor()
  checks.push("rejected review displays full reason and supports a fresh application")
  profile = { userId: "1", status: "VERIFIED", expiresAt: "2030-01-01T00:00:00Z" }; failProvider = true
  await go()
  await page.getByRole("heading", { name: "Identity verified", exact: true }).waitFor()
  assert.equal(await page.locator(".kyc-application").count(), 0)
  checks.push("verified profile remains usable when provider metadata fails")
  profile = { userId: "1", status: "VERIFIED", expiresAt: "2020-01-01T00:00:00Z" }; failProvider = false
  await go()
  await page.getByRole("heading", { name: "Verification has expired", exact: true }).waitFor()
  assert.equal(await page.locator(".kyc-application").count(), 0)
  await page.locator(".kyc-result").getByRole("link", { name: "Help Center", exact: true }).click()
  await page.getByRole("heading", { name: "Help Center", exact: true }).waitFor()
  checks.push("expired verified record cannot advertise current verification or offer a backend-forbidden duplicate application")
  badOwner = true
  await go()
  await page.getByRole("heading", { name: "Verification status unavailable" }).waitFor()
  checks.push("mismatched profile owner is rejected")
  badOwner = false; profile = null; failProvider = true
  await go()
  await page.getByRole("heading", { name: "Verification requirements unavailable" }).waitFor()
  failProvider = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.locator(".kyc-application").waitFor()
  checks.push("provider failure blocks new application and has a working retry")
  failCountries = true
  await go()
  await page.locator(".kyc-application [role=alert]").waitFor()
  failCountries = false
  await page.locator(".kyc-application").getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByRole("button", { name: "Submit for verification", exact: true }).waitFor({ state: "visible" })
  await page.waitForFunction(() => !document.querySelector('.kyc-application button[type=submit]').disabled)
  checks.push("country catalogue failure and retry keep submission disabled until real options load")
  await page.setViewportSize({ width: 390, height: 844 })
  await choose("Country or region", "🇸🇬 Singapore")
  await choose("Applicant type", "Individual")
  await choose("Verification level", "Basic")
  await choose("Document type", "Passport")
  await page.getByLabel("Passport — personal details page", { exact: true }).setInputFiles({
    name: "synthetic-passport-with-a-long-file-name-for-mobile-document-review.pdf",
    mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 synthetic fixture")
  })
  await page.getByText("Required documents uploaded: 1 / 1", { exact: true }).waitFor()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await fit()
    await capture("client-kyc-application-mobile-" + width)
    await page.locator(".kyc-document-slot").scrollIntoViewIfNeeded()
    assert(await page.locator(".kyc-document-slot").evaluate(el => el.scrollWidth <= el.clientWidth), "document slot overflow")
    await fit(); await capture("client-kyc-document-mobile-" + width)
  }
  await page.evaluate(() => document.documentElement.dataset.theme = "dark")
  await fit(); await capture("client-kyc-application-mobile-dark")
  await page.getByRole("button", { name: "Remove Passport — personal details page", exact: true }).click()
  await page.getByText("Required documents uploaded: 0 / 1", { exact: true }).waitFor()
  profile = { userId: "1", status: "PENDING" }; provider = "SUMSUB"
  await go()
  await page.getByRole("button", { name: "Continue verification", exact: true }).click()
  await page.getByRole("button", { name: "Close verification window", exact: true }).waitFor()
  assert.equal(await page.locator("#sumsub-websdk-container iframe").count(), 1)
  await page.getByRole("button", { name: "Close verification window", exact: true }).click()
  assert.equal(await page.evaluate(() => window.__sdkDestroy), 1)
  await page.getByRole("button", { name: "Continue verification", exact: true }).click()
  await page.getByRole("button", { name: "Close verification window", exact: true }).waitFor()
  await page.getByRole("button", { name: "Check review status", exact: true }).click()
  await page.getByRole("heading", { name: "Verification in progress" }).waitFor()
  assert.equal(await page.evaluate(() => window.__sdkDestroy), 2)
  checks.push("external SDK fixture opens once, closes/destroys, reopens and cleans up before refresh")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await choose("Language", "简体中文")
  await page.locator(".kyc-progress li").filter({ hasText: "材料审核" }).waitFor()
  await fit(); await capture("client-kyc-pending-desktop-zh-dark")
  cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")
  await cdp.send("HeapProfiler.collectGarbage")
  const samples = []
  for (let i = 0; i < 7; i++) {
    const result = await cdp.send("Performance.getMetrics")
    samples.push(Object.fromEntries(result.metrics.filter(row => ["JSHeapUsedSize", "Nodes", "JSEventListeners"].includes(row.name)).map(row => [row.name, row.value])))
    if (i < 6) await page.waitForTimeout(10_000)
  }
  await cdp.send("HeapProfiler.collectGarbage")
  const retained = await cdp.send("Performance.getMetrics")
  assert.equal(errors.length, 0, JSON.stringify(errors))
  checks.push("1440/390/320 layouts, light/dark screenshots, 60-second pending polling observation without unexpected console/page errors")
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, errors, samples, retained: retained.metrics.filter(row => ["JSHeapUsedSize", "Nodes", "JSEventListeners"].includes(row.name)), requests: requests.map(({ body, ...row }) => row), browser: browser.version(), fixtureOnly: true }, null, 2))
  console.log(JSON.stringify({ checks, errors, out }))
} catch (reason) {
  await capture("client-failure")
  await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(reason), errors, body: await page.locator("body").innerText() }, null, 2))
  throw reason
} finally { if (cdp) await cdp.detach(); await context.close(); await browser.close() }
