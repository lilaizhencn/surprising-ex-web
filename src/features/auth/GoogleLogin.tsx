import { useEffect, useRef, useState } from "react"
import { authApi } from "../../api/endpoints"
import { googleApi } from "../../api/google"
import { type AuthSession, type LoginChallenge, LoginChallengeSchema } from "../../api/types"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t, useLocale } from "../../i18n"
import { contentLocale } from "../../i18n/locales"
import { saveSession } from "../../state/session"
import { clearInvitation, invitationCode } from "../affiliate/invitation"
import { authDestination } from "./authReturn"
import { loadGoogleIdentity } from "./googleIdentity"
import { LoginVerificationDialog, verificationMessage } from "./LoginVerificationDialog"
import "./GoogleLogin.css"
import { LegalReview } from "../legal/LegalReview"

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
  const [legalPromptOpen, setLegalPromptOpen] = useState(false)
  const legalDecision = useRef<((accepted: boolean) => void) | null>(null)
  const reviewLegal = () =>
    new Promise<boolean>((resolve) => {
      legalDecision.current = resolve
      setLegalPromptOpen(true)
    })
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
    setLegalPromptOpen(false)
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
          let needsVerification = false
          void (async () => {
            if (oneTapOnly && !(await reviewLegal())) return null
            if (controller.signal.aborted) return null
            if (Date.now() >= expires) throw new Error(t("Google sign-in expired. Please retry."))
            return googleApi.login(
              credential,
              flow.nonce,
              controller.signal,
              callbacks.current.inviteCode ?? invitationCode(),
            )
          })()
            .then((result) => {
              if (!controller.signal.aborted && result) {
                needsVerification = "requiresVerification" in result
                setBusy(false)
                callbacks.current.onBusyChange?.(false)
                acceptRef.current(result)
              }
            }, report)
            .finally(() => {
              pending = false
              if (!controller.signal.aborted) {
                setBusy(false)
                if (!needsVerification) setLegalPromptOpen(false)
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
          locale: contentLocale(locale).replace("-", "_"),
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
      legalDecision.current?.(false)
      legalDecision.current = null
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
      {oneTapOnly && legalPromptOpen && (
        <GoogleLegalDialog
          hidden={challenge !== null}
          onDecision={(accepted) => {
            legalDecision.current?.(accepted)
            legalDecision.current = null
          }}
        />
      )}
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
          onCancel={() => {
            setChallenge(null)
            setLegalPromptOpen(false)
          }}
          onVerify={async (codes) => {
            const session = await authApi.verifyLogin(codes)
            setLegalPromptOpen(false)
            acceptRef.current(session)
          }}
        />
      )}
    </>
  )
}

function GoogleLegalDialog({
  hidden,
  onDecision,
}: {
  readonly hidden: boolean
  readonly onDecision: (accepted: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [ready, setReady] = useState(false),
    [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (hidden) dialog.current?.close()
    else dialog.current?.showModal()
  }, [hidden])
  return (
    <dialog
      ref={dialog}
      className="standard-dialog legal-update"
      aria-labelledby="google-legal-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!confirmed) onDecision(false)
      }}
    >
      <h2 id="google-legal-title">{t("Continue with Google")}</h2>
      <p>{t("Before continuing with Google, review the current agreements.")}</p>
      <LegalReview disabled={confirmed} onReady={setReady} />
      <div className="button-row">
        <button
          type="button"
          className="button button-outline"
          disabled={confirmed}
          onClick={() => onDecision(false)}
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!ready || confirmed}
          onClick={() => {
            setConfirmed(true)
            onDecision(true)
          }}
        >
          {confirmed ? t("Signing in with Google…") : t("Agree and continue")}
        </button>
      </div>
    </dialog>
  )
}
