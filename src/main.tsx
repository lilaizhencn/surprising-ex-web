import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app/App"
import "./styles/global.css"

if (import.meta.env.DEV) {
  void import("react-grab")
  void import("react-scan")
}

const savedTheme = window.localStorage.getItem("surprising-ex.theme")
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
const THEME_KEY = "theme"
document.documentElement.dataset[THEME_KEY] =
  savedTheme === "dark" || (savedTheme === null && systemDark) ? "dark" : "light"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Application root is missing")
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
