import { type MutableRefObject, type ReactNode, useEffect, useState } from "react"
import { loadBalances } from "../../api/accountApi"
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
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { navigateInApplication } from "../../hooks/useBrowserNavigation"
import { t, tf } from "../../i18n"
import { AdForm } from "./C2cAdForm"
import { c2cStatusLabel } from "./C2cOrderPanel"

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
  const [applyOpen, setApplyOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [applicationText, setApplicationText] = useState("")
  const [targetFiat, setTargetFiat] = useState("CNY")
  const [targetAsset, setTargetAsset] = useState("USDT")
  const [agreed, setAgreed] = useState(false)
  const [spotBalance, setSpotBalance] = useState<string | null>(null)

  const bondAsset = bond?.policy.configured ? bond.policy.asset : targetAsset
  const bondAmount = bond?.policy.configured ? bond.policy.amount : "0"

  useEffect(() => {
    const controller = new AbortController()
    void loadBalances("SPOT", "SPOT", controller.signal)
      .then((rows) => {
        const match = rows.find((row) => row.asset === bondAsset)
        setSpotBalance(match ? String(match["available"] ?? "0") : "0")
      })
      .catch(() => {
        if (!controller.signal.aborted) setSpotBalance(null)
      })
    return () => controller.abort()
  }, [bondAsset, owner])

  const merchant = me?.merchant ?? null
  const isApproved = merchant?.status === "APPROVED"
  const isPending = merchant?.status === "PENDING"
  const isRejected = merchant?.status === "REJECTED"
  const isSuspended = merchant?.status === "SUSPENDED"
  const notMerchantYet = !merchant || merchant.status === "WITHDRAWN"

  const spotNum = spotBalance !== null ? Number(spotBalance) : null
  const bondNum = bond?.policy.configured ? Number(bondAmount) : 0
  const insufficientSpot =
    bond?.policy.configured && spotNum !== null && Number.isFinite(spotNum) && spotNum < bondNum

  const fiatOptions = Array.from(
    new Set((catalog?.markets || []).map((m) => m.fiat).concat(["CNY", "USD"])),
  )
  const assetOptions = Array.from(
    new Set((catalog?.markets || []).map((m) => m.asset).concat(["USDT"])),
  )

  const openApplyModal = () => {
    setApplicationText(merchant?.application || "")
    setTargetFiat(merchant?.targetFiat || market?.fiat || "CNY")
    setTargetAsset(merchant?.targetAsset || market?.asset || "USDT")
    setAgreed(false)
    setApplyOpen(true)
  }

  const goDeposit = () => {
    navigateInApplication(`/assets/deposit?asset=${encodeURIComponent(bondAsset || "USDT")}`)
  }

  const renderBondDepositRow = () => (
    <div className="c2c-bond-row">
      <span>
        {bond?.policy.configured
          ? tf("保证金：{p0} {p1}", { p0: bondAmount, p1: bondAsset })
          : t("质押规则尚未配置，请等待平台开放")}
      </span>
      {spotBalance !== null && (
        <span className="c2c-muted">
          {t("现货可用")}：{spotBalance} {bondAsset}
        </span>
      )}
      {insufficientSpot && (
        <button type="button" className="c2c-deposit-btn" onClick={goDeposit}>
          {t("去充值")}
        </button>
      )}
    </div>
  )

  return (
    <>
      {notMerchantYet && (
        <div className="c2c-panel c2c-merchant-empty">
          <div className="c2c-merchant-empty-inner">
            <h2>{t("成为 C2C 认证商家")}</h2>
            <p className="c2c-muted">
              {t("开通商家权限后可自主发布买卖广告、管理收款方式并享受专属交易权益。")}
            </p>
            <button type="button" className="c2c-primary c2c-apply-cta" onClick={openApplyModal}>
              {t("申请成为商家")}
            </button>
          </div>
        </div>
      )}

      {(isPending || isRejected || isSuspended) && (
        <div className="c2c-panel c2c-merchant-status-card">
          <div className="c2c-merchant-status-head">
            <div>
              <h2>{t("商家入驻申请")}</h2>
              <p className="c2c-muted">
                {t("面向市场")}：{merchant?.targetAsset || "USDT"} / {merchant?.targetFiat || "CNY"}
              </p>
            </div>
            <span
              className={`c2c-status-pill c2c-status-${(merchant?.status || "PENDING").toLowerCase()}`}
            >
              {c2cStatusLabel(merchant?.status, merchant?.status || "")}
            </span>
          </div>

          {isRejected && merchant?.reviewReason && (
            <div className="c2c-reject-banner" role="alert">
              <strong>{t("审核未通过原因")}：</strong>
              <span>{merchant.reviewReason}</span>
            </div>
          )}

          {isSuspended && merchant?.reviewReason && (
            <div className="c2c-reject-banner" role="alert">
              <strong>{t("停用原因")}：</strong>
              <span>{merchant.reviewReason}</span>
            </div>
          )}

          {merchant?.application && (
            <p className="c2c-application-preview">
              <strong>{t("申请资料")}：</strong>
              {merchant.application}
            </p>
          )}

          {renderBondDepositRow()}

          {bond?.bond && (
            <p className="c2c-muted">
              {t("保证金状态")}：{bond.bond.amount} {bond.bond.asset} ·{" "}
              {c2cStatusLabel(bond.bond.status, bond.bond.status)}
            </p>
          )}

          <div className="c2c-action-row">
            {isRejected && (
              <button type="button" className="c2c-primary" onClick={openApplyModal}>
                {t("重新申请")}
              </button>
            )}
            {canStake &&
              isPending &&
              (!bond?.bond || ["FAILED", "RETURNED"].includes(bond.bond.status)) && (
                <div className="c2c-stake-box">
                  {verify}
                  <button
                    type="button"
                    className="c2c-primary"
                    disabled={busy || !bond?.policy.configured || !!insufficientSpot}
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
                    {t("确认质押保证金")}
                  </button>
                </div>
              )}
          </div>
        </div>
      )}

      {isApproved && (
        <div className="c2c-merchant-approved">
          <div className="c2c-panel c2c-merchant-toolbar">
            <div className="c2c-merchant-toolbar-info">
              <div className="c2c-merchant-badges">
                <span className="c2c-status-pill c2c-status-approved">{t("已认证商家")}</span>
                {merchant?.premiumVerified && (
                  <span className="c2c-badge c2c-badge-premium">{t("优质商户")}</span>
                )}
                {merchant?.freezeCompensation && (
                  <span className="c2c-badge c2c-badge-freeze">{t("冻结必赔")}</span>
                )}
              </div>
              <div className="c2c-merchant-meta">
                {bond?.bond && (
                  <span>
                    {t("保证金")}：{bond.bond.amount} {bond.bond.asset}（
                    {c2cStatusLabel(bond.bond.status, bond.bond.status)}）
                  </span>
                )}
                {merchant?.bdContact && (
                  <span>
                    {t("对接商务")}：{merchant.bdContact}
                  </span>
                )}
              </div>
            </div>
            <div className="c2c-merchant-toolbar-actions">
              {canStake && (!bond?.bond || ["FAILED", "RETURNED"].includes(bond.bond.status)) && (
                <button
                  type="button"
                  disabled={busy || !bond?.policy.configured || !!insufficientSpot}
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
                  {t("质押保证金")}
                </button>
              )}
              {bond?.bond?.status === "LOCKED" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void confirm({
                      title: t("退出商家并退还原质押？"),
                      description: t("须先关闭广告并结清订单和申诉。"),
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
              <button
                type="button"
                className="c2c-primary"
                disabled={busy || bond?.bond?.status !== "LOCKED"}
                onClick={() => setPublishOpen(true)}
              >
                {t("发布广告")}
              </button>
            </div>
          </div>

          <div className="c2c-offers">
            {ownAds.length === 0 && (
              <div className="c2c-panel c2c-offers-empty">
                <p className="c2c-muted">{t("暂无已发布广告，点击右上角「发布广告」开始做市。")}</p>
              </div>
            )}
            {ownAds.map((ad) => (
              <article key={ad.adId} className="c2c-panel c2c-offer-card">
                <div className="c2c-offer-merchant-head">
                  <h3>
                    {ad.side === "SELL" ? t("出售") : t("购买")} {ad.market.asset}
                  </h3>
                  <span className={`c2c-status-pill c2c-status-${(ad.status || "").toLowerCase()}`}>
                    {c2cStatusLabel(ad.status, ad.status ?? "")}
                  </span>
                </div>
                <strong className="c2c-offer-price">
                  {c2cDecimal(ad.price)} {ad.market.fiat}
                </strong>
                <p>
                  {t("剩余数量")}：{ad.availableQuantity} {ad.market.asset}
                </p>
                <p>
                  {t("单笔限额")}：{c2cDecimal(ad.minFiat)} – {c2cDecimal(ad.maxFiat)}{" "}
                  {ad.market.fiat}
                </p>
                <div className="c2c-action-row">
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
                            title: tf("确认关闭广告 {p0}？", { p0: ad.adId }),
                            description: tf(
                              "{p0}/{p1} · 剩余 {p2}\n后续资金进度以广告状态为准。",
                              {
                                p0: ad.market.asset,
                                p1: ad.market.fiat,
                                p2: ad.availableQuantity,
                              },
                            ),
                            confirmLabel: t("关闭广告"),
                            danger: true,
                          }).then((ok) => {
                            if (ok) run()
                          })
                        }}
                      >
                        {action === "PAUSE"
                          ? t("下架广告")
                          : action === "RESUME"
                            ? t("上架广告")
                            : t("删除广告")}
                      </button>
                    ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {applyOpen && (
        <div
          className="c2c-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t("申请成为商家")}
        >
          <div className="c2c-panel c2c-modal">
            <div className="c2c-modal-head">
              <h2>{isRejected ? t("重新申请成为商家") : t("申请成为商家")}</h2>
              <button
                type="button"
                className="c2c-modal-close"
                aria-label={t("关闭")}
                onClick={() => setApplyOpen(false)}
              >
                ×
              </button>
            </div>
            {!me?.kycVerified && (
              <div className="c2c-reject-banner" role="alert">
                <span>{t("申请商家需先完成实名身份认证（KYC）。")}</span>
                <button
                  type="button"
                  className="c2c-deposit-btn"
                  onClick={() => navigateInApplication("/compliance")}
                >
                  {t("去认证")}
                </button>
              </div>
            )}
            <form
              className="c2c-modal-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (!agreed) return
                void act(async () => {
                  await c2cWrite(owner, "/me/merchant-application", {
                    revision: merchant?.revision || "0",
                    application: applicationText.trim(),
                    targetFiat,
                    targetAsset,
                  })
                  setApplyOpen(false)
                }, t("商家申请已提交，请等待平台审核。"))
              }}
            >
              <div className="c2c-modal-grid">
                <label className="c2c-select-field">
                  <span>{t("面向法币市场")}</span>
                  <DropdownSelect
                    value={targetFiat}
                    onChange={(event) => setTargetFiat(event.target.value)}
                  >
                    {fiatOptions.map((fiat) => (
                      <option key={fiat} value={fiat}>
                        {fiat}
                      </option>
                    ))}
                  </DropdownSelect>
                </label>
                <label className="c2c-select-field">
                  <span>{t("面向币种")}</span>
                  <DropdownSelect
                    value={targetAsset}
                    onChange={(event) => setTargetAsset(event.target.value)}
                  >
                    {assetOptions.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset}
                      </option>
                    ))}
                  </DropdownSelect>
                </label>
              </div>

              <label className="c2c-modal-textarea">
                <span>{t("商家申请资料")}</span>
                <textarea
                  name="application"
                  value={applicationText}
                  onChange={(event) => setApplicationText(event.target.value)}
                  minLength={10}
                  maxLength={2000}
                  placeholder={t("请填写主营承兑渠道、日均成交规模、风控经验及联系方式（至少 10 字）")}
                  required
                />
              </label>

              <div className="c2c-bond-box">{renderBondDepositRow()}</div>

              <label className="c2c-checkbox-row">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  required
                />
                <span>{t("我已阅读并同意《C2C 商家服务协议》及现货账户保证金扣押规则")}</span>
              </label>

              <div className="c2c-modal-actions">
                <button type="button" onClick={() => setApplyOpen(false)}>
                  {t("取消")}
                </button>
                <button
                  type="submit"
                  className="c2c-primary"
                  disabled={busy || !agreed || applicationText.trim().length < 10}
                >
                  {t("提交申请")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {publishOpen && (
        <div
          className="c2c-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t("发布广告")}
        >
          <div className="c2c-panel c2c-modal c2c-modal-wide">
            <div className="c2c-modal-head">
              <h2>{t("发布 C2C 广告")}</h2>
              <button
                type="button"
                className="c2c-modal-close"
                aria-label={t("关闭")}
                onClick={() => setPublishOpen(false)}
              >
                ×
              </button>
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
                merchant?.status !== "APPROVED" ||
                bond?.bond?.status !== "LOCKED"
              }
              verify={verify}
              submit={(payload) => {
                if (operation.current) return
                void confirm({
                  title: t("确认发布广告？"),
                  description: tf(
                    "方向：{p0}\n单价：{p1} {p2}\n数量：{p3} {p4}\n出售广告会按原请求进行资金确认。",
                    {
                      p0: payload["side"] === "SELL" ? t("出售") : t("购买"),
                      p1: String(payload["price"] ?? ""),
                      p2: market?.fiat ?? "",
                      p3: String(payload["quantity"] ?? ""),
                      p4: market?.asset ?? "",
                    },
                  ),
                  confirmLabel: t("确认发布"),
                }).then((ok) => {
                  if (ok) {
                    void act(() => submit("AD_PUBLISH", { payload })).then(() => {
                      setPublishOpen(false)
                    })
                  }
                })
              }}
            />
          </div>
        </div>
      )}

      {dialog}
    </>
  )
}
