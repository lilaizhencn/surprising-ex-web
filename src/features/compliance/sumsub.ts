import { t } from "../../i18n"

export type SumsubInstance = { launch: (selector: string) => void; destroy: () => void }
type SumsubBuilder = {
  withConf: (conf: Record<string, unknown>) => SumsubBuilder
  on: (event: string, callback: () => void) => SumsubBuilder
  build: () => SumsubInstance
}
export async function launchSumsub(
  token: string,
  refresh: () => Promise<string>,
  onComplete: () => void,
  onError: (message: string) => void,
  signal: AbortSignal,
): Promise<SumsubInstance> {
  signal.throwIfAborted()
  const w = window as typeof window & {
    snsWebSdk?: { init: (token: string, refresh: () => Promise<string>) => SumsubBuilder }
  }
  if (!w.snsWebSdk) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      const cleanup = () => {
        window.clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        script.onload = null
        script.onerror = null
      }
      const fail = () => {
        cleanup()
        script.remove()
        reject(new Error(t("Verification service failed to load. Please retry.")))
      }
      const abort = () => {
        cleanup()
        script.remove()
        reject(signal.reason)
      }
      const timer = window.setTimeout(fail, 15_000)
      script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js"
      script.onload = () => {
        cleanup()
        resolve()
      }
      script.onerror = fail
      signal.addEventListener("abort", abort, { once: true })
      document.head.append(script)
    })
  }
  signal.throwIfAborted()
  if (!w.snsWebSdk) throw new Error(t("Verification service failed to load. Please retry."))
  const instance = w.snsWebSdk
    .init(token, async () => {
      signal.throwIfAborted()
      const next = await refresh()
      signal.throwIfAborted()
      return next
    })
    .withConf({})
    .on("idCheck.onApplicantSubmitted", () => {
      if (!signal.aborted) onComplete()
    })
    .on("idCheck.onError", () => {
      if (!signal.aborted) onError(t("Verification could not be completed. Please retry."))
    })
    .build()
  try {
    instance.launch("#sumsub-websdk-container")
  } catch (reason) {
    instance.destroy()
    throw reason
  }
  return instance
}
