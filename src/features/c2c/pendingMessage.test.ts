import { afterEach, describe, expect, it, vi } from "vitest"
import { recoverC2cMessage, sendC2cMessage } from "../../api/c2c"
import { deliverMessage, forgetMessage, pendingMessage, rememberMessage } from "./pendingMessage"

vi.mock("../../api/c2c", async (original) => ({
  ...(await original<typeof import("../../api/c2c")>()),
  recoverC2cMessage: vi.fn(),
  sendC2cMessage: vi.fn(),
}))
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
const body = {
  requestId: "10000000-0000-4000-8000-000000000001",
  text: "Original payment discussion",
  attachmentId: null,
}
const sent = {
  requestId: body.requestId,
  text: body.text,
  messageId: "9223372036854775806",
  conversationId: "one",
  senderUserId: "12",
  authorKind: "USER" as const,
  attachment: null,
  createdAt: "2026-10-20T00:00:00Z",
  status: "SENT" as const,
}
describe("uncertain C2C sends", () => {
  it("keeps the original identity across a page reload and isolates each owner and conversation", () => {
    const values = new Map<string, string>()
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    })
    rememberMessage("12", "one", body)
    expect(pendingMessage("12", "one")).toEqual(body)
    expect(pendingMessage("13", "one")).toBeNull()
    expect(pendingMessage("12", "two")).toBeNull()
    forgetMessage("12", "one")
    expect(pendingMessage("12", "one")).toBeNull()
  })
  it("does not submit again when the original response was lost after commit", async () => {
    vi.mocked(recoverC2cMessage).mockResolvedValue({ status: "SENT", message: sent })
    await expect(deliverMessage("12", "one", body, true)).resolves.toEqual(sent)
    expect(sendC2cMessage).not.toHaveBeenCalled()
  })
  it("retries the exact original body only after an unknown receipt", async () => {
    vi.mocked(recoverC2cMessage).mockResolvedValue({ status: "UNKNOWN" })
    vi.mocked(sendC2cMessage).mockResolvedValue(sent)
    await deliverMessage("12", "one", body, true)
    expect(sendC2cMessage).toHaveBeenCalledExactlyOnceWith("12", "one", body)
  })
  it("does not send if recovery itself is unavailable or returns a malformed committed message", async () => {
    vi.mocked(recoverC2cMessage).mockRejectedValueOnce(new Error("offline"))
    await expect(deliverMessage("12", "one", body, true)).rejects.toThrow("offline")
    vi.mocked(recoverC2cMessage).mockResolvedValueOnce({ status: "SENT" })
    await expect(deliverMessage("12", "one", body, true)).rejects.toThrow()
    expect(sendC2cMessage).not.toHaveBeenCalled()
  })
})
