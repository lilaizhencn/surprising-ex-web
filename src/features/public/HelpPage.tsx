import { BookOpen, ChevronDown, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { loadHelpArticles } from "../../api/endpoints"
import type { ApiHelpArticle } from "../../api/types"
import { Button, Panel, StateView } from "../../components/ui/Primitives"

const categories = ["", "SECURITY", "TRADING", "FUNDING", "DERIVATIVES", "SUPPORT"] as const

export function HelpPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [articles, setArticles] = useState<readonly ApiHelpArticle[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    void loadHelpArticles(query, category)
      .then((rows) => {
        setArticles(rows)
        setError("")
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "帮助内容暂不可用。"),
      )
      .finally(() => setLoading(false))
  }, [category, query])
  const featured = useMemo(() => articles.slice(0, 3), [articles])
  return (
    <div className="container section help-page">
      <div className="page-heading">
        <div>
          <h1>Help Center</h1>
          <p>Clear guidance for account access, trading, funding and risk controls.</p>
        </div>
        <BookOpen size={28} color="var(--color-primary)" />
      </div>
      <Panel className="help-search">
        <div className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help articles"
            aria-label="Search help articles"
          />
        </div>
        <div className="segment-control">
          {categories.map((value) => (
            <button
              type="button"
              className={category === value ? "active" : ""}
              key={value || "all"}
              onClick={() => setCategory(value)}
            >
              {value || "All topics"}
            </button>
          ))}
        </div>
      </Panel>
      {error ? (
        <Panel>
          <StateView kind="error" message={error} retry={() => setQuery((value) => value)} />
        </Panel>
      ) : loading ? (
        <Panel>
          <StateView kind="loading" message="Loading help content" />
        </Panel>
      ) : (
        <div className="help-layout">
          <Panel>
            <div className="panel-heading">
              <h2>Articles</h2>
              <span className="muted">{articles.length} results</span>
            </div>
            {articles.length === 0 ? (
              <StateView kind="empty" message="No help articles match this search." />
            ) : (
              <div className="help-articles">
                {articles.map((article) => (
                  <article
                    className={`help-article ${openId === article.articleId ? "open" : ""}`}
                    key={article.articleId}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenId((current) =>
                          current === article.articleId ? null : article.articleId,
                        )
                      }
                    >
                      <span>
                        <small>{article.category}</small>
                        <strong>{article.title}</strong>
                        <em>{article.summary}</em>
                      </span>
                      <ChevronDown size={18} />
                    </button>
                    {openId === article.articleId ? (
                      <div className="help-article-body">
                        <p>{article.body}</p>
                        <small>Updated {article.updatedAt.slice(0, 10)}</small>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <h2>Start here</h2>
            <div className="help-featured">
              {featured.map((article) => (
                <Button
                  tone="outline"
                  key={article.articleId}
                  onClick={() => setOpenId(article.articleId)}
                >
                  {article.title}
                </Button>
              ))}
            </div>
            <p className="muted">
              For account-specific issues, include the request ID and time when contacting support.
              Never share credentials or secrets.
            </p>
          </Panel>
        </div>
      )}
    </div>
  )
}
