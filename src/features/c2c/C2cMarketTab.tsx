import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from "react"
import {
  type C2cAd,
  type C2cMarket,
  type C2cPendingTrade,
  type C2cQuote,
  type c2cAccounts,
  c2cDecimal,
  type c2cMarkets,
  quoteSchema,
  type Verification,
} from "../../api/c2cTrading"
import { request } from "../../api/client"
import { useConfirmDialog } from "../../components/ui/ConfirmDialog"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { t } from "../../i18n"
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
  amount,
  setAmount,
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
}: {
  owner: string
  side: "BUY" | "SELL"
  setSide: (side: "BUY" | "SELL") => void
  busy: boolean
  clearOfferSelection: () => void
  marketId: string
  setMarketId: (id: string) => void
  catalog: Awaited<ReturnType<typeof c2cMarkets>> | null | undefined
  market: C2cMarket | undefined
  amount: string
  setAmount: (v: string) => void
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
  return (
    <>
      <div className="c2c-form-row">
        <button
          type="button"
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
          aria-pressed={side === "SELL"}
          disabled={busy}
          onClick={() => {
            setSide("SELL")
            clearOfferSelection()
          }}
        >
          {t("我要卖")}
        </button>
        <div className="c2c-select-field">
          <span>{t("交易市场")}</span>
          <DropdownSelect
            aria-label={t("交易市场")}
            value={marketId}
            onChange={(event) => {
              setMarketId(event.target.value)
              setAmount("")
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
        {field(
          `法币金额筛选${market ? "（" + market.fiat + "）" : ""}`,
          amount,
          (value) => {
            setAmount(value)
            clearOfferSelection()
          },
          { inputMode: "decimal", maxLength: 80 },
        )}
        <div className="c2c-select-field">
          <span>{t("支付方式")}</span>
          <DropdownSelect
            aria-label={t("支付方式")}
            value={method}
            onChange={(event) => {
              setMethod(event.target.value)
              clearOfferSelection()
            }}
          >
            <option value="">{t("全部方式")}</option>
            {catalog?.paymentMethods
              .filter((m) => !market || m.currencies.includes(market.fiat))
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
          </DropdownSelect>
        </div>
      </div>
      <div className="c2c-offers">
        {adsLoading && ads.length === 0 ? (
          <p role="status" aria-busy="true">
            {t("正在查询广告…")}
          </p>
        ) : adsError ? (
          <div role="alert">
            <p>{adsError}</p>
            <button type="button" onClick={refresh}>
              {t("重新查询广告")}
            </button>
          </div>
        ) : (
          ads.length === 0 && <p>{available ? t("暂无符合条件的广告") : t("C2C 市场暂未开放")}</p>
        )}
        {ads
          .filter(
            (ad) =>
              ad.market.marketId === marketId && ad.side === (side === "BUY" ? "SELL" : "BUY"),
          )
          .map((ad) => (
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
                    (code) => catalog?.paymentMethods.find((m) => m.code === code)?.label || code,
                  )
                  .join(" · ")}
              </p>
              <button
                type="button"
                className="c2c-primary"
                disabled={
                  busy ||
                  ad.makerUserId === owner ||
                  !!pending ||
                  !!pendingError ||
                  adsLoading ||
                  !available
                }
                onClick={() => void act(() => choose(ad), "请确认数量和收款方式")}
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
            "交易数量",
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
                  throw Error("请输入大于零的交易数量")
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
                  throw Error("报价与当前广告或收款方式不匹配")
                if (live.current) {
                  setQuote(value)
                  setQuoteDeadline(responseDeadline(value.expiresAt, value.serverTime, started))
                }
              }, "报价已生成，请核对费用和实收数量")
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
                  void confirm({
                    title: "确认按本次报价下单？",
                    description: `商家：${selected.merchant?.nickname || selected.makerUserId}\n金额：${quote.fiatAmount} ${quote.market.fiat}\n数量：${quote.quantity} ${quote.market.asset}\n报价：${quote.quoteId}`,
                    confirmLabel: t("确认下单"),
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
