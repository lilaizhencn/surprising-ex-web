// Real loopback KYC controllers/PostgreSQL and synthetic identities/documents.
// Authentication/bootstrap and unrelated catalogue endpoints are browser fixtures.
// The test server also substitutes scan, rate-limit, email and approval boundaries.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-kyc-live-qa"
await fs.mkdir(out, { recursive: true })
const api = "http://127.0.0.1:19086"
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const failures = [], requests = [], checks = []
async function context(admin = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => localStorage.setItem("surprising-ex.language", "en"))
  await context.route(url => url.pathname.startsWith("/api/"), async route => {
    const request = route.request(), url = new URL(request.url())
    const token = admin ? "kyc-qa-admin" : "kyc-qa-user"
    if (url.pathname.includes("/compliance/") && !url.pathname.endsWith("/mfa-recovery")) {
      const response = await route.fetch({ url: api + url.pathname + url.search,
        headers: { ...request.headers(), authorization: "Bearer " + token } })
      requests.push({ path: url.pathname, method: request.method(), status: response.status(), admin })
      return route.fulfill({ response })
    }
    let data = {}
    if (url.pathname.endsWith("/csrf")) data = { token: "synthetic-csrf" }
    else if (url.pathname.endsWith("/browser/refresh")) data = {
      accessToken: token, browserSession: true, accessTokenExpiresAt: "2030-01-01T00:00:00Z",
      refreshTokenExpiresAt: "2030-01-01T00:00:00Z",
      user: { userId: admin ? "7" : "42", username: admin ? "qa-admin" : "kycqa", roles: [admin ? "SUPER_ADMIN" : "USER"], status: "NORMAL", createdAt: "2026-01-01T00:00:00Z" },
    }
    else if (url.pathname.endsWith("/runtime")) data = { productLines: ["SPOT"] }
    else if (url.pathname.endsWith("/asset-scales")) data = { USDT: "100000000" }
    else if (/mfa-recovery|announcements|\/list$|\/articles$/.test(url.pathname)) data = []
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) })
  })
  await context.routeWebSocket(/\/ws\/v1/, socket => socket.onMessage(() => {}))
  return context
}
const client = await context(), admin = await context(true)
const page = await client.newPage(), review = await admin.newPage()
for (const current of [page, review]) current.on("pageerror", error => failures.push(error.message))
review.on("dialog", dialog => dialog.accept())
const shot = (current, name) => current.screenshot({ path: path.join(out, name + ".png"), fullPage: true })
const choose = async (label, value) => {
  await page.getByRole("combobox", { name: label, exact: true }).click()
  await page.getByRole("option", { name: value, exact: true }).click()
}
const fit = async current => assert(await current.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "horizontal overflow")
async function submit() {
  await choose("Country or region", "🇸🇬 Singapore")
  await choose("Applicant type", "Individual")
  await choose("Verification level", "Basic")
  await choose("Document type", "Passport")
  await page.getByRole("button", { name: "Document expiry date", exact: true }).click()
  await page.locator(".date-picker-calendar button.rdp-day_button:not([disabled])").first().click()
  await page.getByLabel("Passport — personal details page", { exact: true }).setInputFiles({ name: "synthetic-passport.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9kAAAAASUVORK5CYII=", "base64") })
  await page.getByText("Required documents uploaded: 1 / 1", { exact: true }).waitFor()
  await fit(page)
  await shot(page, "client-application-" + page.viewportSize().width)
  await page.getByRole("button", { name: "Submit for verification", exact: true }).click()
  await page.getByRole("heading", { name: "Verification in progress", exact: true }).waitFor()
}
async function openReview() {
  await review.goto("http://127.0.0.1:5184/#compliance")
  await review.reload()
  if (review.viewportSize().width < 600) {
    await review.getByText("打开详情", { exact: true }).filter({ visible: true }).first().click()
  } else {
    await review.getByRole("cell", { name: "42", exact: true }).first().click()
  }
  await review.getByRole("heading", { name: "KYC 审核 · 用户 42", exact: true }).waitFor()
}
async function decide(status) {
  const panel = review.locator("section").filter({ has: review.getByRole("heading", { name: "KYC 审核 · 用户 42", exact: true }) }).last()
  await panel.getByRole("combobox", { name: "KYC 审核状态", exact: true }).selectOption(status)
  if (status === "REJECTED") await review.getByLabel("拒绝原因", { exact: true }).fill("请补充清晰、完整且没有遮挡的证件照片。")
  else await review.getByLabel("过期时间 ISO", { exact: true }).fill(new Date(Date.now() + 600_000).toISOString())
  await review.getByRole("button", { name: "保存 KYC", exact: true }).click()
  const approval = review.getByRole("dialog", { name: "敏感操作审批", exact: true })
  // Synthetic approved ID is accepted only by the isolated test server's approval boundary.
  await approval.getByLabel("审批单 ID", { exact: true }).fill("7001")
  await approval.getByRole("button", { name: "继续", exact: true }).click()
  await review.getByText("操作已提交；请核对刷新后的状态。", { exact: true }).waitFor()
  const response = await client.request.get(api + "/api/v1/compliance/kyc", { headers: { authorization: "Bearer kyc-qa-user" } })
  assert.equal((await response.json()).status, status)
}
try {
  const reset = await client.request.post(api + "/__qa/reset", { headers: { authorization: "Bearer kyc-qa-admin" } })
  assert(reset.ok())
  await page.goto("http://127.0.0.1:5183/account/kyc")
  await page.locator(".kyc-application").waitFor()
  await submit()
  await openReview()
  await review.getByRole("button", { name: "查看原件", exact: true }).first().click()
  await review.getByRole("dialog").waitFor()
  await shot(review, "admin-evidence-desktop")
  await review.getByRole("button", { name: "关闭预览", exact: true }).click()
  await decide("REJECTED")
  await page.getByRole("button", { name: "Check review status", exact: true }).click()
  await page.getByRole("heading", { name: "Verification was not approved", exact: true }).waitFor()
  await page.getByText("请补充清晰、完整且没有遮挡的证件照片。", { exact: true }).waitFor()
  await shot(page, "client-rejected")
  checks.push("real upload, submission, admin original-document preview and rejection reason")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Verify again", exact: true }).click()
  await submit()
  await review.setViewportSize({ width: 390, height: 844 })
  await openReview()
  await fit(review)
  await shot(review, "admin-review-mobile")
  await decide("VERIFIED")
  await page.getByRole("button", { name: "Check review status", exact: true }).click()
  await page.getByRole("heading", { name: "Identity verified", exact: true }).waitFor()
  await shot(page, "client-verified-mobile")
  checks.push("corrected application and real admin approval on narrow screens")
  await client.request.post(api + "/__qa/expire", { headers: { authorization: "Bearer kyc-qa-admin" } })
  await page.reload()
  await page.getByRole("heading", { name: "Verification has expired", exact: true }).waitFor()
  await shot(page, "client-expired-mobile")
  await page.getByRole("button", { name: "Verify again", exact: true }).click()
  await submit()
  await shot(page, "client-renewed-mobile")
  checks.push("expired VERIFIED profile renews through a real new submission")
  assert.equal(failures.length, 0, JSON.stringify(failures))
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, failures, requests, browser: browser.version(),
    source: "KycClosureBrowserQaTest: actual controllers, transactions, PostgreSQL and filesystem; synthetic auth/identity and scan/rate-limit/email boundaries" }, null, 2))
  console.log(JSON.stringify({ checks, failures }))
} catch (error) {
  await shot(page, "client-failure")
  await shot(review, "admin-failure")
  await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(error), client: await page.locator("body").innerText(), admin: await review.locator("body").innerText(), requests }, null, 2))
  throw error
} finally { await browser.close() }
