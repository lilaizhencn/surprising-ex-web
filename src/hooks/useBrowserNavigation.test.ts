import { afterEach, describe, expect, it, vi } from "vitest"
import { loadSession, saveSession } from "../state/session"
import { isApplicationLink, navigateInApplication } from "./useBrowserNavigation"

afterEach(() => {
  saveSession(null)
  vi.unstubAllGlobals()
})

const current = new URL("https://exchange.example/trade/spot")
describe("application navigation ownership", () => {
  it("keeps account/product/query routes in the current document", () => {
    for (const path of ["/assets", "/trade/usd-perpetual", "/assets?account=spot", "/api"])
      expect(isApplicationLink(new URL(path, current), current)).toBe(true)
  })
  it("leaves external sites, API downloads, assets and hash navigation to the browser", () => {
    for (const path of [
      "https://other.example/assets",
      "/api/v1/export",
      "/assets/chart.png",
      "/help#fees",
      "mailto:support@example.com",
    ])
      expect(isApplicationLink(new URL(path, current), current)).toBe(false)
  })
  it("preserves the memory session across login redirects and account actions when storage is denied", () => {
    const events = new EventTarget()
    let location = new URL("https://exchange.example/auth/login")
    const update = (_data: unknown, _title: string, url: string) => {
      location = new URL(url)
    }
    const pushState = vi.fn(update)
    const replaceState = vi.fn(update)
    const scrollTo = vi.fn()
    vi.stubGlobal("window", {
      get location() {
        return location
      },
      history: { pushState, replaceState },
      dispatchEvent: events.dispatchEvent.bind(events),
      scrollTo,
      get localStorage() {
        throw new DOMException("denied", "SecurityError")
      },
    })
    saveSession({ accessToken: "current", user: { userId: "1" } })
    const routeChanged = vi.fn()
    events.addEventListener("surprising-ex.navigation", routeChanged)

    navigateInApplication("/assets", true)
    navigateInApplication("/assets/deposit?asset=USDT")

    expect(replaceState).toHaveBeenCalledOnce()
    expect(pushState).toHaveBeenCalledOnce()
    expect(routeChanged).toHaveBeenCalledTimes(2)
    expect(location.pathname).toBe("/assets/deposit")
    expect(location.search).toBe("?asset=USDT")
    expect(loadSession()?.user.userId).toBe("1")
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(() => navigateInApplication("https://outside.example/path")).toThrow("application route")
    expect(pushState).toHaveBeenCalledOnce()
  })
})
