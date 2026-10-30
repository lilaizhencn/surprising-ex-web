// Synthetic provider responses validate browser interactions, not real Telegram authorization.
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
const { chromium } = await import(process.env.TELEGRAM_PLAYWRIGHT_MODULE || "playwright")
const dir = process.env.TELEGRAM_QA_DIR || "/tmp/surprising-telegram-browser-qa"
const base = process.env.TELEGRAM_QA_URL || "http://127.0.0.1:15473"
assert.ok(new URL(base).hostname === "127.0.0.1", "Use local synthetic fixtures only")
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.TELEGRAM_CHROMIUM_EXECUTABLE ? { executablePath: process.env.TELEGRAM_CHROMIUM_EXECUTABLE } : {}) })
const evidence = { provider: "synthetic", scenarios: [], errors: [] }
const session = {
  user: { userId: "7", username: null, email: null, displayName: "小李 🚀", roles: ["USER"] },
  accessToken: "synthetic-access",
  refreshToken: null,
  browserSession: true,
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
}
try {
  for (const width of [320, 390, 1440]) {
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } })
      let authorized = false
      const bodies = []
      await context.addInitScript(({ theme }) => {
        localStorage.setItem("surprising-ex.language", "zh")
        localStorage.setItem("surprising-ex.theme", theme)
      }, { theme })
      await context.route("https://oauth.telegram.org/auth?**", async (route) => {
        authorized = true
        await route.fulfill({ contentType: "text/html", body: "<title>Telegram synthetic authorization</title>Authorized" })
      })
      await context.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname
        if (!path.startsWith("/api/")) return route.continue()
        const respond = (body) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
        if (path.endsWith("/auth/csrf")) return respond({ token: "synthetic-csrf" })
        if (path.endsWith("/browser/refresh")) return route.fulfill({status:401,contentType:"application/json",body:'{"message":"No synthetic session"}'})
        if (path.endsWith("/google/config")) return respond({enabled:false,webClientId:""})
        if (path==="/api/v1/legal/current") return respond(["USER_AGREEMENT","PRIVACY_POLICY"].map((type,index)=>({revisionId:String(101+index),type,slug:index?"privacy-policy":"user-agreement",revisionLabel:"synthetic-1",locale:"zh-CN",title:index?"隐私政策":"用户协议",bodyHtml:"<p>Explicit synthetic agreement fixture.</p>",registrationRequired:true,publishedAt:"2026-10-31T00:00:00Z"})))
        if (path.endsWith("/telegram/config")) return respond({ enabled: true })
        if (path.endsWith("/telegram/start")) return respond({
          flowId: "s".repeat(43), verifier: "v".repeat(43),
          authorizationUrl: "https://oauth.telegram.org/auth?state=synthetic",
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        })
        if (path.endsWith("/telegram/complete")) {
          assert.equal(route.request().headers()["x-legal-acceptance"],"101:zh-CN,102:zh-CN")
          bodies.push(route.request().postDataJSON())
          return respond(authorized ? session : { pending: true })
        }
        // No exchange data or real accounts are involved.
        return route.fulfill({ status: 503, contentType: "application/json", body: '{"message":"Synthetic market data unavailable"}' })
      })
      const page = await context.newPage()
      page.on("pageerror", (error) => evidence.errors.push(error.message))
      await page.goto(`${base}/auth/register`)
      const button = page.getByRole("button", { name: /Telegram/ })
      await button.waitFor()
      await page.screenshot({ path: `${dir}/register-${width}-${theme}.png`, fullPage: true })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.equal(await button.isDisabled(), true)
      await page.locator(".legal-review").getByRole("checkbox").check()
      await button.click()
      await page.waitForURL("**/assets", { timeout: 15_000 })
      await page.getByText("小李 🚀", {exact:true}).first().waitFor({state:"attached"})

      assert.ok(bodies.length > 0)
      assert.deepEqual(bodies[0], { flowId: "s".repeat(43), verifier: "v".repeat(43) })
      assert.equal(await page.evaluate(() => localStorage.getItem("surprising-ex.session")), null)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `${dir}/signed-in-${width}-${theme}.png`, fullPage: true })
      evidence.scenarios.push({ width, theme, password: "not entered", nickname: "小李 🚀", passed: true })
      await context.close()
    }
  }
  assert.deepEqual(evidence.errors, [])
  await writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
} finally { await browser.close() }
