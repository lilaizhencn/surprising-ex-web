import { lazy, Suspense } from "react"
import { AppShell } from "../components/layout/AppShell"
import { AnnouncementsPage } from "../features/announcements/AnnouncementsPage"
import { LegalPage } from "../features/legal/LegalPage"
import { LegalUpdateDialog } from "../features/legal/LegalUpdateDialog"
import { HomePage } from "../features/public/HomePage"
import { MarketsPage } from "../features/public/MarketsPage"
import { useBrowserNavigation } from "../hooks/useBrowserNavigation"
import { useRealtimeApplication } from "../hooks/useRealtimeApplication"
import { t, useLocale } from "../i18n"
import { useSession } from "../state/session"

const AffiliatePage = lazy(() =>
  import("../features/affiliate/AffiliatePage").then((module) => ({
    default: module.AffiliatePage,
  })),
)
const AssetsPage = lazy(() =>
  import("../features/assets/AssetsPage").then((module) => ({ default: module.AssetsPage })),
)
const C2cPage = lazy(() =>
  import("../features/c2c/C2cTradingPage").then((module) => ({ default: module.C2cTradingPage })),
)
const FundingPage = lazy(() =>
  import("../features/assets/FundingPage").then((module) => ({ default: module.FundingPage })),
)
const LedgerPage = lazy(() =>
  import("../features/assets/LedgerPage").then((module) => ({ default: module.LedgerPage })),
)
const AuthPage = lazy(() =>
  import("../features/auth/AuthPage").then((module) => ({ default: module.AuthPage })),
)
const CompliancePage = lazy(() =>
  import("../features/compliance/CompliancePage").then((module) => ({
    default: module.CompliancePage,
  })),
)
const NotificationsPage = lazy(() =>
  import("../features/notifications/NotificationsPage").then((module) => ({
    default: module.NotificationsPage,
  })),
)
const OrdersPage = lazy(() =>
  import("../features/orders/OrdersPage").then((module) => ({ default: module.OrdersPage })),
)
const HelpPage = lazy(() =>
  import("../features/public/HelpPage").then((module) => ({ default: module.HelpPage })),
)
const AccountSecurityPage = lazy(() =>
  import("../features/security/AccountSecurityPage").then((module) => ({
    default: module.AccountSecurityPage,
  })),
)
const DeveloperApiPage = lazy(() =>
  import("../features/security/DeveloperApiPage").then((module) => ({
    default: module.DeveloperApiPage,
  })),
)
const DevelopersPage = lazy(() =>
  import("../features/developers/DevelopersPage").then((module) => ({
    default: module.DevelopersPage,
  })),
)
const DeviceManagementPage = lazy(() =>
  import("../features/security/DeviceManagementPage").then((module) => ({
    default: module.DeviceManagementPage,
  })),
)

const TradePage = lazy(() =>
  import("../features/trading/TradePage").then((module) => ({ default: module.TradePage })),
)
const VipTierPage = lazy(() =>
  import("../features/vip/VipTierPage").then((module) => ({
    default: module.VipTierPage,
  })),
)
const SubAccountPage = lazy(() =>
  import("../features/account/SubAccountPage").then((module) => ({
    default: module.SubAccountPage,
  })),
)
const ProofOfReservesPage = lazy(() =>
  import("../features/compliance/ProofOfReservesPage").then((module) => ({
    default: module.ProofOfReservesPage,
  })),
)

export function App() {
  const location = useBrowserNavigation()
  useRealtimeApplication(useSession())
  return (
    <>
      <LegalUpdateDialog />
      <Suspense
        fallback={
          <AppShell>
            <div className="container section" aria-busy="true" />
          </AppShell>
        }
      >
        <AppRoutes key={location} />
      </Suspense>
    </>
  )
}

function AppRoutes() {
  useLocale()
  const session = useSession()
  const path = window.location.pathname
  if (path === "/legal" || path.startsWith("/legal/"))
    return (
      <AppShell>
        <LegalPage />
      </AppShell>
    )
  if (path === "/developers")
    return (
      <AppShell>
        <DevelopersPage />
      </AppShell>
    )
  if (path.startsWith("/auth/"))
    return (
      <AppShell>
        <AuthPage mode={authMode(path)} />
      </AppShell>
    )
  if (path === "/")
    return (
      <AppShell>
        <HomePage />
      </AppShell>
    )
  if (path === "/markets")
    return (
      <AppShell>
        <MarketsPage />
      </AppShell>
    )
  if (path === "/proof-of-reserves" || path === "/por")
    return (
      <AppShell>
        <ProofOfReservesPage />
      </AppShell>
    )
  if (path === "/vip")
    return (
      <AppShell>
        <VipTierPage />
      </AppShell>
    )
  if (path.startsWith("/trade/") && isSupportedTradeRoute(path.slice("/trade/".length)))
    return (
      <AppShell showFooter={false}>
        <Suspense fallback={<div className="container section" aria-busy="true" />}>
          <TradePage productKey={path.slice("/trade/".length)} />
        </Suspense>
      </AppShell>
    )
  if (path === "/affiliate")
    return (
      <AppShell accountArea>
        <AffiliatePage key={String(session?.user.userId ?? "guest")} />
      </AppShell>
    )
  if (path === "/assets")
    return (
      <AppShell accountArea>
        <AssetsPage account={new URLSearchParams(window.location.search).get("account")} />
      </AppShell>
    )
  if (path === "/c2c" || path === "/c2c/messages")
    return (
      <AppShell>
        <C2cPage />
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
  if (path === "/sub-accounts" || path === "/account/sub-accounts")
    return (
      <AppShell accountArea>
        <SubAccountPage />
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
  if (path === "/announcements")
    return (
      <AppShell>
        <AnnouncementsPage />
      </AppShell>
    )
  if (path === "/help")
    return (
      <AppShell>
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
