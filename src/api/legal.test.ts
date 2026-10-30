import { describe, expect, it } from "vitest"
import { LegalDocumentSchema } from "./legal"

const document = {
  revisionId: "9223372036854775807",
  type: "USER_AGREEMENT",
  slug: "user-agreement",
  revisionLabel: "2026-10-31.1",
  locale: "ar-SA",
  title: "اتفاقية المستخدم",
  bodyHtml: "<p>الشروط</p>",
  registrationRequired: true,
  publishedAt: "2026-10-31T00:00:00Z",
}
describe("public legal document boundary", () => {
  it("preserves exact revision IDs and the actual reading language", () => {
    expect(LegalDocumentSchema.parse(document)).toEqual(document)
  })
  it.each([
    { revisionId: "9223372036854775808" },
    { revisionId: 9007199254740992 },
    { locale: "xx-XX" },
    { title: "" },
    { bodyHtml: "" },
    { publishedAt: "invalid" },
  ])("rejects malformed legal content", (patch) => {
    expect(LegalDocumentSchema.safeParse({ ...document, ...patch }).success).toBe(false)
  })
})
