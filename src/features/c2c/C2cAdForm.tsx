import { useState } from "react"
import type { C2cMarket, c2cAccounts, c2cMarkets } from "../../api/c2cTrading"
import { t } from "../../i18n"

export function AdForm({
  market,
  catalog,
  selectMarket,
  accounts,
  paymentMethods,
  disabled,
  verify,
  submit,
}: {
  market: C2cMarket | undefined
  catalog: C2cMarket[]
  selectMarket: (id: string) => void
  accounts: Awaited<ReturnType<typeof c2cAccounts>>["items"]
  paymentMethods: Awaited<ReturnType<typeof c2cMarkets>>["paymentMethods"]
  disabled: boolean
  verify: React.ReactNode
  submit: (payload: Record<string, unknown>) => void
}) {
  const [side, setSide] = useState("SELL")
  return (
    <form
      className="c2c-panel c2c-ad-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!market || disabled) return
        const data = new FormData(event.currentTarget)
        const selected = accounts.find((a) => a.accountId === data.get("account"))
        submit({
          marketId: market.marketId,
          side,
          price: String(data.get("price")),
          quantity: String(data.get("quantity")),
          minFiat: String(data.get("min")),
          maxFiat: String(data.get("max")),
          methodCodes: side === "SELL" ? [selected?.methodCode] : [String(data.get("method"))],
          paymentAccountIds: side === "SELL" ? [selected?.accountId] : [],
          paymentWindowSeconds: market.paymentWindowSeconds,
          terms: String(data.get("terms")),
          minCompleted: 0,
        })
      }}
    >
      <h2>{t("发布广告")}</h2>
      <p className="c2c-muted">{t("商家审核与质押完成后，可发布当前市场的交易广告。")}</p>
      <fieldset className="c2c-fields c2c-ad-fields" disabled={disabled}>
        <label>
          {t("市场")}
          <select
            value={market?.marketId || ""}
            onChange={(event) => selectMarket(event.target.value)}
          >
            {catalog.map((m) => (
              <option key={m.marketId} value={m.marketId}>
                {m.asset} / {m.fiat}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("广告方向")}
          <select value={side} onChange={(event) => setSide(event.target.value)}>
            <option value="SELL">{t("商家出售")}</option>
            <option value="BUY">{t("商家购买")}</option>
          </select>
        </label>
        {[
          ["price", "单价"],
          ["quantity", "总数量"],
          ["min", "单笔最低法币金额"],
          ["max", "单笔最高法币金额"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} inputMode="decimal" required />
          </label>
        ))}
        {side === "SELL" ? (
          <label>
            {t("收款账户")}
            <select name="account" aria-label={t("收款账户")} required>
              <option value="">{t("请选择")}</option>
              {accounts
                .filter((a) => a.status === "APPROVED" && a.fiat === market?.fiat)
                .map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.methodCode} {a.maskedLabel}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label>
            {t("付款方式")}
            <select name="method">
              {paymentMethods
                .filter((method) => market && method.currencies.includes(market.fiat))
                .map((method) => (
                  <option key={method.code} value={method.code}>
                    {method.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label className="c2c-ad-terms">
          {t("交易条款")}
          <textarea name="terms" maxLength={2000} />
        </label>
        {verify}
        <button type="submit" disabled={disabled || !market}>
          {t("确认发布广告")}
        </button>
      </fieldset>
    </form>
  )
}
