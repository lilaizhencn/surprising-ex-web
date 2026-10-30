import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { restoreBrowserSession } from "../../api/client"
import { authApi } from "../../api/endpoints"
import { t } from "../../i18n"
import { clearLegalReview, legalReviewStore, setLegalAcceptance } from "../../state/legalAcceptance"
import { saveSession } from "../../state/session"
import { LegalReview } from "./LegalReview"

export function LegalUpdateDialog() {
  const required = useSyncExternalStore(
    legalReviewStore.subscribe,
    legalReviewStore.snapshot,
    () => false,
  )
  const dialog = useRef<HTMLDialogElement>(null)
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  useEffect(() => {
    if (required) dialog.current?.showModal()
    else dialog.current?.close()
  }, [required])
  if (!required) return null
  return (
    <dialog
      ref={dialog}
      className="standard-dialog legal-update"
      aria-labelledby="legal-update-title"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="legal-update-title">{t("Please review the updated agreements")}</h2>
      <p>
        {t(
          "The legal documents have changed. Review the current versions before continuing your session.",
        )}
      </p>
      <LegalReview disabled={busy} onReady={setReady} />
      {error && <p role="alert">{error}</p>}
      <div className="button-row">
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setError("")
            void authApi
              .logout()
              .then(() => {
                saveSession(null)
                clearLegalReview()
                setLegalAcceptance([])
                window.location.assign("/auth/login")
              })
              .catch((failure) =>
                setError(failure instanceof Error ? failure.message : t("Please retry.")),
              )
              .finally(() => setBusy(false))
          }}
        >
          {t("Sign out and return to sign in")}
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!ready || busy}
          onClick={() => {
            setBusy(true)
            setError("")
            void restoreBrowserSession()
              .then(() => {
                if (!legalReviewStore.snapshot()) return
                setError(t("The session could not be resumed. Please sign in again."))
              })
              .catch((failure) =>
                setError(failure instanceof Error ? failure.message : t("Please retry.")),
              )
              .finally(() => setBusy(false))
          }}
        >
          {busy ? t("Loading…") : t("Agree and continue")}
        </button>
      </div>
    </dialog>
  )
}
