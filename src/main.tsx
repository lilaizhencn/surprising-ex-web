import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { restoreBrowserSession } from "./api/client"
import { App } from "./app/App"
import { t } from "./i18n"
import "./styles/global.css"
import "./components/layout/Navigation.css"
import { PageErrorBoundary } from "./components/layout/PageErrorBoundary"
import { readStoredValue } from "./lib/storage"

if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_RENDER_DEBUG === "true") {
  void import("react-grab")
  void import("react-scan")
}

const savedTheme = readStoredValue("surprising-ex.theme")
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
const THEME_KEY = "theme"
document.documentElement.dataset[THEME_KEY] =
  savedTheme === "dark" || (savedTheme === null && systemDark) ? "dark" : "light"

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
