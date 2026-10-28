const key = "surprising.affiliate.invitation"
export function invitationCode(): string {
  const incoming = new URLSearchParams(window.location.search).get("invite")
  if (incoming !== null) {
    try {
      sessionStorage.setItem(key, incoming)
    } catch {
      /* URL remains authoritative. */
    }
    return incoming
  }
  try {
    return sessionStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}
export function clearInvitation() {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* No persistence to clear. */
  }
}
export function invitationLink(code: string) {
  return `${window.location.origin}/affiliate?invite=${encodeURIComponent(code)}`
}
