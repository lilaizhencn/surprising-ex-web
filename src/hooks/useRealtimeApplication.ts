import { useLayoutEffect, useRef } from "react"
import { loadRuntimeProducts } from "../api/endpoints"
import type { AuthSession } from "../api/types"
import { config } from "../lib/config"
import { privateSubscriptions } from "../realtime"
import { retainRealtimeSession } from "../sharedRealtimeConnections"

/** App owns one transport for its full lifetime, including public and login pages. */
export function useRealtimeApplication(session: AuthSession | null) {
  const owner = useRef<ReturnType<typeof retainRealtimeSession> | null>(null)
  const initialToken = useRef(session?.accessToken ?? null)
  useLayoutEffect(() => {
    const handle = retainRealtimeSession(config.wsBaseUrlForProductLine, initialToken.current)
    owner.current = handle
    handle.update([])
    return () => {
      owner.current = null
      handle.close()
    }
  }, [])
  const token = session?.accessToken ?? null
  useLayoutEffect(() => {
    const handle = owner.current
    if (!handle) return
    let active = true
    handle.updateToken(token)
    if (token)
      void loadRuntimeProducts()
        .then((products) => {
          if (active) handle.update(privateSubscriptions(products))
        })
        .catch(() => {
          /* Page account feeds surface product availability errors. */
        })
    return () => {
      active = false
    }
  }, [token])
}
