import { describe, expect, it, vi } from "vitest"
import {
  C2cMessageSchema,
  loadC2cMessages,
  loadC2cOrders,
  mergeC2cMessages,
  readC2cMessages,
  uploadC2cAttachment,
} from "./c2c"
import { request } from "./client"

vi.mock("./client", () => ({ request: vi.fn(), requestBlob: vi.fn() }))

const message = (messageId: string) =>
  C2cMessageSchema.parse({
    messageId,
    conversationId: "conversation",
    requestId: "request",
    senderUserId: "9223372036854775806",
    authorKind: "USER",
    text: "hello",
    attachment: null,
    createdAt: "2026-10-20T00:00:00Z",
    status: "SENT",
  })

describe("C2C API contracts", () => {
  it("preserves exact IDs when history and replay overlap", () => {
    expect(
      mergeC2cMessages(
        [message("9223372036854775806")],
        [message("9223372036854775805"), message("9223372036854775806")],
      ).map((value) => value.messageId),
    ).toEqual(["9223372036854775805", "9223372036854775806"])
    expect(() => message("1e18")).toThrow()
  })
  it("opens the most recent page and retains string cursors for older pages", () => {
    loadC2cMessages("12", "conversation", { latest: true })
    expect(request).toHaveBeenLastCalledWith(
      "/api/v1/c2c/conversations/conversation/messages?limit=50&latest=true",
      expect.anything(),
      { expectedUserId: "12" },
    )
    loadC2cMessages("12", "conversation", { before: "9223372036854775806" })
    expect(request).toHaveBeenLastCalledWith(
      "/api/v1/c2c/conversations/conversation/messages?limit=50&before=9223372036854775806",
      expect.anything(),
      { expectedUserId: "12" },
    )
  })
  it("lists all actual order states and sends read markers as strings", () => {
    loadC2cOrders("12", 30)
    expect(request).toHaveBeenLastCalledWith(
      "/api/v1/c2c/orders?state=ALL&limit=30&offset=30",
      expect.anything(),
      { expectedUserId: "12" },
    )
    readC2cMessages("12", "conversation", "9223372036854775806", "9223372036854775805")
    expect(request).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), {
      method: "POST",
      body: { messageId: "9223372036854775806", eventId: "9223372036854775805" },
      expectedUserId: "12",
    })
  })
  it("uploads through the authenticated gateway with a fixed identity and order scope", () => {
    const file = new File(["content"], "proof.pdf", { type: "application/pdf" })
    uploadC2cAttachment(
      "12",
      {
        conversationId: "conversation",
        orderId: "order",
        peer: { userId: "11", nickname: "Maker" },
        unreadCount: "0",
        lastMessage: null,
      },
      "fixed-attachment",
      file,
    )
    const options = vi.mocked(request).mock.lastCall?.[2]
    expect(vi.mocked(request).mock.lastCall?.[0]).toBe("/api/v1/c2c/attachments/fixed-attachment")
    expect(options?.expectedUserId).toBe("12")
    const body = options?.body as FormData
    expect([
      body.get("purpose"),
      body.get("conversationId"),
      body.get("orderId"),
      (body.get("file") as File).name,
    ]).toEqual(["MESSAGE", "conversation", "order", "proof.pdf"])
  })
})
