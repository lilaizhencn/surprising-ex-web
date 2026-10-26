import { useEffect, useState } from "react"

export function isApplicationLink(url: URL, current: URL): boolean {
  return (
    url.origin === current.origin &&
    /^https?:$/.test(url.protocol) &&
    !url.hash &&
    !url.pathname.startsWith("/api/") &&
    !/\.[a-z0-9]+$/i.test(url.pathname)
  )
}
const navigationEvent = "surprising-ex.navigation"
export function navigateInApplication(path: string, replace = false): void {
  const url = new URL(path, window.location.href)
  if (!isApplicationLink(url, new URL(window.location.href)))
    throw new Error("Expected an application route")
  if (replace) window.history.replaceState(null, "", url.href)
  else window.history.pushState(null, "", url.href)
  window.dispatchEvent(new Event(navigationEvent))
  window.scrollTo(0, 0)
}

const currentRoute = () =>
  typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`

/** Keep one application/socket across ordinary internal links; preserve native browser gestures. */
export function useBrowserNavigation(): string {
  const [location, setLocation] = useState(currentRoute)
  useEffect(() => {
    const syncLocation = () => setLocation(currentRoute())
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return
      const url = new URL(anchor.href)
      if (!isApplicationLink(url, new URL(window.location.href))) return
      event.preventDefault()
      if (url.href === window.location.href) return
      navigateInApplication(url.href)
    }
    window.addEventListener("popstate", syncLocation)
    window.addEventListener(navigationEvent, syncLocation)
    document.addEventListener("click", navigate)
    // A child can redirect during its mount effect before these listeners exist.
    syncLocation()
    return () => {
      document.removeEventListener("click", navigate)
      window.removeEventListener("popstate", syncLocation)
      window.removeEventListener(navigationEvent, syncLocation)
    }
  }, [])
  return location
}
