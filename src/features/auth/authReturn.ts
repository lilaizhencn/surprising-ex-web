/** Only explicitly supported application entry points are accepted as authentication return targets. */
export function authReturnPath(search: string): string {
  const target = new URLSearchParams(search).get("redirect")
  return target === "/affiliate" || target === "/c2c" || target === "/c2c/messages"
    ? target
    : "/assets"
}

export function authDestination(
  requiresEmailVerification: boolean | undefined,
  search: string,
): string {
  const target = authReturnPath(search)
  return requiresEmailVerification
    ? `/auth/verify-email${target === "/assets" ? "" : `?redirect=${encodeURIComponent(target)}`}`
    : target
}
