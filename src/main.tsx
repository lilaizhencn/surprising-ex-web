import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { restoreBrowserSession } from "./api/client"
import { App } from "./app/App"
import { t } from "./i18n"
import "./styles/global.css"
import "./components/layout/Navigation.css"
import { PageErrorBoundary } from "./components/layout/PageErrorBoundary"
import { initializeTheme } from "./state/theme"

if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_RENDER_DEBUG === "true") {
  void import("react-grab")
  void import("react-scan")
}

initializeTheme()

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Application root is missing")
rootElement.textContent = t("Restoring your secure session…")
void restoreBrowserSession().finally(() =>
  createRoot(rootElement).render(
    <StrictMode>
      <PageErrorBoundary>
        <App />
      </PageErrorBoundary>
    </StrictMode>,
  ),
)
