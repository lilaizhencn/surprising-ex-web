import type { MutableRefObject, ReactNode } from "react"
import {
  accountSchema,
  type C2cMarket,
  type c2cAccounts,
  type c2cMarkets,
  c2cWrite,
  challengeC2c,
  type Verification,
} from "../../api/c2cTrading"
import { t } from "../../i18n"
import { c2cStatusText as statusText } from "./C2cOrderPanel"

type FieldFn = (
  label: string,
  value: string,
  update: (value: string) => void,
  extra?: React.InputHTMLAttributes<HTMLInputElement>,
) => ReactNode

export function C2cAccountsTab({
  owner,
  accounts,
  currentAccountPage,
  accountPages,
  setAccountPage,
  busy,
  catalog,
  market,
  marketId,
  setMarketId,
  verification,
  setVerification,
  setError,
  act,
  live,
  field,
}: {
  owner: string
  accounts: Awaited<ReturnType<typeof c2cAccounts>>["items"]
  currentAccountPage: number
  accountPages: number
  setAccountPage: (page: number) => void
  busy: boolean
  catalog: Awaited<ReturnType<typeof c2cMarkets>> | null | undefined
  market: C2cMarket | undefined
  marketId: string
  setMarketId: (id: string) => void
  verification: Verification
  setVerification: (v: Verification) => void
  setError: (msg: string) => void
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
  live: MutableRefObject<boolean>
  field: FieldFn
}) {
  return (
    <>
      <div className="c2c-offers">
        {accounts.length === 0 && <p>{t("暂无收款账户，添加实名资料后等待审核。")}</p>}
        {accounts.slice(currentAccountPage * 8, (currentAccountPage + 1) * 8).map((a) => (
          <article key={a.accountId} className="c2c-panel">
            <h2>
              {a.methodCode} · {a.fiat}
            </h2>
            <p>
              {a.maskedLabel} · {statusText[a.status] || a.status}
            </p>
            <button
              type="button"
              disabled={busy || a.status === "DISABLED"}
              onClick={() => {
                if (
                  !window.confirm(
                    `确认停用收款账户？\n${a.methodCode} · ${a.fiat} · ${a.maskedLabel}\n账户：${a.accountId}\n相关广告可能暂停，请核对后续状态。`,
                  )
                )
                  return
                void act(() =>
                  c2cWrite(owner, `/payment-accounts/${a.accountId}/disable`, {
                    revision: a.revision,
                    verification,
                  }),
                )
              }}
            >
              {t("停用账户")}
            </button>
          </article>
        ))}
      </div>
      {accounts.length > 8 && (
        <nav className="c2c-action-row" aria-label={t("收款账户分页")}>
          <button
            type="button"
            disabled={currentAccountPage === 0}
            onClick={() => setAccountPage(Math.max(0, currentAccountPage - 1))}
          >
            {t("上一页")}
          </button>
          <span>
            {t("第 ")}
            {currentAccountPage + 1} / {accountPages} {t(" 页")}
          </span>
          <button
            type="button"
            disabled={currentAccountPage >= accountPages - 1}
            onClick={() => setAccountPage(currentAccountPage + 1)}
          >
            {t("下一页")}
          </button>
        </nav>
      )}
      <form
        className="c2c-panel c2c-account-form"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const data = new FormData(form)
          const chosenMethod = catalog?.paymentMethods.find(
            (row) => row.code === data.get("method"),
          )
          if (!market || !chosenMethod?.currencies.includes(market.fiat)) {
            setError("当前法币暂无可用收款方式，请选择其他市场。")
            return
          }
          if (chosenMethod?.requiresBankName && !String(data.get("bank") ?? "").trim()) {
            setError("该收款方式需要填写开户银行。")
            return
          }
          void act(async () => {
            const result = accountSchema.parse(
              await c2cWrite(owner, "/payment-accounts", {
                accountId: null,
                revision: "0",
                fiat: market?.fiat,
                methodCode: String(data.get("method")),
                details: {
                  holderName: String(data.get("holder")),
                  accountNumber: String(data.get("number")),
                  bankName: String(data.get("bank")),
                  qrAttachmentId: null,
                },
                verification,
              }),
            )
            if (
              result.methodCode !== data.get("method") ||
              result.fiat !== market?.fiat ||
              result.status !== "PENDING"
            )
              throw Error("收款资料提交响应不匹配，请刷新并核对原账户列表。")
            if (live.current) form.reset()
          }, "收款资料已提交，审核通过后可使用")
        }}
      >
        <h2>{t("添加实名收款账户")}</h2>
        <label>
          {t("收款法币")}
          <select value={marketId} onChange={(event) => setMarketId(event.target.value)}>
            {catalog?.markets.map((row) => (
              <option key={row.marketId} value={row.marketId}>
                {row.fiat} · {row.asset}/{row.fiat}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("收款方式")}
          <select name="method">
            {catalog?.paymentMethods
              .filter((m) => market && m.currencies.includes(market.fiat))
              .map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t("本人姓名")}
          <input name="holder" required minLength={2} maxLength={80} autoComplete="name" />
        </label>
        <label>
          {t("收款账号")}
          <input name="number" required minLength={3} maxLength={128} autoComplete="off" />
        </label>
        <label>
          {t("开户银行（银行卡必填）")}
          <input name="bank" maxLength={120} />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => challengeC2c(owner, "SECURITY_SETTINGS"), "验证码已发送")}
        >
          {t("获取设置验证码")}
        </button>
        {field("邮箱验证码", verification.emailCode, (emailCode) =>
          setVerification({ ...verification, emailCode }),
        )}
        {field("验证器验证码（已绑定时）", verification.totpCode, (totpCode) =>
          setVerification({ ...verification, totpCode }),
        )}
        <button type="submit" disabled={busy || !market}>
          {t("提交实名收款审核")}
        </button>
      </form>
    </>
  )
}
