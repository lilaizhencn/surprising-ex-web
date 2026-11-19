import { type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction, useState } from "react"
import type {
  C2cAd,
  C2cMarket,
  C2cPendingTrade,
  C2cQuote,
  c2cAccounts,
  c2cMarkets,
  c2cMe,
  Verification,
} from "../../api/c2cTrading"
import { c2cDecimal, quoteSchema } from "../../api/c2cTrading"
import { request } from "../../api/client"
import { useConfirmDialog } from "../../components/ui/ConfirmDialog"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { t, tf } from "../../i18n"
import { unitsToDecimal } from "../../lib/units"
import { responseDeadline } from "./C2cOrderPanel"

type FieldFn = (
  label: string,
  value: string,
  update: (value: string) => void,
  extra?: React.InputHTMLAttributes<HTMLInputElement>,
) => ReactNode

export function C2cMarketTab({
  owner,
  side,
  setSide,
  busy,
  clearOfferSelection,
  marketId,
  setMarketId,
  catalog,
  market,
  minAmount,
  setMinAmount,
  maxAmount,
  setMaxAmount,
  method,
  setMethod,
  adsLoading,
  ads,
  adsError,
  refresh,
  available,
  pending,
  pendingError,
  act,
  choose,
  adMore,
  adOffset,
  setSelected,
  setQuote,
  setAdOffset,
  selected,
  confirmationPanel,
  setVerification,
  quantity,
  setQuantity,
  payment,
  setPayment,
  accounts,
  readReady,
  live,
  setQuoteDeadline,
  quote,
  quoteExpired,
  verify,
  operation,
  submit,
  field,
  me,
  onGoAccounts,
}: {
  owner: string
  me?: Awaited<ReturnType<typeof c2cMe>> | null | undefined
  onGoAccounts?: () => void
  side: "BUY" | "SELL"
  setSide: (side: "BUY" | "SELL") => void
  busy: boolean
  clearOfferSelection: () => void
  marketId: string
  setMarketId: (id: string) => void
  catalog: Awaited<ReturnType<typeof c2cMarkets>> | null | undefined
  market: C2cMarket | undefined
  minAmount: string
  setMinAmount: (v: string) => void
  maxAmount: string
  setMaxAmount: (v: string) => void
  method: string
  setMethod: (v: string) => void
  adsLoading: boolean
  ads: C2cAd[]
  adsError: string
  refresh: () => void
  available: boolean
  pending: C2cPendingTrade | null
  pendingError: string
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
  choose: (ad: C2cAd) => Promise<void>
  adMore: boolean
  adOffset: number
  setSelected: (ad: C2cAd | null) => void
  setQuote: (q: C2cQuote | null) => void
  setAdOffset: Dispatch<SetStateAction<number>>
  selected: C2cAd | null
  confirmationPanel: MutableRefObject<HTMLElement | null>
  setVerification: (v: Verification) => void
  quantity: string
  setQuantity: (v: string) => void
  payment: string
  setPayment: (v: string) => void
  accounts: Awaited<ReturnType<typeof c2cAccounts>>["items"]
  readReady: Record<string, boolean>
  live: MutableRefObject<boolean>
  setQuoteDeadline: (d: number) => void
  quote: C2cQuote | null
  quoteExpired: boolean
  verify: ReactNode
  operation: MutableRefObject<boolean>
  submit: (kind: "AD_PUBLISH" | "ORDER_CREATE", body: Record<string, unknown>) => Promise<void>
  field: FieldFn
}) {
  const { confirm, dialog } = useConfirmDialog()
  const [onlyPremium, setOnlyPremium] = useState(false)
  const [onlyFreezeGuarantee, setOnlyFreezeGuarantee] = useState(false)
  const [selectedMethods, setSelectedMethods] = useState<string[]>([])
  const blacklisted = Boolean(me?.blacklisted)
  const visibleAds = ads.filter((ad) => {
    if (ad.market.marketId !== marketId || ad.side !== (side === "BUY" ? "SELL" : "BUY"))
      return false
    if (onlyPremium && !ad.merchant?.premiumVerified) return false
    if (onlyFreezeGuarantee && !ad.merchant?.freezeCompensation) return false
    if (
      selectedMethods.length > 0 &&
      !ad.methodCodes.some((code) => selectedMethods.includes(code))
    )
      return false
    const minVal = minAmount.trim() ? Number(minAmount) : null
    const maxVal = maxAmount.trim() ? Number(maxAmount) : null
    if (minVal !== null && Number.isFinite(minVal) && Number(ad.maxFiat) < minVal) return false
    if (maxVal !== null && Number.isFinite(maxVal) && Number(ad.minFiat) > maxVal) return false
    return true
  })
  return (
    <>
      <div className="c2c-form-row">
        <div className="c2c-side-switch" role="group" aria-label={t("交易方向")}>
          <button
            type="button"
            className="c2c-side-buy"
            aria-pressed={side === "BUY"}
            disabled={busy}
            onClick={() => {
              setSide("BUY")
              clearOfferSelection()
            }}
          >
            {t("我要买")}
          </button>
          <button
            type="button"
            className="c2c-side-sell"
            aria-pressed={side === "SELL"}
            disabled={busy}
            onClick={() => {
              setSide("SELL")
              clearOfferSelection()
            }}
          >
            {t("我要卖")}
          </button>
        </div>
        <div className="c2c-select-field c2c-market-field">
          <span>{t("交易市场")}</span>
          <DropdownSelect
            aria-label={t("交易市场")}
            value={marketId}
            onChange={(event) => {
              setMarketId(event.target.value)
              setMinAmount("")
              setMaxAmount("")
              setMethod("")
              clearOfferSelection()
            }}
          >
            {catalog?.markets.map((m) => (
              <option key={m.marketId} value={m.marketId}>
                {`${m.asset} / ${m.fiat}`}
              </option>
            ))}
          </DropdownSelect>
        </div>
        <div className="c2c-select-field c2c-amount-range-field">
          <span>{market ? tf("法币金额筛选（{p0}）", { p0: market.fiat }) : t("法币金额筛选")}</span>
          <div className="c2c-amount-range">
            <input
              aria-label={t("最小金额")}
              placeholder={t("最小金额")}
              value={minAmount}
              inputMode="decimal"
              maxLength={40}
              onChange={(event) => {
                setMinAmount(event.target.value)
                clearOfferSelection()
              }}
            />
            <span className="c2c-range-sep" aria-hidden="true">
              –
            </span>
            <input
              aria-label={t("最大金额")}
              placeholder={t("最大金额")}
              value={maxAmount}
              inputMode="decimal"
              maxLength={40}
              onChange={(event) => {
                setMaxAmount(event.target.value)
                clearOfferSelection()
              }}
            />
          </div>
        </div>
        <div className="c2c-select-field c2c-method-multi">
          <span>{t("支付方式（可多选）")}</span>
          <div className="c2c-badge-filters" role="group" aria-label={t("支付方式")}>
            <button
              type="button"
              className={`c2c-filter-pill ${selectedMethods.length === 0 ? "active" : ""}`}
              aria-pressed={selectedMethods.length === 0}
              onClick={() => {
                setSelectedMethods([])
                setMethod("")
                clearOfferSelection()
              }}
            >
              {t("全部方式")}
            </button>
            {catalog?.paymentMethods
              .filter((m) => !market || m.currencies.includes(market.fiat))
              .map((m) => {
                const active = selectedMethods.includes(m.code)
                return (
                  <button
                    type="button"
                    key={m.code}
                    className={`c2c-filter-pill ${active ? "active" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      const next = active
                        ? selectedMethods.filter((c) => c !== m.code)
                        : [...selectedMethods, m.code]
                      setSelectedMethods(next)
                      setMethod(next.length === 1 ? (next[0] ?? "") : "")
                      clearOfferSelection()
                    }}
                  >
                    {t(m.label)}
                  </button>
                )
              })}
          </div>
        </div>
        <div className="c2c-badge-filters" role="group" aria-label={t("商户认证筛选")}>
          <button
            type="button"
            className={`c2c-filter-pill ${onlyPremium ? "active" : ""}`}
            aria-pressed={onlyPremium}
            onClick={() => {
              setOnlyPremium((v) => !v)
              clearOfferSelection()
            }}
          >
            {t("优质商户")}
          </button>
          <button
            type="button"
            className={`c2c-filter-pill ${onlyFreezeGuarantee ? "active" : ""}`}
            aria-pressed={onlyFreezeGuarantee}
            onClick={() => {
              setOnlyFreezeGuarantee((v) => !v)
              clearOfferSelection()
            }}
          >
            {t("冻结必赔")}
          </button>
        </div>
      </div>
      <div className="c2c-offers">
        {adsLoading && ads.length === 0 ? (
          <p className="c2c-offers-empty" role="status" aria-busy="true">
            {t("正在查询广告…")}
          </p>
        ) : adsError ? (
          <div className="c2c-offers-empty" role="alert">
            <p>{adsError}</p>
            <button type="button" onClick={refresh}>
              {t("重新查询广告")}
            </button>
          </div>
        ) : (
          visibleAds.length === 0 && (
            <p className="c2c-offers-empty" role="status">
              {available ? t("暂无符合条件的广告") : t("C2C 市场暂未开放")}
            </p>
          )
        )}
        {visibleAds.map((ad) => (
            <article key={ad.adId} className="c2c-panel c2c-offer-card">
              <div className="c2c-offer-merchant-head">
                <h2>{ad.merchant?.nickname || tf("商家 {p0}", { p0: ad.makerUserId })}</h2>
                {(ad.merchant?.premiumVerified || ad.merchant?.freezeCompensation) && (
                  <div className="c2c-merchant-badges">
                    {ad.merchant?.premiumVerified && (
                      <span className="c2c-badge c2c-badge-premium">{t("优质商户")}</span>
                    )}
                    {ad.merchant?.freezeCompensation && (
                      <span className="c2c-badge c2c-badge-freeze">{t("冻结必赔")}</span>
                    )}
                  </div>
                )}
              </div>
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
                      t(catalog?.paymentMethods.find((m) => m.code === code)?.label || code),
                  )
                  .join(" · ")}
              </p>
              <button
                type="button"
                className="c2c-primary"
                disabled={
                  busy ||
                  blacklisted ||
                  ad.makerUserId === owner ||
                  !!pending ||
                  !!pendingError ||
                  adsLoading ||
                  !available
                }
                onClick={() => void act(() => choose(ad), t("请确认数量和收款方式"))}
              >
                {ad.makerUserId === owner
                  ? t("本人广告")
                  : ad.side === "SELL"
                    ? t("购买")
                    : t("出售")}
              </button>
            </article>
          ))}
      </div>
      {(adMore || adOffset > 0) && (
        <nav className="c2c-action-row" aria-label={t("广告分页")}>
          <button
            type="button"
            disabled={adsLoading || adOffset === 0}
            onClick={() => {
              setSelected(null)
              setQuote(null)
              setAdOffset((value) => Math.max(0, value - 20))
            }}
          >
            {t("上一页")}
          </button>
          <span>
            {t("第 ")}
            {adOffset / 20 + 1} {t(" 页")}
          </span>
          <button
            type="button"
            disabled={adsLoading || !adMore}
            onClick={() => {
              setSelected(null)
              setQuote(null)
              setAdOffset((value) => value + 20)
            }}
          >
            {t("下一页")}
          </button>
        </nav>
      )}
      {selected && (
        <section
          className="c2c-panel c2c-trade-confirmation"
          aria-label={t("确认交易")}
          ref={confirmationPanel}
          tabIndex={-1}
        >
          <h2>
            {t("确认")}
            {selected.side === "SELL" ? t("购买") : t("出售")} {selected.market.asset}
          </h2>
          <p>
            {t("商家：")}
            {selected.merchant?.nickname || selected.makerUserId} {t(" · 广告")}{" "}
            <code>{selected.adId}</code>
          </p>
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setQuote(null)
              setVerification({ emailCode: "", totpCode: "" })
            }}
          >
            {t("取消本次选择")}
          </button>
          {field(
            t("交易数量"),
            quantity,
            (value) => {
              setQuantity(value)
              setQuote(null)
            },
            { inputMode: "decimal", maxLength: 80 },
          )}
          <div className="c2c-select-field">
            <span>{t("收款方式")}</span>
            <DropdownSelect
              aria-label={t("收款方式")}
              value={payment}
              onChange={(event) => {
                setPayment(event.target.value)
                setQuote(null)
              }}
            >
              <option value="">{t("请选择")}</option>
              {selected.side === "SELL"
                ? selected.paymentOptions?.map((a) => (
                    <option key={a.accountId} value={a.accountId}>
                      {`${a.methodCode} ${a.maskedLabel}`}
                    </option>
                  ))
                : accounts
                    .filter(
                      (a) =>
                        a.status === "APPROVED" &&
                        a.fiat === selected.market.fiat &&
                        selected.methodCodes.includes(a.methodCode),
                    )
                    .map((a) => (
                      <option key={a.accountId} value={a.accountId}>
                        {`${a.methodCode} ${a.maskedLabel}`}
                      </option>
                    ))}
            </DropdownSelect>
            {selected.side === "BUY" &&
              accounts.filter(
                (a) =>
                  a.status === "APPROVED" &&
                  a.fiat === selected.market.fiat &&
                  selected.methodCodes.includes(a.methodCode),
              ).length === 0 && (
                <div className="c2c-reject-banner" role="alert">
                  <span>{t("您尚未设置并审核通过支持该交易方式的收款账户，请先设置。")}</span>
                  {onGoAccounts && (
                    <button type="button" className="c2c-deposit-btn" onClick={onGoAccounts}>
                      {t("去设置收款方式")}
                    </button>
                  )}
                </div>
              )}
          </div>
          <button
            type="button"
            disabled={
              busy ||
              !quantity ||
              !payment ||
              !!pending ||
              !!pendingError ||
              !available ||
              (selected.side === "BUY" && !readReady["accounts"])
            }
            onClick={() =>
              void act(async () => {
                if (!/^\d+(\.\d+)?$/.test(quantity) || !/[1-9]/.test(quantity))
                  throw Error(t("请输入大于零的交易数量"))
                const started = performance.now()
                const value = await request("/api/v1/c2c/quotes", quoteSchema, {
                  method: "POST",
                  expectedUserId: owner,
                  body: {
                    adId: selected.adId,
                    amountType: "CRYPTO",
                    amount: quantity,
                    paymentAccountId: payment,
                  },
                })
                if (
                  value.ownerUserId !== owner ||
                  value.adId !== selected.adId ||
                  value.paymentAccountId !== payment ||
                  value.market.marketId !== selected.market.marketId
                )
                  throw Error(t("报价与当前广告或收款方式不匹配"))
                if (live.current) {
                  setQuote(value)
                  setQuoteDeadline(responseDeadline(value.expiresAt, value.serverTime, started))
                }
              }, t("报价已生成，请核对费用和实收数量"))
            }
          >
            {t("获取报价")}
          </button>
          {quote && (
            <>
              <p>
                {selected.side === "SELL" ? t("应付") : t("应收")} {c2cDecimal(quote.fiatAmount)}{" "}
                {quote.market.fiat} {t(" · 数量 ")}
                {quote.quantity} {quote.market.asset}
              </p>
              <p>
                {t("手续费 ")}
                {unitsToDecimal(quote.buyerFeeUnits, quote.market.assetScale)} {t(" · 买方实收")}{" "}
                {unitsToDecimal(quote.buyerReceivesUnits, quote.market.assetScale)}{" "}
                {quote.market.asset}
              </p>
              <p>
                {t("报价有效至 ")}
                {new Date(quote.expiresAt).toLocaleTimeString()}
              </p>
              {quoteExpired && (
                <p role="status" className="c2c-warning">
                  {t("报价已到期，请重新获取报价后确认。")}
                </p>
              )}
              {selected.side === "BUY" && verify}
              <button
                type="button"
                className="c2c-primary"
                disabled={
                  busy || !quote.valid || quoteExpired || !!pending || !!pendingError || !available
                }
                onClick={() => {
                  if (operation.current) return
                  const chosenOption =
                    selected.side === "SELL"
                      ? selected.paymentOptions?.find((a) => a.accountId === payment)
                      : accounts.find((a) => a.accountId === payment)
                  const methodLabel = chosenOption
                    ? `${chosenOption.methodCode} ${chosenOption.maskedLabel}`
                    : payment
                  const badges = [
                    selected.merchant?.premiumVerified ? t("优质商户") : "",
                    selected.merchant?.freezeCompensation ? t("冻结必赔") : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                  const windowMins = Math.max(1, Math.round(selected.market.paymentWindowSeconds / 60))
                  void confirm({
                    title: t("确认下单并遵守交易规则"),
                    description: tf(
                      "商户：{p0}{p1}\n收付款方式：{p2}\n金额：{p3} {p4}（数量：{p5} {p6}）\n付款有效期：{p7} 分钟\n\n重要提醒：请在有效期内完成付款并点击确认；未及时付款或未点击确认导致超时，将冻结相关币种；若累计超过一次超时违约，将被系统拉黑（禁止 C2C 下单，仅可查看）。",
                      {
                        p0: selected.merchant?.nickname || selected.makerUserId,
                        p1: badges ? `（${badges}）` : "",
                        p2: methodLabel,
                        p3: quote.fiatAmount,
                        p4: quote.market.fiat,
                        p5: quote.quantity,
                        p6: quote.market.asset,
                        p7: String(windowMins),
                      },
                    ),
                    confirmLabel: t("我已知晓，确认下单"),
                  }).then((ok) => {
                    if (ok) void act(() => submit("ORDER_CREATE", { quoteId: quote.quoteId }))
                  })
                }}
              >
                {t("确认下单")}
              </button>
            </>
          )}
        </section>
      )}
      {dialog}
    </>
  )
}
