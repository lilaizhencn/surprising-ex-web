import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { restoreBrowserSession } from "./api/client"
import { App } from "./app/App"
import { initializeLocale, t } from "./i18n"
import { BOOT_MESSAGES, normalizeLocale } from "./i18n/locales"
import { readStoredValue } from "./lib/storage"
import "./styles/global.css"
import "./components/layout/Navigation.css"
import { PageErrorBoundary } from "./components/layout/PageErrorBoundary"
import { initializeTheme } from "./state/theme"

if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_RENDER_DEBUG === "true") {
  void import("react-grab")
  void import("react-scan")
}

initializeTheme()

function applicationRoot(): HTMLElement {
  const element = document.getElementById("root")
  if (!element) throw new Error("Application root is missing")
  return element
}
const rootElement = applicationRoot()
let starting = false
async function start() {
  if (starting) return
  starting = true
  const messages = BOOT_MESSAGES[normalizeLocale(readStoredValue("surprising-ex.language"))]
  rootElement.textContent = messages.loading
  try {
    await initializeLocale()
  } catch {
    rootElement.textContent = messages.error + " "
    const retry = document.createElement("button")
    retry.type = "button"
    retry.textContent = messages.retry
    retry.onclick = () => {
      void start()
    }
    rootElement.append(retry)
    starting = false
    return
  }
  rootElement.textContent = t("Restoring your secure session…")
  await restoreBrowserSession()
  createRoot(rootElement).render(
    <StrictMode>
      <PageErrorBoundary>
        <App />
      </PageErrorBoundary>
    </StrictMode>,
  )
}
void start()
