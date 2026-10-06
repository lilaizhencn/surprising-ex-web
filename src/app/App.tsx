import { lazy, Suspense, useEffect, useState } from "react"
import { refreshStoredSession } from "../api/client"
import { AppShell } from "../components/layout/AppShell"
import { AssetsPage } from "../features/assets/AssetsPage"
import { FundingPage } from "../features/assets/FundingPage"
import { LedgerPage } from "../features/assets/LedgerPage"
import { AuthPage } from "../features/auth/AuthPage"
import { CompliancePage } from "../features/compliance/CompliancePage"
import { NotificationsPage } from "../features/notifications/NotificationsPage"
import { OrdersPage } from "../features/orders/OrdersPage"
import { HelpPage } from "../features/public/HelpPage"
import { HomePage } from "../features/public/HomePage"
import { MarketsPage } from "../features/public/MarketsPage"
import { AccountSecurityPage } from "../features/security/AccountSecurityPage"
import { DeveloperApiPage } from "../features/security/DeveloperApiPage"
import { DeviceManagementPage } from "../features/security/DeviceManagementPage"
import { t, useLocale } from "../i18n"
import { loadSession, saveSession, sessionAccessExpired, useSession } from "../state/session"

const TradePage = lazy(() =>
  import("../features/trading/TradePage").then((module) => ({ default: module.TradePage })),
)

export function App() {
  useLocale()
  const session = useSession()
  const [sessionReady, setSessionReady] = useState(() => !sessionAccessExpired(loadSession()))
  useEffect(() => {
    if (sessionReady) return
    let active = true
    void refreshStoredSession()
      .catch(() => saveSession(null))
      .finally(() => {
        if (active) setSessionReady(true)
      })
    return () => {
      active = false
    }
  }, [sessionReady])
  useEffect(() => {
    if (!session?.accessTokenExpiresAt) return
    const refreshAt = Date.parse(session.accessTokenExpiresAt) - Date.now() - 30_000
    if (!Number.isFinite(refreshAt)) return
    const timer = window.setTimeout(
      () => {
        void refreshStoredSession().catch(() => {})
      },
      Math.max(0, refreshAt),
    )
    return () => window.clearTimeout(timer)
  }, [session?.accessToken, session?.accessTokenExpiresAt])
  const path = window.location.pathname
  if (path.startsWith("/auth/"))
    return (
      <AppShell>
        <AuthPage mode={authMode(path)} />
      </AppShell>
    )
  if (path === "/")
    return (
      <AppShell showFooter>
        <HomePage />
      </AppShell>
    )
  if (path === "/markets")
    return (
      <AppShell>
        <MarketsPage />
      </AppShell>
    )
  if (path.startsWith("/trade/") && isSupportedTradeRoute(path.slice("/trade/".length)))
    return (
      <AppShell>
        <Suspense fallback={<div className="container section" aria-busy="true" />}>
          <TradePage productKey={path.slice("/trade/".length)} />
        </Suspense>
      </AppShell>
    )
  if (!sessionReady)
    return (
      <AppShell>
        <div className="container section" aria-busy="true" />
      </AppShell>
    )
  if (path === "/assets")
    return (
      <AppShell accountArea>
        <AssetsPage account={new URLSearchParams(window.location.search).get("account")} />
      </AppShell>
    )
  if (path === "/assets/ledger")
    return (
      <AppShell accountArea>
        <LedgerPage />
      </AppShell>
    )
  if (path === "/assets/deposit")
    return (
      <AppShell accountArea>
        <FundingPage mode="deposit" />
      </AppShell>
    )
  if (path === "/assets/withdraw")
    return (
      <AppShell accountArea>
        <FundingPage mode="withdraw" />
      </AppShell>
    )
  if (path === "/assets/transfer")
    return (
      <AppShell accountArea>
        <FundingPage mode="transfer" />
      </AppShell>
    )
  if (path === "/security" || path === "/account/security" || path === "/security/account")
    return (
      <AppShell accountArea>
        <AccountSecurityPage />
      </AppShell>
    )
  if (path === "/security/devices")
    return (
      <AppShell accountArea>
        <DeviceManagementPage />
      </AppShell>
    )
  if (path === "/api")
    return (
      <AppShell accountArea>
        <DeveloperApiPage />
      </AppShell>
    )
  if (path === "/compliance" || path === "/account/kyc")
    return (
      <AppShell accountArea>
        <CompliancePage />
      </AppShell>
    )
  if (path === "/compliance/verify" || path === "/account/kyc/verify")
    return (
      <AppShell accountArea>
        <CompliancePage flow />
      </AppShell>
    )
  if (path === "/orders" || path === "/assets/orders")
    return (
      <AppShell accountArea>
        <OrdersPage />
      </AppShell>
    )
  if (path === "/notifications")
    return (
      <AppShell>
        <NotificationsPage />
      </AppShell>
    )
  if (path === "/help")
    return (
      <AppShell showFooter>
        <HelpPage />
      </AppShell>
    )
  return (
    <AppShell>
      <NotFoundPage />
    </AppShell>
  )
}

function authMode(path: string): "login" | "register" | "forgot" | "reset" | "verify" {
  if (path === "/auth/register") return "register"
  if (path === "/auth/reset-password") return "reset"
  if (path === "/auth/forgot-password") return "forgot"
  if (path === "/auth/verify-email") return "verify"
  return "login"
}

function isSupportedTradeRoute(productKey: string): boolean {
  return new Set([
    "spot",
    "usd-perpetual",
    "usd-m-perpetuals",
    "coin-perpetual",
    "coin-m-perpetuals",
    "delivery-futures",
    "coin-m-delivery",
    "options",
  ]).has(productKey)
}

function NotFoundPage() {
  return (
    <div className="container section">
      <div className="not-found">
        <span className="eyebrow">404</span>
        <h1>{t("Page not found")}</h1>
        <p>{t("The requested route is not part of the current Surprising EX workspace.")}</p>
        <a className="route-link" href="/">
          {" "}
          {t("Return home")}{" "}
        </a>
      </div>
    </div>
  )
}
