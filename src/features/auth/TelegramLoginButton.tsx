import { Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { telegramApi, waitForTelegramLogin } from "../../api/telegram"
import type { AuthSession, LoginChallenge } from "../../api/types"
import { t } from "../../i18n"

export function TelegramLoginButton({
  onLogin,
  onError,
  disabled,
  onBusyChange,
}: {
  readonly onLogin: (result: AuthSession | LoginChallenge) => void
  readonly onError: (message: string) => void
  readonly disabled: boolean
  readonly onBusyChange: (busy: boolean) => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null)
  const popup = useRef<Window | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void telegramApi.config(controller.signal).then(
      (config) => setEnabled(config.enabled),
      () => {},
    )
    return () => {
      controller.abort()
      active.current?.abort()
      popup.current?.close()
    }
  }, [])

  const login = async () => {
    const controller = new AbortController()
    active.current = controller
    // Open synchronously from the gesture so browser popup protection permits it.
    const windowRef = window.open(
      "about:blank",
      "surprising-telegram",
      "popup,width=520,height=720",
    )
    if (!windowRef) {
      onError(t("Allow popups to sign in with Telegram."))
      return
    }
    popup.current = windowRef
    windowRef.opener = null
    setBusy(true)
    onBusyChange(true)
    try {
      const flow = await telegramApi.start(controller.signal)
      windowRef.location.replace(flow.authorizationUrl)
      const result = await waitForTelegramLogin(flow, controller.signal)
      if (!controller.signal.aborted) onLogin(result)
    } catch (error) {
      if (!controller.signal.aborted)
        onError(error instanceof Error ? t(error.message) : t("Telegram sign-in failed."))
    } finally {
      windowRef.close()
      if (!controller.signal.aborted) {
        setBusy(false)
        onBusyChange(false)
      }
    }
  }

  return busy ? (
    <button
      type="button"
      className="telegram-login-button"
      onClick={() => {
        active.current?.abort()
        popup.current?.close()
        setBusy(false)
        onBusyChange(false)
      }}
    >
      {t("Cancel Telegram sign-in")}
    </button>
  ) : (
    <button
      type="button"
      className="telegram-login-button"
      disabled={disabled || !enabled}
      onClick={() => void login()}
      title={!enabled ? t("Telegram login is not configured.") : undefined}
    >
      <Send size={18} aria-hidden="true" /> {t("Continue with Telegram")}
    </button>
  )
}
