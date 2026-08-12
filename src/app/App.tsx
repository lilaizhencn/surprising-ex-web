import { AppShell } from "../components/layout/AppShell"
import { AssetsPage } from "../features/assets/AssetsPage"
import { FundingPage } from "../features/assets/FundingPage"
import { AuthPage } from "../features/auth/AuthPage"
import { CompliancePage } from "../features/compliance/CompliancePage"
import { NotificationsPage } from "../features/notifications/NotificationsPage"
import { OrdersPage } from "../features/orders/OrdersPage"
import { HelpPage } from "../features/public/HelpPage"
import { HomePage } from "../features/public/HomePage"
import { MarketsPage } from "../features/public/MarketsPage"
import { SecurityPage } from "../features/security/SecurityPage"
import { TradePage } from "../features/trading/TradePage"

export function App() {
  const path = window.location.pathname
  if (path.startsWith("/auth/")) return <AuthPage mode={authMode(path)} />
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
        <TradePage productKey={path.slice("/trade/".length)} />
      </AppShell>
    )
  if (path === "/assets")
    return (
      <AppShell accountArea>
        <AssetsPage />
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
  if (path === "/security" || path === "/account/security")
    return (
      <AppShell accountArea>
        <SecurityPage />
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
        <h1>Page not found</h1>
        <p>The requested route is not part of the current Surprising EX workspace.</p>
        <a className="route-link" href="/">
          Return home
        </a>
      </div>
    </div>
  )
}
