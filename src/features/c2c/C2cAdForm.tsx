import { useState } from "react"
import type { C2cMarket, c2cAccounts, c2cMarkets } from "../../api/c2cTrading"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
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
  const [accountId, setAccountId] = useState("")
  const [methodCode, setMethodCode] = useState("")
  const matchingMethods = paymentMethods.filter(
    (method) => market && method.currencies.includes(market.fiat),
  )
  const activeMethod = matchingMethods.some((m) => m.code === methodCode)
    ? methodCode
    : (matchingMethods[0]?.code ?? "")
  const approvedAccounts = accounts.filter(
    (a) => a.status === "APPROVED" && a.fiat === market?.fiat,
  )
  return (
    <form
      className="c2c-panel c2c-ad-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!market || disabled) return
        const data = new FormData(event.currentTarget)
        const selected = accounts.find((a) => a.accountId === data.get("account"))
        if (side === "SELL" && !selected) return
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
        <div className="c2c-select-field">
          <span>{t("市场")}</span>
          <DropdownSelect
            aria-label={t("市场")}
            value={market?.marketId || ""}
            onChange={(event) => selectMarket(event.target.value)}
          >
            {catalog.map((m) => (
              <option key={m.marketId} value={m.marketId}>
                {`${m.asset} / ${m.fiat}`}
              </option>
            ))}
          </DropdownSelect>
        </div>
        <div className="c2c-select-field">
          <span>{t("广告方向")}</span>
          <DropdownSelect
            aria-label={t("广告方向")}
            value={side}
            onChange={(event) => setSide(event.target.value)}
          >
            <option value="SELL">{t("商家出售")}</option>
            <option value="BUY">{t("商家购买")}</option>
          </DropdownSelect>
        </div>
        {(
          [
            ["price", "单价"],
          ["quantity", "总数量"],
          ["min", "单笔最低法币金额"],
          ["max", "单笔最高法币金额"],
        ] as const).map(([name, label]) => (
          <label key={name}>
            {t(label)}
            <input name={name} inputMode="decimal" required />
          </label>
        ))}
        {side === "SELL" ? (
          <div className="c2c-select-field">
            <span>{t("收款账户")}</span>
            <input type="hidden" name="account" value={accountId} />
            <DropdownSelect
              aria-label={t("收款账户")}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">{t("请选择")}</option>
              {approvedAccounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {`${a.methodCode} ${a.maskedLabel}`}
                </option>
              ))}
            </DropdownSelect>
          </div>
        ) : (
          <div className="c2c-select-field">
            <span>{t("付款方式")}</span>
            <input type="hidden" name="method" value={activeMethod} />
            <DropdownSelect
              aria-label={t("付款方式")}
              value={activeMethod}
              onChange={(event) => setMethodCode(event.target.value)}
            >
              {matchingMethods.map((method) => (
                <option key={method.code} value={method.code}>
                  {t(method.label)}
                </option>
              ))}
            </DropdownSelect>
          </div>
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
