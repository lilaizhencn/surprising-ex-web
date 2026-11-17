import type { MutableRefObject, ReactNode } from "react"
import {
  type C2cAd,
  type C2cMarket,
  type C2cPendingTrade,
  type c2cAccounts,
  type c2cBond,
  c2cDecimal,
  type c2cMarkets,
  type c2cMe,
  c2cWrite,
  type Verification,
} from "../../api/c2cTrading"
import { useConfirmDialog } from "../../components/ui/ConfirmDialog"
import { t, tf } from "../../i18n"
import { AdForm } from "./C2cAdForm"
import { c2cStatusText as statusText } from "./C2cOrderPanel"

export function C2cMerchantTab({
  owner,
  me,
  bond,
  canStake,
  busy,
  pending,
  pendingError,
  available,
  market,
  catalog,
  setMarketId,
  accounts,
  ownAds,
  verification,
  verify,
  operation,
  act,
  submit,
}: {
  owner: string
  me: Awaited<ReturnType<typeof c2cMe>> | null | undefined
  bond: Awaited<ReturnType<typeof c2cBond>> | null | undefined
  canStake: boolean
  busy: boolean
  pending: C2cPendingTrade | null
  pendingError: string
  available: boolean
  market: C2cMarket | undefined
  catalog: Awaited<ReturnType<typeof c2cMarkets>> | null | undefined
  setMarketId: (id: string) => void
  accounts: Awaited<ReturnType<typeof c2cAccounts>>["items"]
  ownAds: C2cAd[]
  verification: Verification
  verify: ReactNode
  operation: MutableRefObject<boolean>
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
  submit: (kind: "AD_PUBLISH" | "ORDER_CREATE", body: Record<string, unknown>) => Promise<void>
}) {
  const { confirm, dialog } = useConfirmDialog()
  return (
    <>
      <div className="c2c-merchant-workspace">
        <div className="c2c-panel">
          <h2>{t("商家资格与质押")}</h2>
          <p>
            {t("身份认证：")}
            {me?.kycVerified ? t("已认证") : t("待认证")} {t(" · 商家：")}
            {statusText[me?.merchant?.status || ""] || "未申请"}
          </p>
          {me?.merchant?.reviewReason && <p>{me.merchant.reviewReason}</p>}
          {(!me?.merchant || ["REJECTED", "WITHDRAWN", "PENDING"].includes(me.merchant.status)) && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const data = new FormData(event.currentTarget)
                void act(() =>
                  c2cWrite(owner, "/me/merchant-application", {
                    revision: me?.merchant?.revision || "0",
                    application: String(data.get("application")),
                  }),
                )
              }}
            >
              <label>
                {t("商家申请资料")}
                <textarea name="application" minLength={10} maxLength={2000} required />
              </label>
              <button type="submit" disabled={busy}>
                {t("提交申请")}
              </button>
            </form>
          )}
          <p>
            {bond?.policy.configured
              ? tf("保证金：{p0} {p1}", { p0: bond.policy.amount, p1: bond.policy.asset })
              : t("质押规则尚未配置，请等待平台开放")}
          </p>
          {bond?.bond && (
            <p>
              {bond.bond.amount} {bond.bond.asset} ·{" "}
              {statusText[bond.bond.status] || bond.bond.status}
            </p>
          )}
          {canStake && (
            <>
              {verify}
              <button
                type="button"
                disabled={
                  busy ||
                  !bond?.policy.configured ||
                  !["PENDING", "APPROVED"].includes(me?.merchant?.status || "") ||
                  (!!bond?.bond && !["FAILED", "RETURNED"].includes(bond.bond.status))
                }
                onClick={() =>
                  void act(async () => {
                    const key = `surprising.c2c.bond.${owner}`
                    const requestId = sessionStorage.getItem(key) || crypto.randomUUID()
                    sessionStorage.setItem(key, requestId)
                    await c2cWrite(owner, "/me/merchant-bond", {
                      requestId,
                      policyRevision: bond?.policy.revision,
                      verification,
                    })
                    sessionStorage.removeItem(key)
                  })
                }
              >
                {t("确认质押")}
              </button>
            </>
          )}
          {bond?.bond?.status === "LOCKED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void confirm({
                  title: "退出商家并退还原质押？",
                  description: "须先关闭广告并结清订单和申诉。",
                  confirmLabel: t("退出商家并退押"),
                  danger: true,
                }).then((ok) => {
                  if (!ok) return
                  void act(() =>
                    c2cWrite(owner, `/me/merchant-bonds/${bond.bond?.bondId}/withdraw`, undefined),
                  )
                })
              }}
            >
              {t("退出商家并退押")}
            </button>
          )}
        </div>
        <AdForm
          market={market}
          catalog={catalog?.markets || []}
          selectMarket={setMarketId}
          accounts={accounts}
          paymentMethods={catalog?.paymentMethods || []}
          disabled={
            busy ||
            !!pending ||
            !!pendingError ||
            !available ||
            me?.merchant?.status !== "APPROVED" ||
            bond?.bond?.status !== "LOCKED"
          }
          verify={verify}
          submit={(payload) => {
            if (operation.current) return
            void confirm({
              title: "确认发布广告？",
              description: `方向：${payload["side"] === "SELL" ? "出售" : "购买"}\n单价：${payload["price"]} ${market?.fiat}\n数量：${payload["quantity"]} ${market?.asset}\n出售广告会按原请求进行资金确认。`,
              confirmLabel: t("确认发布"),
            }).then((ok) => {
              if (ok) void act(() => submit("AD_PUBLISH", { payload }))
            })
          }}
        />
      </div>
      <div className="c2c-offers">
        {ownAds.length === 0 && <p>{t("暂无已发布广告")}</p>}
        {ownAds.map((ad) => (
          <article key={ad.adId} className="c2c-panel">
            <h3>
              {ad.side === "SELL" ? t("出售") : t("购买")} {ad.market.asset}
            </h3>
            <p>
              {c2cDecimal(ad.price)} {ad.market.fiat} {t(" · 剩余 ")}
              {ad.availableQuantity} · {statusText[ad.status || ""] || ad.status}
            </p>
            {["ACTIVE", "PAUSED"].includes(ad.status || "") &&
              [ad.status === "ACTIVE" ? "PAUSE" : "RESUME", "CLOSE"].map((action) => (
                <button
                  type="button"
                  key={action}
                  disabled={busy}
                  onClick={() => {
                    const run = () =>
                      void act(() =>
                        c2cWrite(owner, `/ads/${ad.adId}/status`, {
                          action,
                          revision: ad.revision,
                          verification,
                        }),
                      )
                    if (action !== "CLOSE") {
                      run()
                      return
                    }
                    void confirm({
                      title: `确认关闭广告 ${ad.adId}？`,
                      description: `${ad.market.asset}/${ad.market.fiat} · 剩余 ${ad.availableQuantity}\n后续资金进度以广告状态为准。`,
                      confirmLabel: t("关闭广告"),
                      danger: true,
                    }).then((ok) => {
                      if (ok) run()
                    })
                  }}
                >
                  {action === "PAUSE"
                    ? t("暂停广告")
                    : action === "RESUME"
                      ? t("恢复广告")
                      : t("关闭广告")}
                </button>
              ))}
          </article>
        ))}
      </div>
      {dialog}
    </>
  )
}
