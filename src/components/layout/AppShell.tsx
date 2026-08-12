import { type ReactNode, useEffect, useState } from "react"
import { authApi } from "../../api/endpoints"
import type { AuthSession } from "../../api/types"
import { loadSession, saveSession } from "../../state/session"
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
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())
  useEffect(() => {
    const onStorage = () => setSession(loadSession())
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  const logout = async () => {
    const refreshToken = session?.refreshToken
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {
    } finally {
      saveSession(null)
      setSession(null)
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
