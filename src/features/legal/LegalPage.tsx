import { useEffect, useState } from "react"
import { type LegalDocument, legalApi } from "../../api/legal"
import { t, useLocale } from "../../i18n"
import { contentLocale } from "../../i18n/locales"
import { ArticleView } from "../announcements/ArticleView"
import "./Legal.css"

export function LegalPage() {
  const locale = contentLocale(useLocale())
  const slug = window.location.pathname.split("/")[2] ?? ""
  const revisionId = new URLSearchParams(window.location.search).get("revision")
  const [documents, setDocuments] = useState<LegalDocument[]>([]),
    [historical, setHistorical] = useState<LegalDocument | null>(null)
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally reloads after the user clicks Retry.
  useEffect(() => {
    const request = new AbortController()
    setLoading(true)
    setError("")
    setDocuments([])
    setHistorical(null)
    void (async () => {
      const items = await legalApi.current(locale, request.signal)
      const revision =
        revisionId && /^[1-9]\d{0,18}$/.test(revisionId)
          ? await legalApi.revision(revisionId, locale, request.signal)
          : null
      if (request.signal.aborted) return
      if (revisionId && (!revision || revision.slug !== slug || revision.revisionId !== revisionId))
        throw new Error(t("This legal revision is unavailable."))
      setDocuments(items)
      setHistorical(revision)
    })()
      .catch((failure) => {
        if (!request.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : t("Could not load the legal documents."),
          )
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false)
      })
    return () => request.abort()
  }, [locale, slug, revisionId, attempt])
  const selected = historical ?? documents.find((item) => item.slug === slug)
  return (
    <main className="container section legal-center">
      <header>
        <h1>{t("Legal center")}</h1>
        <p>
          {t(
            "Read the terms, privacy information and product risk disclosures that apply to Surprising EX.",
          )}
        </p>
      </header>
      <div className="legal-layout">
        <nav aria-label={t("Legal documents")}>
          <a href="/legal">{t("All documents")}</a>
          {documents.map((item) => (
            <a
              key={item.revisionId}
              href={`/legal/${item.slug}`}
              aria-current={item.slug === slug ? "page" : undefined}
              lang={item.locale}
            >
              {item.title}
            </a>
          ))}
        </nav>
        <section className="legal-document" aria-busy={loading}>
          {loading ? (
            <p role="status">{t("Loading…")}</p>
          ) : error ? (
            <div role="alert">
              <p>{error}</p>
              <button
                className="button button-outline"
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("Retry")}
              </button>
            </div>
          ) : selected ? (
            <article>
              <h2 lang={selected.locale}>{selected.title}</h2>
              <p className="legal-version">
                {t("Revision")}: <bdi dir="ltr">{selected.revisionLabel}</bdi> ·{" "}
                {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
                  new Date(selected.publishedAt),
                )}
              </p>
              {historical &&
                !documents.some(
                  (item) =>
                    item.type === historical.type && item.revisionId === historical.revisionId,
                ) && (
                  <p className="form-message">
                    {t("You are viewing an earlier revision.")}{" "}
                    <a href={`/legal/${historical.slug}`}>{t("Read the current revision")}</a>
                  </p>
                )}
              <ArticleView html={selected.bodyHtml} text="" locale={selected.locale} />
            </article>
          ) : slug ? (
            <p role="status">{t("This legal document is unavailable.")}</p>
          ) : (
            <div className="legal-cards">
              {documents.length ? (
                documents.map((item) => (
                  <a key={item.revisionId} href={`/legal/${item.slug}`}>
                    <strong lang={item.locale}>{item.title}</strong>
                    <span>
                      {t("Revision")}: <bdi dir="ltr">{item.revisionLabel}</bdi>
                    </span>
                  </a>
                ))
              ) : (
                <p>{t("No legal documents have been published yet.")}</p>
              )}
            </div>
          )}
        </section>
      </div>
      <p className="legal-contact">
        {t("河南朔望科技有限公司 · ")}
        <a href="mailto:support@surprising.top">support@surprising.top</a>
      </p>
    </main>
  )
}
