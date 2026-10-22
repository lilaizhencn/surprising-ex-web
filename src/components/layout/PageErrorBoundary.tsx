import { Component, type ErrorInfo, type ReactNode } from "react"
import { t } from "../../i18n"

/** Rendering and stale deployment chunks share one explicit, user-driven recovery. */
export class PageErrorBoundary extends Component<
  { readonly children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page failed to load", error, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="container section" role="alert">
        <h1>{t("This page could not be loaded.")}</h1>
        <p>
          {t(
            "Check your connection, then reload the page. Your submitted orders are not repeated.",
          )}
        </p>
        <button
          type="button"
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          {t("Reload page")}
        </button>{" "}
        <a className="button button-outline" href="/">
          {t("Back to home")}
        </a>
      </main>
    )
  }
}
