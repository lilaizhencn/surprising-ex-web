// Actual browser UI against affiliate-access-fixture.py; no real business writes.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const output = process.env.QA_OUTPUT || "/tmp/surprising-affiliate-access-web"
await fs.mkdir(output, { recursive: true })
const token = "affiliate-access-web"
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
const host = "http://127.0.0.1:19106"
async function state(enabled, error = false) {
  const response = await fetch(`${host}/__qa/state`, {
    method: "POST", headers, body: JSON.stringify({ enabled, error }),
  })
  assert.equal(response.status, 200)
}
const browser = await chromium.launch({ channel: "chrome", headless: true })
const results = []
try {
  for (const [label, viewport, theme] of [
    ["desktop", { width: 1440, height: 1000 }, "light"],
    ["mobile", { width: 390, height: 844 }, "dark"],
  ]) {
    await state(false)
    const context = await browser.newContext({ viewport })
    await context.addInitScript(({ token, theme }) => {
      localStorage.setItem("surprising-ex.session", JSON.stringify({
        accessToken: token, refreshToken: token,
        accessTokenExpiresAt: "2099-01-01T00:00:00Z", refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
        user: { userId: "1", username: "UI QA", roles: ["USER"], status: "ACTIVE", createdAt: "2026-10-01T00:00:00Z" },
      }))
      localStorage.setItem("surprising-ex.theme", theme)
    }, { token, theme })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    await page.goto(process.env.QA_URL || "http://127.0.0.1:5426/affiliate")
    const main = page.locator("main.affiliate-page")
    const forbidden = /KOL|合作|团队|下级|留存|平台顶层/
    async function basic() {
      await main.getByRole("heading", { name: "我邀请的好友", exact: true }).waitFor()
      assert.doesNotMatch(await main.innerText(), forbidden)
      await main.getByRole("columnheader", { name: "为我产生的返佣", exact: true }).waitFor()
      assert.match(await main.innerText(), /SPOT \/ USDT：1\.25/)
      assert.match(await main.innerText(), /SPOT \/ BTC：0\.00000001/)
      assert.equal(await main.getByRole("button", { name: "调整比例" }).count(), 0)
    }
    await basic()
    await main.getByRole("button", { name: "复制邀请链接", exact: true }).click()
    await main.getByText("邀请链接已复制", { exact: true }).waitFor()
    await page.screenshot({ path: `${output}/${label}-basic.png`, fullPage: true })
    await main.getByRole("textbox", { name: "邀请码", exact: true }).fill("B".repeat(32))
    await main.getByText("该邀请暂不可用，请联系邀请人。", { exact: true }).waitFor()
    assert.equal(await main.getByRole("button", { name: "确认接受邀请", exact: true }).isDisabled(), true)
    assert.doesNotMatch(await main.innerText(), forbidden)
    await state(true)
    await main.getByRole("button", { name: "刷新", exact: true }).click()
    await main.getByRole("heading", { name: "KOL 合作管理", exact: true }).waitFor()
    await main.getByRole("button", { name: "调整比例", exact: true }).click()
    assert.equal(await main.getByRole("textbox", { name: "合作用户 UID", exact: true }).inputValue(), "2")
    await main.getByRole("textbox", { name: "下级分配比例", exact: true }).fill("60.1234")
    await page.screenshot({ path: `${output}/${label}-kol.png`, fullPage: true })
    await main.getByRole("button", { name: "查看贡献", exact: true }).click()
    await main.getByRole("heading", { name: "成员 UID 2", exact: true }).waitFor()
    await main.getByRole("heading", { name: "当前合作分配", exact: true }).waitFor()
    // Revoke while inside a member whose own KOL flag is false.
    await state(false)
    await main.getByRole("button", { name: "刷新", exact: true }).click()
    await basic()
    assert.equal(await main.getByRole("textbox", { name: "合作用户 UID", exact: true }).count(), 0)
    await state(true)
    await main.getByRole("button", { name: "刷新", exact: true }).click()
    await main.getByRole("heading", { name: "KOL 合作管理", exact: true }).waitFor()
    assert.equal(await main.getByRole("textbox", { name: "合作用户 UID", exact: true }).inputValue(), "")
    assert.equal(await main.getByRole("textbox", { name: "下级分配比例", exact: true }).inputValue(), "50")
    await state(true, true)
    await main.getByRole("button", { name: "刷新", exact: true }).click()
    await main.getByRole("alert").waitFor()
    assert.equal(await main.getByRole("heading", { name: "KOL 合作管理", exact: true }).count(), 0)
    await state(false)
    await main.getByRole("button", { name: "刷新", exact: true }).click()
    await basic()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    results.push({ label, viewport, theme, basic: true, enable: true, branchWithDisabledMember: true,
      revokeFromBranch: true, blockedInvitation: true, copy: true, failedRefreshRecovery: true, pageErrors: errors, overflow: false })
    await context.close()
  }
  const calls = await (await fetch(`${host}/__qa/calls`, { headers })).json()
  assert.equal(calls.some(call => !call.enabled && (call.path === "/api/v1/affiliate/members/2" || call.query.includes("parentId="))), false)
  const guest = await browser.newContext()
  const registration = await guest.newPage()
  await registration.goto(`${process.env.QA_URL || "http://127.0.0.1:5426/affiliate"}`.replace(/\/affiliate$/, `/auth/register?invite=${"B".repeat(32)}`))
  await registration.getByText("此邀请码不能用于普通注册，请清空后注册。", { exact: true }).waitFor()
  assert.doesNotMatch(await registration.locator("main.auth-card").innerText(), /KOL|合作|团队|下级|分配比例/)
  await registration.getByRole("textbox", { name: "Email or phone", exact: true }).fill("ui@qa.test")
  await registration.getByLabel("Password", { exact: true }).fill("FixtureOnly2026!")
  let registrations = 0
  registration.on("request", request => { if (request.method() === "POST" && request.url().includes("/auth/register")) registrations++ })
  await registration.getByRole("button", { name: "Create Account", exact: true }).click()
  await registration.getByText("此邀请码不能用于普通注册，请清空后注册。", { exact: true }).nth(1).waitFor()
  assert.equal(registrations, 0)
  await registration.getByRole("textbox", { name: "邀请码（选填）", exact: true }).fill("A".repeat(32))
  await registration.getByText("邀请人 UID 1 · 注册后接受邀请，符合条件的手续费将自动参与返佣核算", { exact: true }).waitFor()
  results.push({ guestRegistrationHidesKol: true, cooperationRegistrationBlockedBeforePost: true, ordinaryRegistrationPreview: true })
  await guest.close()
  await fs.writeFile(`${output}/result.json`, JSON.stringify({ scope: "UI contract fixture only; backend authorization separately tested with PostgreSQL", results }, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
