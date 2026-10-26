// Explicit local HTTP/session fixtures. No real messages, announcements or writes.
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || "playwright")
const out = process.env.QA_OUTPUT || "/tmp/surprising-content-client"
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const session = { accessToken: "content-fixture", refreshToken: "fixture", accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-01T00:00:00Z", user: { userId: "1", username: "fixture", status: "ACTIVE", roles: ["USER"], createdAt: "2026-01-01T00:00:00Z" } }
await context.addInitScript(value => {
  if (!sessionStorage.qaContentInitialized) { localStorage.setItem("surprising-ex.session", JSON.stringify(value)); localStorage.setItem("surprising-ex.language", "en"); sessionStorage.qaContentInitialized = "yes" }
  const set = Storage.prototype.setItem
  Storage.prototype.setItem = function(key, value) {
    if (window.__denySeen && key.startsWith("surprising-ex.announcement-seen:")) throw new DOMException("blocked", "SecurityError")
    return set.call(this, key, value)
  }
}, session)
const iso = "2026-10-26T10:00:00Z", id = "9007199254740993"
const notifications = [{ notificationId: id, title: "Synthetic security notice", body: "Complete message body\n" + "long-content-without-spaces-".repeat(35), category: "SECURITY", createdAt: iso, readAt: null }, { notificationId: "2", title: "Already read message", body: "Read body", category: "SYSTEM", createdAt: iso, readAt: iso }]
const read = new Set(), requests = [], checks = [], errors = []
let holdHelp = false, releaseHelp, failHelp = false, badNotifications = true, holdNotificationRead = false, releaseNotificationRead, failAllNotifications = false,
  holdAnnouncement = false, releaseAnnouncement, failAnnouncement = false, popup = false, popupVersion = "1", popupRead = false, failPopup = false
const announcement = (n, locale, owner) => ({ announcementId: n === 0 ? id : String(100 + n), version: "1", category: n % 2 ? "MAINTENANCE" : "GENERAL", title: locale + ":" + owner + ":Announcement " + n, summary: "Synthetic summary " + n, body: "Synthetic complete body " + n + "\n" + "Long-article-content-".repeat(45), startsAt: iso, expiresAt: null, readAt: read.has(owner + ":" + n) ? iso : null })
const popupRow = () => ({ ...announcement(90, "en-US", "1"), announcementId: "9223372036854775807", version: popupVersion, title: "Important synthetic notice", body: "Complete popup message\n" + "Long popup content. ".repeat(40), readAt: popupRead ? iso : null })
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const req = route.request(), url = new URL(req.url()), method = req.method(), owner = req.headers()["x-user-id"] || "guest"
  requests.push({ path: url.pathname, query: url.search, method, body: req.postData(), owner })
  let status = 200, data = {}
  if (url.pathname === "/api/v1/help/articles") {
    const q = url.searchParams.get("query") || ""
    if (q === "slow" && holdHelp) await new Promise(resolve => releaseHelp = resolve)
    status = failHelp ? 503 : 200
    data = failHelp ? {} : [0, 1].map(n => ({ articleId: "help-" + n, title: q ? q + " result " + n : "Security help " + n, category: url.searchParams.get("category") || "SECURITY", summary: "Useful synthetic summary", body: "Full synthetic help body\n" + "Long-help-content-".repeat(50), updatedAt: iso }))
  } else if (url.pathname === "/api/v1/notifications") {
    data = badNotifications ? {} : notifications.filter(row => !url.searchParams.get("unreadOnly")?.includes("true") || !row.readAt)
  } else if (url.pathname === "/api/v1/notifications/read-all") {
    status = failAllNotifications ? 503 : 200
    if (!failAllNotifications) notifications.forEach(row => row.readAt = iso)
    data = failAllNotifications ? {} : 1
  } else if (url.pathname.endsWith("/read") && url.pathname.includes("/notifications/")) {
    if (holdNotificationRead) await new Promise(resolve => releaseNotificationRead = resolve)
    notifications[0].readAt = iso; data = notifications[0]
  } else if (url.pathname === "/api/v1/announcements") {
    const placement = url.searchParams.get("placement"), limit = Number(url.searchParams.get("limit")), offset = Number(url.searchParams.get("offset"))
    const locale = url.searchParams.get("locale")
    const all = Array.from({ length: 51 }, (_, n) => announcement(n, locale, owner))
    const rows = placement === "CENTER" ? all.slice(offset, offset + limit) : popup && (placement === "BANNER" || !popupRead) ? [popupRow()] : []
    data = { announcements: rows, unreadCount: owner === "guest" ? 0 : 51 - all.filter(row => row.readAt).length, offset, limit, hasMore: placement === "CENTER" && offset + rows.length < all.length }
  } else if (url.pathname === "/api/v1/announcements/read-all") {
    for (let n = 0; n < 51; n++) read.add(owner + ":" + n)
    data = { updated: 51 }
  } else if (url.pathname.endsWith("/read") && url.pathname.includes("/announcements/")) {
    const target = url.pathname.split("/").at(-2), locale = url.searchParams.get("locale")
    if (target === "9223372036854775807") {
      status = failPopup ? 503 : 200
      if (!failPopup) popupRead = true
      data = failPopup ? {} : popupRow()
    } else {
      const n = target === id ? 0 : Number(target) - 100
      if (n === 0 && holdAnnouncement) await new Promise(resolve => releaseAnnouncement = resolve)
      status = failAnnouncement ? 503 : 200
      if (!failAnnouncement) read.add(owner + ":" + n)
      data = failAnnouncement ? {} : announcement(n, locale, owner)
    }
  } else if (url.pathname.endsWith("/runtime")) data = { productLines: ["SPOT"] }
  else if (url.pathname.endsWith("/asset-scales")) data = { USDT: "100000000" }
  else if (url.pathname.endsWith("/list")) data = []
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) })
})
await context.routeWebSocket(/\/ws\/v1/, ws => ws.onMessage(raw => { const frame = JSON.parse(String(raw)); if (frame.op === "authenticate") ws.send(JSON.stringify({ op: "authenticated", id: frame.id })); if (frame.op === "ping") ws.send(JSON.stringify({ op: "pong" })) }))
const page = await context.newPage()
page.on("pageerror", error => errors.push(error.message))
page.on("console", message => { if (message.type() === "error" && !/status of 503/.test(message.text())) errors.push(message.text()) })
const capture = name => page.screenshot({ path: path.join(out, name + ".png") })
const fit = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "page overflow")
const until = async predicate => { for (let n = 0; n < 100; n++) { if (predicate()) return; await page.waitForTimeout(30) } throw Error("fixture request not received") }
const posts = prefix => requests.filter(row => row.method === "POST" && row.path.startsWith(prefix))
const goto = suffix => page.goto("http://127.0.0.1:5183/" + suffix)
const identity = async value => page.evaluate(value => { if (value) localStorage.setItem("surprising-ex.session", JSON.stringify(value)); else localStorage.removeItem("surprising-ex.session"); window.dispatchEvent(new Event("surprising-ex.session-changed")) }, value)
let cdp
try {
  await goto("help")
  await page.locator(".help-article").first().waitFor()
  await page.locator(".help-featured button").first().click()
  assert.equal(await page.locator(".help-article > button").first().getAttribute("aria-expanded"), "true")
  assert(await page.locator(".help-article > button").first().evaluate(el => document.activeElement === el))
  await page.getByRole("region").filter({ hasText: "Full synthetic help body" }).waitFor()
  holdHelp = true
  await page.getByRole("textbox", { name: "Search help articles", exact: true }).fill("slow")
  await until(() => Boolean(releaseHelp))
  await page.getByRole("textbox", { name: "Search help articles", exact: true }).fill("fresh")
  await page.locator(".help-article > button").first().filter({ hasText: "fresh result" }).waitFor()
  holdHelp = false; releaseHelp()
  await page.waitForTimeout(100)
  assert(!(await page.locator(".help-articles").innerText()).includes("slow result"))
  failHelp = true
  await page.getByRole("textbox", { name: "Search help articles", exact: true }).fill("error")
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor()
  failHelp = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.locator(".help-article").first().waitFor()
  await page.getByRole("button", { name: "Clear search", exact: true }).click()
  await page.getByRole("button", { name: "Funding", exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.help-search button[aria-pressed=true]')?.textContent === "Funding")
  await page.locator(".help-article").first().waitFor(); await fit(); await capture("help-desktop-light")
  checks.push("help accordion/featured focus, debounced search, cancelled old results, error retry, clear search and category filtering")
  await goto("notifications")
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor()
  assert((await page.locator(".history-toolbar").innerText()).includes("—"))
  badNotifications = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await page.getByRole("heading", { name: "Synthetic security notice" }).waitFor()
  holdNotificationRead = true
  await page.getByRole("button", { name: "Mark read", exact: true }).evaluate(el => { el.click(); el.click() })
  await until(() => Boolean(releaseNotificationRead))
  assert.equal(posts("/api/v1/notifications/").length, 1)
  assert(await page.getByRole("checkbox", { name: "Unread only", exact: true }).isDisabled())
  holdNotificationRead = false; releaseNotificationRead()
  await page.getByText("Notification marked as read.", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Refresh", exact: true }).waitFor({ state: "visible" })
  notifications[0].readAt = null
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await page.getByRole("button", { name: "Mark read", exact: true }).waitFor()
  failAllNotifications = true
  await page.getByRole("button", { name: "Mark all read", exact: true }).click()
  await page.locator(".content-notice[role=alert]").waitFor()
  assert.equal(await page.getByRole("heading", { name: "Synthetic security notice" }).count(), 1)
  failAllNotifications = false
  await page.getByRole("button", { name: "Mark all read", exact: true }).click()
  await page.getByText("All notifications marked as read.", { exact: true }).waitFor()
  await page.getByRole("checkbox", { name: "Unread only", exact: true }).check()
  await page.getByText("No unread notifications.", { exact: true }).waitFor()
  await capture("notifications-empty-desktop-light")
  checks.push("invalid notification collection does not become zero/empty; exact-ID read is sent once; pending operations lock filter; read-all failure preserves messages and retry refreshes unread view")
  await goto("announcements")
  const first = () => page.locator(".announcement-list-item").filter({ hasText: "Announcement 0" })
  holdAnnouncement = true
  await first().click()
  await until(() => Boolean(releaseAnnouncement))
  await page.locator(".announcement-list-item").filter({ hasText: "Announcement 1" }).first().click()
  await page.locator(".announcement-detail h2").filter({ hasText: "Announcement 1" }).waitFor()
  holdAnnouncement = false; releaseAnnouncement()
  await page.waitForTimeout(100)
  assert((await page.locator(".announcement-detail h2").innerText()).endsWith("Announcement 1"))
  await fit(); await capture("announcements-desktop-light")
  assert(posts("/api/v1/announcements/").some(row => row.path.includes(id)))
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await page.locator(".announcement-list-item").filter({ hasText: "Announcement 50" }).waitFor()
  assert.equal(await page.locator(".announcement-list-item").count(), 1)
  await page.getByRole("button", { name: "Previous", exact: true }).click()
  await page.locator(".announcement-list-item").first().waitFor()
  failAnnouncement = true
  await page.locator(".announcement-list-item").filter({ hasText: "Announcement 2" }).first().click()
  await page.locator(".content-notice[role=alert]").waitFor()
  failAnnouncement = false
  await page.locator(".announcement-detail").getByRole("button", { name: "Mark read", exact: true }).click()
  await page.waitForFunction(() => !document.querySelector(".announcement-detail button[aria-busy=true]"))
  await page.getByRole("combobox", { name: "Language", exact: true }).click()
  await page.getByRole("option", { name: "简体中文", exact: true }).click()
  await page.locator(".announcement-list-item").first().filter({ hasText: "zh-CN:1:" }).waitFor()
  assert.equal(await page.locator(".announcement-detail h2").count(), 0)
  await identity({ ...session, user: { ...session.user, userId: "2" } })
  await page.locator(".announcement-list-item").first().filter({ hasText: "zh-CN:2:" }).waitFor()
  await identity(null)
  await page.locator(".announcement-list-item").first().filter({ hasText: "zh-CN:guest:" }).waitFor()
  const oldPosts = posts("/api/v1/announcements/").length
  await page.locator(".announcement-list-item").first().click()
  assert.equal(posts("/api/v1/announcements/").length, oldPosts)
  await capture("announcements-guest-desktop-light")
  checks.push("late read receipt cannot replace selected article; bounded pagination, failed read retry, locale/user resets, and guest reading without authenticated POSTs")
  await identity(session)
  await page.getByRole("combobox", { name: "语言", exact: true }).click()
  await page.getByRole("option", { name: "English", exact: true }).click()
  await page.locator(".announcement-list-item").first().filter({ hasText: "en-US:1:" }).waitFor()
  popup = true
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  const modal = page.getByRole("dialog", { name: "Important synthetic notice", exact: true })
  await modal.waitFor()
  await page.keyboard.press("Escape")
  await modal.waitFor({ state: "hidden" })
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await page.waitForTimeout(200)
  assert.equal(await modal.count(), 0)
  popupVersion = "2"
  await page.evaluate(() => { window.__denySeen = true; window.dispatchEvent(new Event("focus")) })
  await modal.waitFor()
  failPopup = true
  await modal.getByRole("button", { name: "Read and close", exact: true }).click()
  await modal.getByRole("alert").waitFor()
  failPopup = false
  await modal.getByRole("button", { name: "Read and close", exact: true }).click()
  await modal.waitFor({ state: "hidden" })
  popupVersion = "3"; popupRead = false
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await modal.waitFor()
  await modal.getByRole("link", { name: "Open announcement center", exact: true }).click()
  await modal.waitFor({ state: "hidden" })
  await page.getByRole("combobox", { name: "Language", exact: true }).click()
  await page.getByRole("option", { name: "简体中文", exact: true }).click()
  await page.locator(".announcement-list-item").first().filter({ hasText: "zh-CN:1:" }).waitFor()
  await page.waitForTimeout(150)
  assert.equal(await modal.count(), 0, "denied seen storage must not repeat the same version on language change")
  await page.getByRole("combobox", { name: "语言", exact: true }).click()
  await page.getByRole("option", { name: "English", exact: true }).click()
  await page.locator(".announcement-list-item").first().filter({ hasText: "en-US:1:" }).waitFor()
  popupRead = true
  checks.push("native announcement modal dismiss/focus, bounded seen-version tracking, denied storage, visible read failure and successful retry")
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await first().click(); await fit(); await capture("announcement-detail-mobile-" + width)
    await goto("help"); await page.locator(".help-featured button").first().click(); await fit(); await capture("help-mobile-" + width)
    notifications[0].readAt = null
    await goto("notifications"); await page.getByRole("heading", { name: "Synthetic security notice", exact: true }).waitFor(); await fit(); await capture("notifications-mobile-" + width)
    await goto("announcements"); await page.locator(".announcement-list-item").first().waitFor()
  }
  await page.evaluate(() => document.documentElement.dataset.theme = "dark")
  await first().click(); await fit(); await capture("announcements-mobile-dark")
  cdp = await context.newCDPSession(page); await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage")
  const samples = []
  for (let n = 0; n < 7; n++) { const metrics = await cdp.send("Performance.getMetrics"); samples.push(metrics.metrics.filter(row => ["JSHeapUsedSize", "Nodes", "JSEventListeners", "TaskDuration", "ScriptDuration", "LayoutCount", "RecalcStyleCount"].includes(row.name))); if (n < 6) await page.waitForTimeout(10_000) }
  await cdp.send("HeapProfiler.collectGarbage")
  const retained = await cdp.send("Performance.getMetrics")
  assert.deepEqual(errors, [])
  checks.push("1440/390/320 light/dark long-body layouts, repeat navigation and 60-second observation without unexpected page/console errors")
  await fs.writeFile(path.join(out, "result.json"), JSON.stringify({ checks, errors, samples, retained: retained.metrics.filter(row => ["JSHeapUsedSize", "Nodes", "JSEventListeners", "TaskDuration", "ScriptDuration", "LayoutCount", "RecalcStyleCount"].includes(row.name)), browser: browser.version(), fixtureOnly: true }, null, 2))
  console.log(JSON.stringify({ checks, errors, out }))
} catch (error) { await capture("client-failure"); await fs.writeFile(path.join(out, "failure.json"), JSON.stringify({ error: String(error), errors, checks, body: await page.locator("body").innerText() }, null, 2)); throw error }
finally { if (cdp) await cdp.detach(); await context.close(); await browser.close() }
