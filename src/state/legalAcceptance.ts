export type LegalAcceptance = { readonly revisionId: string; readonly locale: string }
let choices: readonly LegalAcceptance[] = []
let reviewRequired = false
const listeners = new Set<() => void>()
export function setLegalAcceptance(next: readonly LegalAcceptance[]) {
  choices = next.map((item) => ({ ...item }))
}
export function legalAcceptanceHeader(): string {
  return choices.map((item) => `${item.revisionId}:${item.locale}`).join(",")
}
export function requireLegalReview() {
  reviewRequired = true
  for (const listener of listeners) listener()
}
export function clearLegalReview() {
  reviewRequired = false
  setLegalAcceptance([])
  for (const listener of listeners) listener()
}
export const legalReviewStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot: () => reviewRequired,
}
