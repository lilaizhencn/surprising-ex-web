import { ArrowLeftRight, LogIn, MessageCircle, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { loadC2cStatus } from "../../api/c2c"
import { type C2cAd, c2cDecimal, c2cPublicMarkets, c2cPublicOffers } from "../../api/c2cTrading"
import { t } from "../../i18n"

const login = "/auth/login?redirect=%2Fc2c"
export function C2cMarketPreview() {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof c2cPublicMarkets>> | null>(null)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof loadC2cStatus>> | null>(null)
  const [marketId, setMarketId] = useState("")
  const [side, setSide] = useState<"BUY" | "SELL">("BUY")
  const [amount, setAmount] = useState("")
  const [methodCode, setMethodCode] = useState("")
  const [offset, setOffset] = useState(0)
  const [offers, setOffers] = useState<{ items: C2cAd[]; hasMore: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [offersLoading, setOffersLoading] = useState(false)
  const [error, setError] = useState("")
  const [offersError, setOffersError] = useState("")
  const [revision, setRevision] = useState(0)
  const market = catalog?.markets.find((row) => row.marketId === marketId)
  const validAmount = !amount || (/^\d+(\.\d+)?$/.test(amount) && /[1-9]/.test(amount))
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setError("")
    setOffers(null)
    setCatalog(null)
    setStatus(null)
    void (async () => {
      const current = await loadC2cStatus(abort.signal)
      if (abort.signal.aborted) return
      setStatus(current)
      if (!current.runtimeEnabled) return
      const result = await c2cPublicMarkets(abort.signal)
      if (!abort.signal.aborted) {
        setCatalog(result)
        setMarketId((value) =>
          result.markets.some((row) => row.marketId === value)
            ? value
            : (result.markets[0]?.marketId ?? ""),
        )
      }
    })()
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : "C2C 市场暂不可用，请重试。")
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [revision])
  useEffect(() => {
    const abort = new AbortController()
    setOffers(null)
    setOffersError("")
    setOffersLoading(false)
    if (loading || !status?.available || !market || !validAmount) return () => abort.abort()
    setOffersLoading(true)
    const timer = window.setTimeout(() => {
      void c2cPublicOffers(
        { marketId: market.marketId, side, amount, methodCode, offset },
        abort.signal,
      )
        .then((value) => {
          if (!abort.signal.aborted) setOffers(value)
        })
        .catch((failure) => {
          if (!abort.signal.aborted)
            setOffersError(failure instanceof Error ? failure.message : "广告暂不可用，请重试。")
        })
        .finally(() => {
          if (!abort.signal.aborted) setOffersLoading(false)
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      abort.abort()
    }
  }, [loading, status, market, validAmount, side, amount, methodCode, offset])
  function resetOffers() {
    setOffers(null)
    setOffset(0)
  }
  return (
    <div className="container section c2c-trading c2c-preview">
      <nav className="c2c-trading-tabs" aria-label={t("C2C 功能")}>
        <a href="/c2c" aria-current="page">
          <ArrowLeftRight size={17} aria-hidden="true" />
          {t("自选交易")}
        </a>
        <a href="/c2c/messages">
          <MessageCircle size={17} aria-hidden="true" />
          {t("消息")}
        </a>
      </nav>
      <section className="c2c-trading-body" aria-label={t("C2C 公开市场")}>
        <header className="c2c-trading-heading">
          <div>
            <h1>{t("C2C 自选交易")}</h1>
            <p>{t("浏览公开广告，登录后获取有效报价并核对交易条件。")}</p>
          </div>
          <button
            type="button"
            disabled={loading || offersLoading}
            onClick={() => {
              setOffset(0)
              setRevision((value) => value + 1)
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {t("刷新市场")}
          </button>
        </header>
        <aside className="c2c-preview-signin">
          <div>
            <strong>{t("开始点对点交易")}</strong>
            <p>{t("登录后可管理订单、收款账户并联系交易对方。")}</p>
          </div>
          <a className="button button-primary" href={login}>
            <LogIn size={16} aria-hidden="true" />
            {t("登录交易")}
          </a>
        </aside>
        {loading ? (
          <p className="c2c-panel" role="status" aria-busy="true">
            {t("正在读取 C2C 市场…")}
          </p>
        ) : error ? (
          <div className="c2c-panel" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              {t("重新读取市场")}
            </button>
          </div>
        ) : !status?.runtimeEnabled || !status.available ? (
          <p className="c2c-panel" role="status">
            {t("C2C 市场暂未开放")}
          </p>
        ) : !catalog?.markets.length ? (
          <p className="c2c-panel" role="status">
            {t("暂无开放的交易市场")}
          </p>
        ) : (
          <>
            <div className="c2c-form-row">
              <button
                type="button"
                aria-pressed={side === "BUY"}
                onClick={() => {
                  setSide("BUY")
                  resetOffers()
                }}
              >
                {t("我要买")}
              </button>
              <button
                type="button"
                aria-pressed={side === "SELL"}
                onClick={() => {
                  setSide("SELL")
                  resetOffers()
                }}
              >
                {t("我要卖")}
              </button>
              <label>
                {t("交易市场")}
                <select
                  value={marketId}
                  onChange={(event) => {
                    setMarketId(event.target.value)
                    setAmount("")
                    setMethodCode("")
                    resetOffers()
                  }}
                >
                  {catalog.markets.map((row) => (
                    <option key={row.marketId} value={row.marketId}>
                      {row.asset} / {row.fiat}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("法币金额筛选")}
                {market ? `（${market.fiat}）` : ""}
                <input
                  value={amount}
                  maxLength={80}
                  inputMode="decimal"
                  aria-invalid={!validAmount}
                  onChange={(event) => {
                    setAmount(event.target.value)
                    resetOffers()
                  }}
                />
              </label>
              <label>
                {t("支付方式")}
                <select
                  value={methodCode}
                  onChange={(event) => {
                    setMethodCode(event.target.value)
                    resetOffers()
                  }}
                >
                  <option value="">{t("全部方式")}</option>
                  {catalog.paymentMethods
                    .filter((row) => row.currencies.includes(market?.fiat ?? ""))
                    .map((row) => (
                      <option key={row.code} value={row.code}>
                        {row.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {!validAmount ? (
              <p role="alert" className="c2c-error">
                {t("请输入大于零的法币金额，使用普通十进制格式。")}
              </p>
            ) : offersLoading ? (
              <p className="c2c-panel" role="status" aria-busy="true">
                {t("正在查询广告…")}
              </p>
            ) : offersError ? (
              <div className="c2c-panel" role="alert">
                <p>{offersError}</p>
                <button type="button" onClick={() => setRevision((value) => value + 1)}>
                  {t("重新查询广告")}
                </button>
              </div>
            ) : offers && offers.items.length === 0 ? (
              <p className="c2c-panel" role="status">
                {t("暂无符合条件的广告")}
              </p>
            ) : null}
            <div className="c2c-offers">
              {offers?.items.map((ad) => (
                <article key={ad.adId} className="c2c-panel c2c-offer-card">
                  <h2>{ad.merchant?.nickname || `商家 ${ad.makerUserId}`}</h2>
                  <strong className="c2c-offer-price">
                    {c2cDecimal(ad.price)} {ad.market.fiat}
                  </strong>
                  <p>
                    {t("可交易 ")}
                    {ad.availableQuantity} {ad.market.asset}
                  </p>
                  <p>
                    {t("限额 ")}
                    {c2cDecimal(ad.minFiat)} – {c2cDecimal(ad.maxFiat)} {ad.market.fiat}
                  </p>
                  <p>
                    {ad.methodCodes
                      .map(
                        (code) =>
                          catalog.paymentMethods.find((row) => row.code === code)?.label || code,
                      )
                      .join(" · ")}
                  </p>
                  <a className="button button-primary" href={login}>
                    {t("登录后")}
                    {side === "BUY" ? t("购买") : t("出售")}
                  </a>
                </article>
              ))}
            </div>
            {(offers?.hasMore || offset > 0) && (
              <nav className="c2c-action-row" aria-label={t("广告分页")}>
                <button
                  type="button"
                  disabled={offersLoading || offset === 0}
                  onClick={() => {
                    setOffers(null)
                    setOffset((value) => Math.max(0, value - 20))
                  }}
                >
                  {t("上一页")}
                </button>
                <span>
                  {t("第 ")}
                  {offset / 20 + 1} {t(" 页")}
                </span>
                <button
                  type="button"
                  disabled={offersLoading || !offers?.hasMore || offset >= 10000}
                  onClick={() => {
                    setOffers(null)
                    setOffset((value) => Math.min(10000, value + 20))
                  }}
                >
                  {t("下一页")}
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  )
}
