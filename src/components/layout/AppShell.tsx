import { type ReactNode, useEffect, useRef } from "react"
import { authApi } from "../../api/endpoints"
import { saveSession, useSession } from "../../state/session"
import { AccountSidebar } from "./AccountSidebar"
import { Footer } from "./Footer"
import { TopNav } from "./TopNav"

export function AppShell({
  children,
  showFooter = false,
  accountArea = false,
}: {
  readonly children: ReactNode
  readonly showFooter?: boolean
  readonly accountArea?: boolean
}) {
  const session = useSession()
  const redirectingRef = useRef(false)
  useEffect(() => {
    if (accountArea && !session && !redirectingRef.current) {
      window.location.replace("/auth/login?reason=session-expired")
    }
  }, [accountArea, session])
  const logout = async () => {
    const refreshToken = session?.refreshToken
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {
    } finally {
      redirectingRef.current = true
      saveSession(null)
      window.location.href = "/"
    }
  }
  return (
    <div className="app-shell">
      <TopNav session={session} onLogout={logout} />
      {accountArea ? (
        <div className="account-layout">
          <AccountSidebar />
          <main className="account-main">{children}</main>
        </div>
      ) : (
        <main className="page">{children}</main>
      )}
      {showFooter ? <Footer /> : null}
    </div>
  )
}
