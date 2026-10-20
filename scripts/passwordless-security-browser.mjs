// Local fixtures exercise the actual browser UI; they do not prove provider authorization.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
const { chromium } = await import(process.env.TELEGRAM_PLAYWRIGHT_MODULE || "playwright")
const base = process.env.TELEGRAM_QA_URL || "http://127.0.0.1:15473"
assert.equal(new URL(base).hostname, "127.0.0.1")
const dir = process.env.TELEGRAM_QA_DIR || "/tmp/surprising-passwordless-security-browser"
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.TELEGRAM_CHROMIUM_EXECUTABLE ? { executablePath: process.env.TELEGRAM_CHROMIUM_EXECUTABLE } : {}) })
const session = {
  user: { userId: "7", username: null, email: null, displayName: "小李 🚀", roles: ["USER"] },
  accessToken: "synthetic-access", refreshToken: "synthetic-refresh",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z", refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
}
const evidence = { provider: "synthetic", realProviderAuthorization: false, scenarios: [], errors: [] }
const scenarios = [
  ...[390, 1440].flatMap(width => ["dark", "light"].map(theme => ({ mode: "fresh", width, theme, language: width === 390 ? "zh" : "en" }))),
  { mode: "expired", width: 390, theme: "dark", language: "zh" },
  { mode: "password", width: 390, theme: "light", language: "en" },
  { mode: "owner-change", width: 1440, theme: "dark", language: "en" },
]
try {
  for (const scenario of scenarios) {
    console.log(`Checking ${scenario.mode} ${scenario.width} ${scenario.theme}`)
    const context = await browser.newContext({ viewport: { width: scenario.width, height: 1000 } })
    await context.addInitScript(({ session, scenario }) => {
      localStorage.setItem("surprising-ex.session", JSON.stringify(session))
      localStorage.setItem("surprising-ex.language", scenario.language)
      localStorage.setItem("surprising-ex.theme", scenario.theme)
    }, { session, scenario })
    let bound = false
    let holdNextPrimary = false
    let releasePrimary
    const heldPrimary = new Promise(resolve => { releasePrimary = resolve })
    const mutations = []
    await context.route("**/api/**", async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (!path.startsWith("/api/")) return route.continue()
      const respond = body => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
      if (path.endsWith("/login-verification/authentication")) {
        if (holdNextPrimary) {
          holdNextPrimary = false
          await heldPrimary
        }
        return respond({ passwordRequired: scenario.mode === "password", reauthenticationRequired: scenario.mode === "expired", authenticatedUntil: scenario.mode === "password" ? null : "2099-01-01T00:00:00Z" })
      }
      if (path.endsWith("/login-verification")) return respond(["EMAIL", "PHONE", "TOTP"].map(type => ({ type, bound: type === "EMAIL" && bound, enabled: type === "EMAIL" && bound, destination: type === "EMAIL" && bound ? "n***@example.test" : null })))
      if (path.endsWith("/security/mfa")) return respond({ enabled: false })
      if (path.endsWith("/security/scenes")) return respond([])
      if (path.endsWith("/EMAIL/bind")) {
        mutations.push({ path, body: request.postDataJSON() })
        return respond({ challenge: { requiresVerification: true, challengeToken: "c".repeat(43), expiresAt: "2099-01-01T00:00:00Z", methods: [{ type: "EMAIL", destination: "n***@example.test" }], simulated: false }, secret: null, provisioningUri: null })
      }
      if (path.endsWith("/EMAIL/confirm")) {
        mutations.push({ path, body: request.postDataJSON() })
        bound = true
        return route.fulfill({ status: 204 })
      }
      return route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Synthetic exchange data unavailable"}' })
    })
    const page = await context.newPage()
    page.on("pageerror", error => evidence.errors.push(error.message))
    await page.goto(`${base}/security`)
    const bind = page.locator(".login-method-card").first().getByRole("button").first()
    await bind.waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    if (scenario.mode === "owner-change") {
      holdNextPrimary = true
      const started = page.waitForRequest(request => new URL(request.url()).pathname.endsWith("/login-verification/authentication"))
      await bind.click()
      await started
      await page.evaluate(async session => {
        const { saveSession } = await import("/src/state/session.ts")
        saveSession({ ...session, user: { ...session.user, userId: "8", displayName: "New account" } })
      }, session)
      await page.getByText("New account", { exact: true }).first().waitFor()
      releasePrimary()
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'))
      assert.equal(mutations.length, 0)
    } else {
      await bind.click()
      if (scenario.mode === "expired") {
        const reauthenticate = page.getByRole("link", { name: /重新登录|Sign in again/ })
        await reauthenticate.waitFor()
        assert.equal(await reauthenticate.getAttribute("href"), "/auth/login")
        assert.equal(await page.getByRole("dialog").count(), 0)
        assert.equal(mutations.length, 0)
      } else {
        let dialog = page.getByRole("dialog")
        await dialog.waitFor()
        const password = dialog.locator('input[type="password"]')
        assert.equal(await password.count(), scenario.mode === "password" ? 1 : 0)
        await dialog.locator('input[type="email"]').fill("new@example.test")
        const send = dialog.getByRole("button", { name: /Send verification code|发送验证码/ })
        if (scenario.mode === "password") {
          assert.equal(await send.isDisabled(), true)
          await password.fill("synthetic-password")
        }
        assert.equal(await send.isEnabled(), true)
        await send.click()
        dialog = page.getByRole("dialog")
        await dialog.locator('input[inputmode="numeric"]').fill("123456")
        await dialog.getByRole("button", { name: /^(Confirm|确认)$/ }).click()
        await dialog.waitFor({ state: "hidden" })
        assert.equal(mutations.length, 2)
        assert.equal(mutations[0].body.destination, "new@example.test")
        assert.equal(mutations[0].body.enabled, true)
        assert.equal(mutations[0].body.currentPassword, scenario.mode === "password" ? "synthetic-password" : "")
        assert.equal(mutations[1].body.codes.emailCode, "123456")
        assert.equal(mutations[1].body.currentPassword, scenario.mode === "password" ? "synthetic-password" : "")
        assert.equal(mutations[1].body.codes.challengeToken, "c".repeat(43))
      }
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${dir}/${scenario.mode}-${scenario.width}-${scenario.theme}.png`, fullPage: true })
    evidence.scenarios.push({ ...scenario, passed: true, mutations: mutations.length })
    await context.close()
  }
  assert.deepEqual(evidence.errors, [])
  await writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
} finally { await browser.close() }
