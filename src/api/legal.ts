import { z } from "zod"
import { LOCALES } from "../i18n/locales"
import { request } from "./client"

const Id = z
  .union([
    z.string().regex(/^[1-9]\d{0,18}$/),
    z.number().int().positive().refine(Number.isSafeInteger),
  ])
  .transform(String)
  .refine((value) => BigInt(value) <= 9223372036854775807n)
export const LegalDocumentSchema = z.object({
  revisionId: Id,
  type: z.string().max(64),
  slug: z.string().regex(/^[a-z-]{1,64}$/),
  revisionLabel: z.string().max(40),
  locale: z.string().refine((value) => LOCALES.some((item) => item.tag === value)),
  title: z.string().min(1).max(160),
  bodyHtml: z.string().min(1).max(64000),
  registrationRequired: z.boolean(),
  publishedAt: z.string().datetime({ offset: true }),
})
export type LegalDocument = z.infer<typeof LegalDocumentSchema>
const DocumentList = z
  .array(LegalDocumentSchema)
  .max(10)
  .refine((items) => new Set(items.map((item) => item.type)).size === items.length)
export const legalApi = {
  current: (locale: string, signal?: AbortSignal) =>
    request(
      `/api/v1/legal/current?locale=${encodeURIComponent(locale)}`,
      DocumentList,
      signal ? { signal } : {},
    ),
  revision: (id: string, locale: string, signal?: AbortSignal) =>
    request(
      `/api/v1/legal/revisions/${id}?locale=${encodeURIComponent(locale)}`,
      LegalDocumentSchema,
      signal ? { signal } : {},
    ),
}
