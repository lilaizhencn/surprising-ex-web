import { describe, expect, it } from "vitest"
import { AnnouncementPageSchema, NotificationListSchema } from "./types"

const announcement = {
  announcementId: "9007199254740993",
  version: "9223372036854775807",
  category: "SECURITY",
  title: "Synthetic title",
  summary: "",
  body: "Synthetic body",
  startsAt: "2026-10-01T00:00:00Z",
  expiresAt: null,
  readAt: null,
}
describe("public content response boundaries", () => {
  it("keeps exact announcement/version and notification IDs", () => {
    const page = AnnouncementPageSchema.parse({
      announcements: [announcement],
      unreadCount: 1,
      offset: 0,
      limit: 50,
      hasMore: false,
    })
    expect(page.announcements[0]?.announcementId).toBe("9007199254740993")
    expect(page.announcements[0]?.version).toBe("9223372036854775807")
    expect(
      NotificationListSchema.parse([
        {
          notificationId: "9007199254740993",
          category: "SECURITY",
          title: "Title",
          body: "Body",
          readAt: null,
          createdAt: "2026-10-01T00:00:00Z",
        },
      ])[0]?.notificationId,
    ).toBe("9007199254740993")
  })
  it("rejects missing, duplicate, inconsistent and malformed announcement pages", () => {
    const page = {
      announcements: [announcement],
      unreadCount: 1,
      offset: 0,
      limit: 50,
      hasMore: false,
    }
    for (const value of [
      {},
      { ...page, announcements: [announcement, announcement] },
      { ...page, unreadCount: -1 },
      { ...page, announcements: [], hasMore: true },
      { ...page, announcements: [{ ...announcement, category: "UNKNOWN" }] },
      { ...page, announcements: [{ ...announcement, startsAt: "bad" }] },
    ])
      expect(AnnouncementPageSchema.safeParse(value).success).toBe(false)
  })
  it("does not display malformed notification rows as empty or already read", () => {
    const row = {
      notificationId: 1,
      category: "SYSTEM",
      title: "Title",
      body: "Body",
      readAt: null,
      createdAt: "2026-10-01T00:00:00Z",
    }
    for (const value of [
      {},
      [row, row],
      [{ ...row, notificationId: 9007199254740992 }],
      [{ ...row, readAt: "" }],
      [{ ...row, title: "" }],
    ])
      expect(NotificationListSchema.safeParse(value).success).toBe(false)
  })
})
