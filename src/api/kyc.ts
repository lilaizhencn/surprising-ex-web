import { z } from "zod"
import { request } from "./client"

const CountrySchema = z.object({
  code: z.string(),
  flag: z.string(),
  names: z.object({ en: z.string(), zh: z.string() }),
})
export type Country = z.infer<typeof CountrySchema>
export function loadCountries(signal: AbortSignal) {
  return request("/api/v1/compliance/countries", z.array(CountrySchema), { signal })
}
export function deleteKycDraft(documentId: number) {
  return request(`/api/v1/compliance/kyc/documents/${documentId}`, z.null(), { method: "DELETE" })
}
