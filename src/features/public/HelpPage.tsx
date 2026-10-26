import { BookOpen, ChevronDown } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { loadHelpArticles } from "../../api/endpoints"
import type { ApiHelpArticle } from "../../api/types"
import { Button, Panel, SearchField, StateView } from "../../components/ui/Primitives"
import { t } from "../../i18n"

const categories = [
  ["", "All topics"],
  ["SECURITY", "Security"],
  ["TRADING", "Trading"],
  ["FUNDING", "Funding"],
  ["DERIVATIVES", "Derivatives"],
  ["SUPPORT", "Support"],
] as const

export function HelpPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [articles, setArticles] = useState<readonly ApiHelpArticle[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const id = useId()
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setError("")
    setArticles([])
    setOpenId(null)
    const timer = window.setTimeout(() => {
      void loadHelpArticles(query, category, abort.signal)
        .then(
          (rows) => {
            if (!abort.signal.aborted) setArticles(rows)
          },
          (reason) => {
            if (!abort.signal.aborted)
              setError(reason instanceof Error ? reason.message : t("Help content unavailable."))
          },
        )
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false)
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      abort.abort()
    }
  }, [category, query, reload])
  const articleButtonId = (articleId: string) => id + "-" + encodeURIComponent(articleId)
  const openFeatured = (articleId: string) => {
    setOpenId(articleId)
    requestAnimationFrame(() => {
      const target = document.getElementById(articleButtonId(articleId))
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: "center" })
    })
  }
  return (
    <div className="container section help-page">
      <div className="page-heading">
        <div>
          <h1>{t("Help Center")}</h1>
          <p>{t("Clear guidance for account access, trading, funding and risk controls.")}</p>
        </div>
        <BookOpen size={28} aria-hidden="true" />
      </div>
      <Panel className="help-search">
        <SearchField value={query} onChange={setQuery} placeholder={t("Search help articles")} />
        <fieldset className="segment-control" aria-label={t("Help categories")}>
          {categories.map(([value, label]) => (
            <button
              type="button"
              className={category === value ? "active" : ""}
              key={label}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {t(label)}
            </button>
          ))}
        </fieldset>
      </Panel>
      {loading ? (
        <Panel>
          <div role="status" aria-busy="true">
            <StateView kind="loading" message="Loading help content" />
            <span className="sr-only">{t("Loading help content")}</span>
          </div>
        </Panel>
      ) : error ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => setReload((value) => value + 1)} />
        </Panel>
      ) : (
        <div className="help-layout">
          <Panel>
            <div className="panel-heading">
              <h2>{t("Articles")}</h2>
              <span className="muted" role="status">
                {articles.length} {t("results")}
              </span>
            </div>
            {articles.length === 0 ? (
              <StateView kind="empty" message="No help articles match this search." />
            ) : (
              <div className="help-articles">
                {articles.map((article) => {
                  const open = openId === article.articleId
                  const buttonId = articleButtonId(article.articleId)
                  return (
                    <article
                      className={`help-article ${open ? "open" : ""}`}
                      key={article.articleId}
                    >
                      <button
                        type="button"
                        id={buttonId}
                        aria-expanded={open}
                        aria-controls={open ? buttonId + "-body" : undefined}
                        onClick={() =>
                          setOpenId((current) =>
                            current === article.articleId ? null : article.articleId,
                          )
                        }
                      >
                        <span>
                          <small>
                            {t(
                              categories.find(([value]) => value === article.category)?.[1] ??
                                article.category,
                            )}
                          </small>
                          <strong>{article.title}</strong>
                          <em>{article.summary}</em>
                        </span>
                        <ChevronDown size={18} aria-hidden="true" />
                      </button>
                      {open ? (
                        <section
                          id={buttonId + "-body"}
                          className="help-article-body"
                          aria-labelledby={buttonId}
                        >
                          <p>{article.body}</p>
                          <small>
                            {t("Updated")}{" "}
                            <time dateTime={article.updatedAt}>
                              {formatDate(article.updatedAt)}
                            </time>
                          </small>
                        </section>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel>
            <h2>{t("Start here")}</h2>
            <div className="help-featured">
              {articles.slice(0, 3).map((article) => (
                <Button
                  tone="outline"
                  key={article.articleId}
                  onClick={() => openFeatured(article.articleId)}
                >
                  {article.title}
                </Button>
              ))}
            </div>
            <p className="muted">
              {t(
                "For account-specific issues, include the request ID and time when contacting support. Never share credentials or secrets.",
              )}
            </p>
          </Panel>
        </div>
      )}
    </div>
  )
}
function formatDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : value
}
