// Focused browser fault injection; no business records or backend service are simulated as real data.
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
const { chromium } = await import(process.env.C2C_PLAYWRIGHT_MODULE || "playwright")
const browser = await chromium.launch({
  headless: true,
  ...(process.env.C2C_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.C2C_CHROMIUM_EXECUTABLE }
    : {}),
})
const evidence = {
  scope: "isolated UI with empty HTTP fixtures and injected WebSocket subscription failure",
  passed: false,
}
let page,
  inboxRequests = 0,
  connections = 0,
  failing = true
try {
  page = await browser.newPage()
  await page.addInitScript(() => {
    localStorage.setItem("surprising-ex.language", "zh")
    localStorage.setItem(
      "surprising-ex.session",
      JSON.stringify({
        accessToken: "qa-12",
        refreshToken: "qa-refresh",
        accessTokenExpiresAt: "2099-01-01T00:00:00Z",
        refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
        user: { userId: 12 },
      }),
    )
  })
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url())
    const body = url.pathname.endsWith("/c2c/status")
      ? { runtimeEnabled: true, businessEnabled: true, available: true, reason: "" }
      : { items: [], hasMore: false, announcements: [], unreadCount: 0 }
    return route.fulfill({ json: body })
  })
  await page.routeWebSocket("**/ws/v1", (socket) => {
    connections++
    socket.onMessage((raw) => {
      const command = JSON.parse(String(raw))
      if (command.op === "authenticate")
        socket.send(JSON.stringify({ op: "authenticated", userId: 12 }))
      if (command.op === "c2c.inbox") {
        inboxRequests++
        socket.send(
          JSON.stringify(
            failing
              ? {
                  op: "c2c.error",
                  channel: "c2c.messages",
                  message: "synthetic transient subscription failure",
                }
              : { op: "c2c.subscribed", channel: "c2c.inbox" },
          ),
        )
      }
    })
  })
  await page.goto("http://127.0.0.1:17173/c2c")
  const error = page.getByText("聊天订阅失败，请重试。", { exact: true })
  await error.waitFor()
  const beforeRetry = connections
  const previousInboxRequests = inboxRequests
  failing = false
  await page.getByRole("button", { name: "重试", exact: true }).click()
  await error.waitFor({ state: "detached" })
  assert.equal(inboxRequests, previousInboxRequests + 1)
  assert.equal(connections, beforeRetry)
  evidence.passed = true
  evidence.inboxRequests = inboxRequests
  evidence.retryOpenedAnotherConnection = false
} finally {
  evidence.inboxRequests = inboxRequests
  evidence.connections = connections
  if (!evidence.passed && page) {
    evidence.visibleText = await page.locator("body").innerText()
    await page.screenshot({ path: "/tmp/surprising-c2c-web-inbox-retry-failure-20261020.png" })
  }
  if (process.env.C2C_INBOX_QA_REPORT)
    await writeFile(process.env.C2C_INBOX_QA_REPORT, JSON.stringify(evidence, null, 2))
  await browser.close()
}
assert.equal(evidence.passed, true)
console.log("Inbox subscription retry restored on the same browser connection")
