// 仅连接 C2cBrowserQaTest 的本机合成账号夹具；不登录或发布真实环境。
const { chromium } = await import(process.env.C2C_PLAYWRIGHT_MODULE || "playwright")
import { readFile, writeFile } from "node:fs/promises"
import assert from "node:assert/strict"
const dir = process.env.C2C_BROWSER_QA_DIR
if (!dir?.startsWith("/tmp/surprising-c2c-web-qa-"))
  throw new Error("Set an owned C2C_BROWSER_QA_DIR under /tmp")
const runtime = JSON.parse(await readFile(`${dir}/runtime.json`, "utf8"))
const browser = await chromium.launch({
  headless: true,
  ...(process.env.C2C_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.C2C_CHROMIUM_EXECUTABLE }
    : {}),
})
const evidence = { fixture: runtime.fixture, steps: [], sockets: {}, errors: [] }
const contexts = []
const session = (id) => ({
  accessToken: `qa-${id}`,
  refreshToken: `qa-refresh-${id}`,
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
  user: { userId: id },
})
async function open(id, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport })
  contexts.push(context)
  await context.addInitScript(
    ({ value }) => {
      localStorage.setItem("surprising-ex.session", JSON.stringify(value))
      localStorage.setItem("surprising-ex.language", "zh")
    },
    { value: session(id) },
  )
  const page = await context.newPage()
  const frames = []
  const sockets = []
  const activeSockets = new Set()
  page.on("websocket", (ws) => {
    if (!new URL(ws.url()).pathname.endsWith("/ws/v1")) return
    sockets.push(ws)
    activeSockets.add(ws)
    ws.on("close", () => activeSockets.delete(ws))
    ws.on("framereceived", ({ payload }) => {
      try {
        const e = JSON.parse(payload)
        frames.push({ op: e.op, channel: e.channel })
      } catch {}
      if (payload.includes("c2c.error")) evidence.errors.push(payload)
    })
  })
  page.on("pageerror", (error) => evidence.errors.push(error.message))
  await page.goto("http://127.0.0.1:17173/c2c")
  await page.locator(".c2c-conversation").first().waitFor()
  await page.locator(".c2c-conversation").first().click()
  await page.getByText("QA history 79", { exact: true }).waitFor()
  return { context, page, sockets, activeSockets, frames }
}
async function step(name, fn) {
  await fn()
  evidence.steps.push(name)
  console.log(name)
}
try {
  const buyer = await open(12)
  const maker = await open(11)
  await step("actual recent history baseline contains exactly 50 persisted messages", async () => {
    assert.equal(await buyer.page.locator(".c2c-message").count(), 50)
  })
  await step(
    "earlier pages retain the 80 seeded messages and preserve the scroll anchor",
    async () => {
      const p = buyer.page
      await p.locator(".c2c-timeline").evaluate((n) => (n.scrollTop = 0))
      await p.getByRole("button", { name: "更早的消息", exact: true }).click()
      await p.getByText("QA history 00", { exact: true }).waitFor()
      assert.ok((await p.locator(".c2c-message").count()) >= 80)
      assert.ok(await p.locator(".c2c-timeline").evaluate((n) => n.scrollTop > 0))
    },
  )
  await step("real order dialog reads the order and exact fee fields", async () => {
    await buyer.page.getByRole("button", { name: "查看订单", exact: true }).click()
    await buyer.page.locator("dialog").getByText(runtime.orderId, { exact: true }).waitFor()
    await buyer.page.locator("dialog").screenshot({ path: `${dir}/order-desktop.png` })
    await buyer.page.locator("dialog").getByRole("button", { name: "关闭", exact: true }).click()
  })
  await step("market subscription and chat use the one existing physical socket", async () => {
    await buyer.page.evaluate(async () => {
      const { acquireRealtimeConnections } = await import("/src/sharedRealtimeConnections.ts")
      const { config } = await import("/src/lib/config.ts")
      window.__qaMarket = acquireRealtimeConnections(
        config.wsBaseUrlForProductLine,
        "qa-12",
        () => {},
        () => {},
      )
      window.__qaMarket.update([{ channel: "trades", productLine: "SPOT", instrumentId: "1001" }])
    })
    await buyer.page.waitForTimeout(300)
    assert.equal(buyer.activeSockets.size, 1)
    assert.equal(maker.activeSockets.size, 1)
    assert.match(buyer.sockets.at(-1).url(), /\/ws\/v1$/)
    assert.ok(buyer.frames.some((f) => f.channel === "trades"))
    assert.ok(buyer.frames.some((f) => f.channel === "c2c.messages"))
  })
  const text = `真实双端联调 ${Date.now()} ${"价格与付款沟通 ".repeat(8)}`
  await step(
    "persisted message reaches the other logged-in browser through shared websocket",
    async () => {
      await buyer.page.getByRole("textbox", { name: "消息", exact: true }).fill(text)
      await buyer.page.getByRole("button", { name: "发送", exact: true }).click()
      await maker.page.locator(".c2c-timeline").getByText(text, { exact: true }).waitFor()
      await buyer.page.locator(".c2c-timeline").getByText(text, { exact: true }).waitFor()
      assert.equal(
        await maker.page.locator(".c2c-timeline").getByText(text, { exact: true }).count(),
        1,
      )
    },
  )
  await step("a lost committed response recovers by receipt without posting twice", async () => {
    let posts = 0
    const path = `**/conversations/${runtime.conversationId}/messages`
    await buyer.page.route(path, async (route) => {
      if (route.request().method() === "POST") {
        posts++
        await route.fetch()
        await route.abort("failed")
      } else await route.continue()
    })
    const lost = `丢失响应去重 ${Date.now()}`
    await buyer.page.getByRole("textbox", { name: "消息", exact: true }).fill(lost)
    await buyer.page.getByRole("button", { name: "发送", exact: true }).click()
    await buyer.page.getByText("发送结果待确认，重试时会先查询原消息。", { exact: true }).waitFor()
    await maker.page.locator(".c2c-timeline").getByText(lost, { exact: true }).waitFor()
    await buyer.page.getByRole("button", { name: "查询并重试", exact: true }).click()
    await buyer.page
      .getByRole("textbox", { name: "消息", exact: true })
      .waitFor({ state: "visible" })
    await buyer.page.waitForFunction(
      () => document.querySelector(".c2c-compose-row textarea")?.disabled === false,
    )
    assert.equal(posts, 1)
    assert.equal(
      await maker.page.locator(".c2c-timeline").getByText(lost, { exact: true }).count(),
      1,
    )
    await buyer.page.unroute(path)
  })
  await step("offline messages replay once on the existing shared transport", async () => {
    await buyer.context.setOffline(true)
    await buyer.page.waitForTimeout(300)
    const replay = `离线补拉 ${Date.now()}`
    await maker.page.getByRole("textbox", { name: "消息", exact: true }).fill(replay)
    await maker.page.getByRole("button", { name: "发送", exact: true }).click()
    await maker.page.locator(".c2c-timeline").getByText(replay, { exact: true }).waitFor()
    await buyer.context.setOffline(false)
    await buyer.page.locator(".c2c-timeline").getByText(replay, { exact: true }).waitFor()
    assert.equal(
      await buyer.page.locator(".c2c-timeline").getByText(replay, { exact: true }).count(),
      1,
    )
    assert.equal(buyer.activeSockets.size, 1)
  })
  await step(
    "private authenticated image upload is delivered and displayed for the other party",
    async () => {
      await buyer.page
        .locator("input[type=file]")
        .setInputFiles({
          name: "synthetic-proof.png",
          mimeType: "image/png",
          buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jp1sAAAAASUVORK5CYII=",
            "base64",
          ),
        })
      await buyer.page.locator(".c2c-selected-file").getByText("已就绪", { exact: true }).waitFor()
      await buyer.page.getByRole("button", { name: "发送", exact: true }).click()
      await maker.page.locator(".c2c-timeline").evaluate((n) => (n.scrollTop = n.scrollHeight))
      await maker.page.locator('img[alt="synthetic-proof.png"]').waitFor()
      assert.match(
        await maker.page.locator('img[alt="synthetic-proof.png"]').getAttribute("src"),
        /^blob:/,
      )
    },
  )
  await step("desktop light and dark layouts have no horizontal overflow", async () => {
    await buyer.page.evaluate(() => window.__qaMarket.close())
    await buyer.page.screenshot({ path: `${dir}/chat-desktop-light.png` })
    await buyer.page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"))
    await buyer.page.screenshot({ path: `${dir}/chat-desktop-dark.png` })
    assert.ok(await buyer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  })
  await step(
    "mobile layout opens the conversation, fits the composer and returns to the list",
    async () => {
      await buyer.page.setViewportSize({ width: 390, height: 844 })
      await buyer.page.screenshot({ path: `${dir}/chat-mobile-dark.png` })
      assert.ok(await buyer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.ok(
        await buyer.page
          .locator(".c2c-chat-header")
          .getByRole("button", { name: "返回会话列表", exact: true })
          .isVisible(),
      )
      await buyer.page
        .locator(".c2c-chat-header")
        .getByRole("button", { name: "返回会话列表", exact: true })
        .click()
      assert.ok(await buyer.page.locator(".c2c-sidebar").isVisible())
      await buyer.page.getByRole("button", { name: "订单", exact: true }).click()
      await buyer.page.locator(".c2c-order-row").waitFor()
      await buyer.page.locator(".c2c-order-row").click()
      await buyer.page.locator(".c2c-timeline").getByText(text, { exact: true }).waitFor()
      assert.equal(buyer.activeSockets.size, 1)
    },
  )
  await step("consultation privacy rejection remains visible inside its dialog", async () => {
    const p = buyer.page
    await p
      .locator(".c2c-chat-header")
      .getByRole("button", { name: "返回会话列表", exact: true })
      .click()
    await p.getByRole("button", { name: "新建会话", exact: true }).click()
    await p.locator("dialog select").selectOption("merchant")
    await p.locator("dialog input").fill("13")
    await p.locator("dialog").getByRole("button", { name: "打开会话", exact: true }).click()
    await p.locator("dialog [role=alert]").waitFor()
    await p.keyboard.press("Escape")
    await p.locator("dialog").waitFor({ state: "detached" })
  })
  await step("changing accounts removes all prior conversation content", async () => {
    await buyer.page.evaluate(async (value) => {
      const { saveSession } = await import("/src/state/session.ts")
      saveSession(value)
    }, session(13))
    await buyer.page.locator(".c2c-sidebar .state-view").waitFor()
    assert.equal(await buyer.page.locator(".c2c-conversation").count(), 0)
    assert.equal(await buyer.page.locator(".c2c-message").count(), 0)
    assert.ok(!(await buyer.page.getByText("QA Maker", { exact: true }).count()))
  })
  evidence.sockets = {
    buyer: buyer.sockets.map((ws) => ws.url()),
    maker: maker.sockets.map((ws) => ws.url()),
  }
  assert.equal(evidence.errors.length, 0)
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.failure = error.stack
  console.error(error)
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages()[0]
    if (page) await page.screenshot({ path: `${dir}/failure-${i}.png` })
  }
  process.exitCode = 1
} finally {
  await writeFile(`${dir}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  await browser.close()
}
