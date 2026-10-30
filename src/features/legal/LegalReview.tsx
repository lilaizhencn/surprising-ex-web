import { useEffect, useState } from "react"
import { type LegalDocument, legalApi } from "../../api/legal"
import { t, useLocale } from "../../i18n"
import { contentLocale } from "../../i18n/locales"
import { setLegalAcceptance } from "../../state/legalAcceptance"
import "./Legal.css"

export function LegalReview({
  disabled,
  onReady,
}: {
  readonly disabled: boolean
  readonly onReady: (ready: boolean) => void
}) {
  const locale = contentLocale(useLocale())
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [error, setError] = useState("")
  const [checked, setChecked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally reloads after the user clicks Retry.
  useEffect(() => {
    const request = new AbortController()
    setChecked(false)
    setDocuments([])
    setError("")
    setLegalAcceptance([])
    void legalApi
      .current(locale, request.signal)
      .then((items) => {
        if (request.signal.aborted) return
        const required = items.filter((item) => item.registrationRequired)
        if (
          required.length !== 2 ||
          !required.some((item) => item.type === "USER_AGREEMENT") ||
          !required.some((item) => item.type === "PRIVACY_POLICY")
        )
          throw new Error(t("The required legal documents are unavailable. Please retry."))
        setDocuments(required)
      })
      .catch((failure) => {
        if (!request.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : t("Could not load the legal documents."),
          )
      })
    return () => {
      request.abort()
      setLegalAcceptance([])
    }
  }, [locale, attempt])
  const ready = checked && documents.length === 2 && !error
  useEffect(() => {
    setLegalAcceptance(
      ready ? documents.map((item) => ({ revisionId: item.revisionId, locale: item.locale })) : [],
    )
    onReady(ready)
  }, [ready, documents, onReady])
  return (
    <div className="legal-review">
      {documents.length ? (
        <>
          <div className="legal-review-links">
            {documents.map((item) => (
              <a
                key={item.revisionId}
                href={`/legal/${item.slug}?revision=${item.revisionId}`}
                target="_blank"
                rel="noopener noreferrer"
                lang={item.locale}
              >
                {item.title}{" "}
                <small>
                  <bdi dir="ltr">{item.revisionLabel}</bdi>
                </small>
              </a>
            ))}
          </div>
          <label className="legal-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>
              {t("I have read and agree to the User Agreement and acknowledge the Privacy Policy.")}
            </span>
          </label>
        </>
      ) : (
        <p role="status">{error || t("Loading legal documents…")}</p>
      )}
      {error && (
        <button
          type="button"
          className="button button-outline"
          disabled={disabled}
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("Retry")}
        </button>
      )}
      <a href="/legal" target="_blank" rel="noopener noreferrer">
        {t("Legal center")}
      </a>
    </div>
  )
}
