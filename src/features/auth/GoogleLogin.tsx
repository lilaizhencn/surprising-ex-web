import { useEffect, useRef, useState } from "react"
import { authApi } from "../../api/endpoints"
import { googleApi } from "../../api/google"
import { type AuthSession, type LoginChallenge, LoginChallengeSchema } from "../../api/types"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t, useLocale } from "../../i18n"
import { saveSession } from "../../state/session"
import { clearInvitation, invitationCode } from "../affiliate/invitation"
import { authDestination } from "./authReturn"
import { loadGoogleIdentity } from "./googleIdentity"
import { LoginVerificationDialog, verificationMessage } from "./LoginVerificationDialog"
import "./GoogleLogin.css"

export function GoogleLogin({
  oneTapOnly = false,
  disabled = false,
  onLogin,
  onBusyChange,
  onError,
  inviteCode,
}: {
  readonly inviteCode?: string
  readonly oneTapOnly?: boolean
  readonly disabled?: boolean
  readonly onLogin?: (result: AuthSession | LoginChallenge) => void
  readonly onBusyChange?: (busy: boolean) => void
  readonly onError?: (message: string) => void
}) {
  const button = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ disabled, onLogin, onBusyChange, onError, inviteCode })
  callbacks.current = { disabled, onLogin, onBusyChange, onError, inviteCode }
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "disabled" | "error">("loading")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null)
  const locale = useLocale()

  const accept = (result: AuthSession | LoginChallenge) => {
    clearInvitation()
    if (callbacks.current.onLogin) return callbacks.current.onLogin(result)
    if ("requiresVerification" in result) {
      setChallenge(LoginChallengeSchema.parse(result))
      return
    }
    saveSession(result)
    navigateInApplication(authDestination(result.requiresEmailVerification, window.location.search))
  }
  const acceptRef = useRef(accept)
  acceptRef.current = accept
  // biome-ignore lint/correctness/useExhaustiveDependencies: Each explicit retry must replace the single-use nonce.
  useEffect(() => {
    const controller = new AbortController()
    let timer = 0
    let stopObserving = () => {}
    let pending = false
    let submitted = false
    const report = (error: unknown) => {
      if (controller.signal.aborted) return
      const text = verificationMessage(error)
      setMessage(text)
      callbacks.current.onError?.(text)
      setStatus("error")
    }
    setStatus("loading")
    setMessage("")
    void (async () => {
      const config = await googleApi.config(controller.signal)
      if (controller.signal.aborted) return
      if (!config.enabled) {
        setStatus("disabled")
        return
      }
      const [api, flow] = await Promise.all([
        loadGoogleIdentity(),
        googleApi.challenge(controller.signal),
      ])
      if (controller.signal.aborted) return
      const expires = Date.parse(flow.expiresAt)
      api.initialize({
        client_id: config.webClientId,
        nonce: flow.nonce,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
        callback: ({ credential }) => {
          if (controller.signal.aborted || callbacks.current.disabled || submitted) return
          if (Date.now() >= expires) {
            report(new Error(t("Google sign-in expired. Please retry.")))
            return
          }
          pending = true
          submitted = true
          api.cancel()
          setBusy(true)
          callbacks.current.onBusyChange?.(true)
          void googleApi
            .login(
              credential,
              flow.nonce,
              controller.signal,
              callbacks.current.inviteCode ?? invitationCode(),
            )
            .then((result) => {
              if (!controller.signal.aborted) {
                setBusy(false)
                callbacks.current.onBusyChange?.(false)
                acceptRef.current(result)
              }
            }, report)
            .finally(() => {
              pending = false
              if (!controller.signal.aborted) {
                setBusy(false)
                callbacks.current.onBusyChange?.(false)
              }
            })
        },
      })
      const render = () => {
        if (!button.current || controller.signal.aborted) return
        button.current.replaceChildren()
        api.renderButton(button.current, {
          theme:
            getComputedStyle(document.documentElement).colorScheme === "dark"
              ? "filled_black"
              : "outline",
          size: "large",
          type: "standard",
          text: "continue_with",
          shape: "rectangular",
          width: Math.max(200, Math.min(400, button.current.clientWidth)),
          locale: locale === "zh" ? "zh_CN" : "en",
        })
      }
      render()
      const observer = new MutationObserver(render)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      })
      const resize = new ResizeObserver(render)
      if (button.current) resize.observe(button.current)
      stopObserving = () => {
        observer.disconnect()
        resize.disconnect()
      }
      setStatus("ready")
      api.prompt()
      timer = window.setTimeout(
        () => {
          api.cancel()
          if (!pending) setStatus("error")
        },
        Math.max(0, expires - Date.now()),
      )
    })().catch(report)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      stopObserving()
      window.google?.accounts.id.cancel()
    }
  }, [attempt, locale])
  useEffect(() => {
    if (disabled || challenge) window.google?.accounts.id.cancel()
  }, [disabled, challenge])

  return (
    <>
      {!oneTapOnly && (
        <div className="google-login" aria-busy={busy}>
          <div
            ref={button}
            className="google-login-button"
            inert={disabled || busy || status !== "ready"}
            hidden={status !== "ready"}
          />
          {status === "loading" && <span className="muted">{t("Loading Google sign-in…")}</span>}
          {status === "disabled" && (
            <button
              type="button"
              className="telegram-login-button"
              disabled
              title={t("Google sign-in is currently unavailable.")}
            >
              {t("Continue with Google")}
            </button>
          )}
          {status === "error" && (
            <button
              type="button"
              className="telegram-login-button"
              disabled={disabled || busy}
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("Retry Google sign-in")}
            </button>
          )}
          {busy && <span role="status">{t("Signing in with Google…")}</span>}
        </div>
      )}
      {oneTapOnly && message && (
        <div className="google-login-notice" role="alert">
          {t(message)} <a href="/auth/login">{t("Sign in")}</a>
        </div>
      )}
      {challenge && (
        <LoginVerificationDialog
          challenge={challenge}
          onCancel={() => setChallenge(null)}
          onVerify={async (codes) => {
            const session = await authApi.verifyLogin(codes)
            acceptRef.current(session)
          }}
        />
      )}
    </>
  )
}
