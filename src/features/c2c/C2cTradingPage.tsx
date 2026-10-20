import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { type C2cConversation, loadC2cStatus, startC2cConversation } from "../../api/c2c"
import {
  adSchema,
  bondSchema,
  type C2cAd,
  type C2cMarket,
  type C2cPendingTrade,
  type C2cQuote,
  type C2cTradingOrder,
  c2cAccounts,
  c2cBond,
  c2cDecimal,
  c2cMarkets,
  c2cMe,
  c2cMyAds,
  c2cRead,
  c2cTradingOrders,
  c2cWrite,
  challengeC2c,
  clearTrade,
  loadPendingTrade,
  orderSchema,
  prepareTrade,
  quoteSchema,
  tradeReceipt,
  type Verification,
} from "../../api/c2cTrading"
import { request } from "../../api/client"
import { unitsToDecimal } from "../../lib/units"
import { useSession } from "../../state/session"
import { C2cPage } from "./C2cPage"
import "./c2c.css"

type Tab = "market" | "orders" | "merchant" | "accounts" | "messages"
const statusText: Record<string, string> = {
  RESERVING: "资金确认中",
  LOCKED: "已质押",
  REFUND_PENDING: "退款处理中",
  RETURNED: "已退回",
  FAILED: "未成功",
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "未通过",
  SUSPENDED: "已停用",
  WITHDRAWN: "已退出",
  ACTIVE: "已上架",
  PAUSED: "已暂停",
  CLOSED: "已关闭",
  CLOSING: "关闭处理中",
  PAYMENT_PENDING: "待付款",
  PAID: "已付款，待放币",
  APPEALED: "申诉中",
  RELEASE_PENDING: "放币处理中",
  COMPLETED: "已完成",
  CANCELED: "已取消",
  EXPIRED: "已超时",
}
export function C2cTradingPage() {
  const session = useSession()
  return session ? (
    <C2cTradingHome key={String(session.user.userId)} owner={String(session.user.userId)} />
  ) : (
    <C2cPage />
  )
}
function C2cTradingHome({ owner }: { owner: string }) {
  const [tab, setTab] = useState<Tab>(
    location.pathname.endsWith("/messages") ? "messages" : "market",
  )
  const [conversation, setConversation] = useState<C2cConversation | undefined>()
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const chat = async (orderId: string) => {
    const room = await startC2cConversation(owner, { orderId })
    if (active.current) {
      setConversation(room)
      setTab("messages")
    }
  }
  return (
    <div className="container section c2c-trading">
      <nav className="c2c-trading-tabs" aria-label="C2C 功能">
        {(
          [
            ["market", "自选交易"],
            ["orders", "我的订单"],
            ["merchant", "商家中心"],
            ["accounts", "收款账户"],
            ["messages", "消息"],
          ] as const
        ).map(([key, title]) => (
          <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
            {title}
          </button>
        ))}
      </nav>
      {tab === "messages" ? (
        <C2cPage {...(conversation ? { initialConversation: conversation } : {})} />
      ) : (
        <TradingWorkspace key={owner} owner={owner} tab={tab} chat={chat} />
      )}
    </div>
  )
}
function TradingWorkspace({
  owner,
  tab,
  chat,
}: {
  owner: string
  tab: Tab
  chat: (orderId: string) => Promise<void>
}) {
  const [runtime, setRuntime] = useState<boolean | null>(null)
  const [available, setAvailable] = useState(false)
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof c2cMarkets>> | null>(null)
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof c2cAccounts>>["items"]>([])
  const [me, setMe] = useState<Awaited<ReturnType<typeof c2cMe>> | null>(null)
  const [bond, setBond] = useState<Awaited<ReturnType<typeof c2cBond>> | null>(null)
  const [ads, setAds] = useState<C2cAd[]>([]),
    [ownAds, setOwnAds] = useState<C2cAd[]>([]),
    [orders, setOrders] = useState<C2cTradingOrder[]>([])
  const [marketId, setMarketId] = useState(""),
    [side, setSide] = useState<"BUY" | "SELL">("BUY")
  const [amount, setAmount] = useState(""),
    [method, setMethod] = useState("")
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<C2cAd | null>(null),
    [order, setOrder] = useState<C2cTradingOrder | null>(null),
    [quote, setQuote] = useState<C2cQuote | null>(null)
  const [quantity, setQuantity] = useState(""),
    [payment, setPayment] = useState(""),
    [reason, setReason] = useState("")
  const [verification, setVerification] = useState<Verification>({ emailCode: "", totpCode: "" })
  const [pending, setPending] = useState<C2cPendingTrade | null>(() => loadPendingTrade(owner)),
    [receiptState, setReceiptState] = useState("")
  const live = useRef(true),
    operation = useRef(false)
  const market = catalog?.markets.find((row) => row.marketId === marketId)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    void loadC2cStatus(abort.signal)
      .then(async (status) => {
        if (abort.signal.aborted) return null
        setRuntime(status.runtimeEnabled)
        setAvailable(status.available)
        if (!status.runtimeEnabled) return null
        return Promise.all([
          c2cMarkets(owner, abort.signal),
          c2cAccounts(owner, abort.signal),
          c2cMe(owner, abort.signal),
          c2cBond(owner, abort.signal),
          c2cMyAds(owner, abort.signal),
          c2cTradingOrders(owner, abort.signal),
        ])
      })
      .then(async (values) => {
        if (!values) return
        const [markets, a, profile, b, mine, history] = values
        if (abort.signal.aborted) return
        const pendingBond = sessionStorage.getItem(`surprising.c2c.bond.${owner}`)
        if (pendingBond) {
          const known =
            b.bond?.requestId === pendingBond
              ? b
              : await c2cRead(
                  owner,
                  `/me/merchant-bond?requestId=${encodeURIComponent(pendingBond)}`,
                  bondSchema,
                  abort.signal,
                )
          if (known.bond && !abort.signal.aborted)
            sessionStorage.removeItem(`surprising.c2c.bond.${owner}`)
        }
        setCatalog(markets)
        setMarketId((old) => old || markets.markets[0]?.marketId || "")
        setAccounts(a.items)
        setMe(profile)
        setBond(b)
        setOwnAds(mine.items)
        setOrders(history.items)
        setOrder((old) =>
          old ? (history.items.find((row) => row.orderId === old.orderId) ?? old) : null,
        )
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setError(message(failure))
      })
    return () => abort.abort()
  }, [owner, revision])
  useEffect(() => {
    if (tab !== "market" || !marketId || !available) {
      setAds([])
      return
    }
    const abort = new AbortController()
    const query = new URLSearchParams({
      marketId,
      side,
      ...(amount ? { amount } : {}),
      ...(method ? { methodCode: method } : {}),
    })
    const timer = setTimeout(() => {
      void c2cRead(owner, `/ads?${query}`, z.object({ items: z.array(adSchema) }), abort.signal)
        .then((page) => {
          if (!abort.signal.aborted) setAds(page.items)
        })
        .catch((failure: unknown) => {
          if (!abort.signal.aborted) {
            setAds([])
            setError(message(failure))
          }
        })
    }, 200)
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [owner, tab, marketId, side, amount, method, revision, available])
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !operation.current) refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    setError("")
    setSelected(null)
    setQuote(null)
    setOrder(null)
  }, [tab])
  const act = async (action: () => Promise<unknown>, success = "操作已提交，请刷新确认进度") => {
    if (operation.current) return
    operation.current = true
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      if (live.current) {
        setNotice(success)
        refresh()
      }
    } catch (failure) {
      if (live.current) setError(message(failure))
    } finally {
      operation.current = false
      if (live.current) setBusy(false)
    }
  }
  const confirmReceipt = async (original: C2cPendingTrade) => {
    const receipt = await tradeReceipt(owner, original)
    if (!live.current) return
    setReceiptState(receipt.status)
    if (["SUCCEEDED", "REJECTED", "STOPPED"].includes(receipt.status)) {
      clearTrade(owner)
      setPending(null)
      if (receipt.status === "REJECTED")
        throw Error(receipt.errorMessage || "原请求未成交，请刷新后重新操作")
      if (original.kind === "ORDER_CREATE" && receipt.resultId) {
        const row = await c2cRead(owner, `/orders/${receipt.resultId}`, orderSchema)
        if (live.current) {
          setOrder(row)
          setSelected(null)
          setQuote(null)
        }
      }
    }
    refresh()
  }
  const sendOriginal = async (original: C2cPendingTrade) => {
    await c2cWrite(owner, original.kind === "ORDER_CREATE" ? "/orders" : "/ads", {
      ...original.body,
      verification,
    })
    await confirmReceipt(original)
  }
  const submit = async (kind: C2cPendingTrade["kind"], input: Record<string, unknown>) => {
    const original = await prepareTrade(owner, kind, input)
    if (live.current) {
      setPending(original)
      setReceiptState("")
    }
    await sendOriginal(original)
  }
  const choose = async (ad: C2cAd) => {
    const detail = await c2cRead(owner, `/ads/${ad.adId}`, adSchema)
    if (!live.current) return
    setSelected(detail)
    setQuote(null)
    setQuantity("")
    setPayment(
      ad.side === "SELL"
        ? detail.paymentOptions?.[0]?.accountId || ""
        : accounts.find((a) => a.status === "APPROVED" && a.fiat === ad.market.fiat)?.accountId ||
            "",
    )
  }
  const field = (
    label: string,
    value: string,
    update: (value: string) => void,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label>
      {label}
      <input {...extra} value={value} onChange={(event) => update(event.target.value)} />
    </label>
  )
  const verify = (
    <div className="c2c-form-row">
      <button
        type="button"
        disabled={busy}
        onClick={() => void act(() => challengeC2c(owner), "验证码已发送")}
      >
        获取资金验证码
      </button>
      {field(
        "邮箱验证码",
        verification.emailCode,
        (emailCode) => setVerification({ ...verification, emailCode }),
        { autoComplete: "one-time-code", inputMode: "numeric" },
      )}
      {field(
        "验证器验证码（已绑定时）",
        verification.totpCode,
        (totpCode) => setVerification({ ...verification, totpCode }),
        { inputMode: "numeric" },
      )}
    </div>
  )
  const title = (
    <>
      <h1>C2C 交易</h1>
      {error && (
        <p role="alert" className="c2c-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button type="button" disabled={busy} onClick={refresh}>
        刷新状态
      </button>
      {pending && (
        <div className="c2c-panel">
          <p>
            原请求结果{receiptState ? `：${receiptState}` : "待确认"}，请先查询，勿另建订单或广告。
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => confirmReceipt(pending), "已查询原请求")}
          >
            查询原请求
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await c2cWrite(owner, `/submissions/${pending.requestKey}/stop`, {
                  kind: pending.kind,
                  requestHash: pending.requestHash,
                })
                await confirmReceipt(pending)
              }, "已查询并停止尚未开始的原请求")
            }
          >
            停止未开始的请求
          </button>
          {receiptState === "UNKNOWN" && (
            <>
              {verify}
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => sendOriginal(pending))}
              >
                按原请求重试
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
  if (runtime === false) return <p>C2C 暂未开放</p>
  return (
    <section>
      {title}
      {order && (
        <OrderActions
          owner={owner}
          order={order}
          busy={busy}
          verify={verify}
          reason={reason}
          setReason={setReason}
          close={() => setOrder(null)}
          chat={chat}
          act={act}
          verification={verification}
        />
      )}
      {!order && tab === "market" && (
        <>
          <div className="c2c-form-row">
            <button
              type="button"
              aria-pressed={side === "BUY"}
              disabled={busy}
              onClick={() => {
                setSide("BUY")
                setSelected(null)
                setQuote(null)
              }}
            >
              我要买
            </button>
            <button
              type="button"
              aria-pressed={side === "SELL"}
              disabled={busy}
              onClick={() => {
                setSide("SELL")
                setSelected(null)
                setQuote(null)
              }}
            >
              我要卖
            </button>
            <label>
              交易市场
              <select
                value={marketId}
                onChange={(event) => {
                  setMarketId(event.target.value)
                  setSelected(null)
                  setQuote(null)
                }}
              >
                {catalog?.markets.map((m) => (
                  <option key={m.marketId} value={m.marketId}>
                    {m.asset} / {m.fiat}
                  </option>
                ))}
              </select>
            </label>
            {field("法币金额筛选", amount, setAmount, { inputMode: "decimal" })}
            <label>
              支付方式
              <select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="">全部方式</option>
                {catalog?.paymentMethods
                  .filter((m) => !market || m.currencies.includes(market.fiat))
                  .map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="c2c-offers">
            {ads.length === 0 && <p>{available ? "暂无符合条件的广告" : "C2C 市场暂未开放"}</p>}
            {ads
              .filter(
                (ad) =>
                  ad.market.marketId === marketId && ad.side === (side === "BUY" ? "SELL" : "BUY"),
              )
              .map((ad) => (
                <article key={ad.adId} className="c2c-panel">
                  <h2>{ad.merchant?.nickname || `商家 ${ad.makerUserId}`}</h2>
                  <strong>
                    {c2cDecimal(ad.price)} {ad.market.fiat}
                  </strong>
                  <p>
                    可交易 {ad.availableQuantity} {ad.market.asset}
                  </p>
                  <p>
                    限额 {c2cDecimal(ad.minFiat)} – {c2cDecimal(ad.maxFiat)} {ad.market.fiat}
                  </p>
                  <p>{ad.methodCodes.join(" · ")}</p>
                  <button
                    type="button"
                    disabled={busy || ad.makerUserId === owner || !!pending}
                    onClick={() => void act(() => choose(ad), "请确认数量和收款方式")}
                  >
                    {ad.makerUserId === owner ? "本人广告" : ad.side === "SELL" ? "购买" : "出售"}
                  </button>
                </article>
              ))}
          </div>
        </>
      )}
      {selected && tab === "market" && (
        <section className="c2c-panel" aria-label="确认交易">
          <h2>
            确认{selected.side === "SELL" ? "购买" : "出售"} {selected.market.asset}
          </h2>
          {field(
            "交易数量",
            quantity,
            (value) => {
              setQuantity(value)
              setQuote(null)
            },
            { inputMode: "decimal" },
          )}
          <label>
            收款方式
            <select
              value={payment}
              onChange={(event) => {
                setPayment(event.target.value)
                setQuote(null)
              }}
            >
              <option value="">请选择</option>
              {selected.side === "SELL"
                ? selected.paymentOptions?.map((a) => (
                    <option key={a.accountId} value={a.accountId}>
                      {a.methodCode} {a.maskedLabel}
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
                        {a.methodCode} {a.maskedLabel}
                      </option>
                    ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !quantity || !payment || !!pending}
            onClick={() =>
              void act(async () => {
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
                if (live.current) setQuote(value)
              }, "报价已生成，请核对费用和实收数量")
            }
          >
            获取报价
          </button>
          {quote && (
            <>
              <p>
                付款 {c2cDecimal(quote.fiatAmount)} {quote.market.fiat} · 数量 {quote.quantity}{" "}
                {quote.market.asset}
              </p>
              <p>
                手续费 {unitsToDecimal(quote.buyerFeeUnits, quote.market.assetScale)} · 买方实收{" "}
                {unitsToDecimal(quote.buyerReceivesUnits, quote.market.assetScale)}{" "}
                {quote.market.asset}
              </p>
              <p>报价有效至 {new Date(quote.expiresAt).toLocaleTimeString()}</p>
              {selected.side === "BUY" && verify}
              <button
                type="button"
                disabled={busy || !quote.valid || !!pending}
                onClick={() => void act(() => submit("ORDER_CREATE", { quoteId: quote.quoteId }))}
              >
                确认下单
              </button>
            </>
          )}
        </section>
      )}
      {!order && tab === "orders" && (
        <div className="c2c-offers">
          {orders.map((row) => (
            <button
              type="button"
              className="c2c-panel"
              key={row.orderId}
              onClick={() => setOrder(row)}
            >
              {row.buyerUserId === owner ? "购买" : "出售"} {row.quantity} {row.market.asset} ·{" "}
              {c2cDecimal(row.fiatAmount)} {row.market.fiat}
              <br />
              {statusText[row.status] || row.status}
              <small>{row.orderId}</small>
            </button>
          ))}
        </div>
      )}
      {!order && tab === "merchant" && (
        <>
          <div className="c2c-panel">
            <h2>商家资格与质押</h2>
            <p>
              身份认证：{me?.kycVerified ? "已认证" : "待认证"} · 商家：
              {statusText[me?.merchant?.status || ""] || "未申请"}
            </p>
            {me?.merchant?.reviewReason && <p>{me.merchant.reviewReason}</p>}
            {(!me?.merchant ||
              ["REJECTED", "WITHDRAWN", "PENDING"].includes(me.merchant.status)) && (
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
                  商家申请资料
                  <textarea name="application" minLength={10} maxLength={2000} required />
                </label>
                <button type="submit" disabled={busy}>
                  提交申请
                </button>
              </form>
            )}
            <p>
              {bond?.policy.configured
                ? `保证金：${bond.policy.amount} ${bond.policy.asset}`
                : "质押规则尚未配置，请等待平台开放"}
            </p>
            {bond?.bond && (
              <p>
                {bond.bond.amount} {bond.bond.asset} ·{" "}
                {statusText[bond.bond.status] || bond.bond.status}
              </p>
            )}
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
              确认质押
            </button>
            {bond?.bond?.status === "LOCKED" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("退出商家并退还原质押？须先关闭广告并结清订单和申诉。"))
                    void act(() =>
                      c2cWrite(
                        owner,
                        `/me/merchant-bonds/${bond.bond?.bondId}/withdraw`,
                        undefined,
                      ),
                    )
                }}
              >
                退出商家并退押
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
              me?.merchant?.status !== "APPROVED" ||
              bond?.bond?.status !== "LOCKED"
            }
            verify={verify}
            submit={(payload) => void act(() => submit("AD_PUBLISH", { payload }))}
          />
          <div className="c2c-offers">
            {ownAds.map((ad) => (
              <article key={ad.adId} className="c2c-panel">
                <h3>
                  {ad.side === "SELL" ? "出售" : "购买"} {ad.market.asset}
                </h3>
                <p>
                  {c2cDecimal(ad.price)} {ad.market.fiat} · 剩余 {ad.availableQuantity} ·{" "}
                  {statusText[ad.status || ""] || ad.status}
                </p>
                {["ACTIVE", "PAUSED"].includes(ad.status || "") &&
                  [ad.status === "ACTIVE" ? "PAUSE" : "RESUME", "CLOSE"].map((action) => (
                    <button
                      type="button"
                      key={action}
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          c2cWrite(owner, `/ads/${ad.adId}/status`, {
                            action,
                            revision: ad.revision,
                            verification,
                          }),
                        )
                      }
                    >
                      {action === "PAUSE"
                        ? "暂停广告"
                        : action === "RESUME"
                          ? "恢复广告"
                          : "关闭广告"}
                    </button>
                  ))}
              </article>
            ))}
          </div>
        </>
      )}
      {!order && tab === "accounts" && (
        <>
          <div className="c2c-offers">
            {accounts.map((a) => (
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
                  onClick={() =>
                    void act(() =>
                      c2cWrite(owner, `/payment-accounts/${a.accountId}/disable`, {
                        revision: a.revision,
                        verification,
                      }),
                    )
                  }
                >
                  停用账户
                </button>
              </article>
            ))}
          </div>
          <form
            className="c2c-panel"
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              void act(
                () =>
                  c2cWrite(owner, "/payment-accounts", {
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
                "收款资料已提交，审核通过后可使用",
              )
            }}
          >
            <h2>添加实名收款账户</h2>
            <label>
              收款方式
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
              本人姓名
              <input name="holder" required maxLength={120} />
            </label>
            <label>
              收款账号
              <input name="number" required maxLength={200} />
            </label>
            <label>
              开户银行（银行卡必填）
              <input name="bank" maxLength={200} />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() => challengeC2c(owner, "SECURITY_SETTINGS"), "验证码已发送")
              }
            >
              获取设置验证码
            </button>
            {field("邮箱验证码", verification.emailCode, (emailCode) =>
              setVerification({ ...verification, emailCode }),
            )}
            {field("验证器验证码（已绑定时）", verification.totpCode, (totpCode) =>
              setVerification({ ...verification, totpCode }),
            )}
            <button type="submit" disabled={busy || !market}>
              提交实名收款审核
            </button>
          </form>
        </>
      )}
    </section>
  )
}
function OrderActions({
  owner,
  order,
  busy,
  verify,
  reason,
  setReason,
  close,
  chat,
  act,
  verification,
}: {
  owner: string
  order: C2cTradingOrder
  busy: boolean
  verify: React.ReactNode
  reason: string
  setReason: (value: string) => void
  close: () => void
  chat: (orderId: string) => Promise<void>
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
  verification: Verification
}) {
  const [payment, setPayment] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    setPayment(null)
  }, [order.orderId])
  const action = (path: string, body: unknown) =>
    void act(() => c2cWrite(owner, `/orders/${order.orderId}/${path}`, body))
  const ongoing = [
    "PAYMENT_PENDING",
    "PAID",
    "APPEALED",
    "RELEASE_PENDING",
    "REFUND_PENDING",
  ].includes(order.status)
  return (
    <section className="c2c-panel" aria-label="交易订单">
      <h2>{statusText[order.status] || order.status}</h2>
      <small>{order.orderId}</small>
      <p>
        {order.quantity} {order.market.asset} · {c2cDecimal(order.fiatAmount)} {order.market.fiat}
      </p>
      <p>
        手续费 {unitsToDecimal(order.buyerFeeUnits, order.market.assetScale)} · 买方实收{" "}
        {unitsToDecimal(order.buyerReceivesUnits, order.market.assetScale)} {order.market.asset}
      </p>
      {order.paymentExpiresAt && (
        <p>付款截止 {new Date(order.paymentExpiresAt).toLocaleString()}</p>
      )}
      <p>{order.terms}</p>
      {ongoing && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const value = await c2cRead(
                owner,
                `/orders/${order.orderId}`,
                z.record(z.string(), z.unknown()),
              )
              setPayment(value["payment"] as Record<string, unknown>)
            }, "请核对本订单收款资料")
          }
        >
          查看订单收款资料
        </button>
      )}
      {payment && (
        <pre className="c2c-payment">
          {["holderName", "accountNumber", "bankName", "methodCode"]
            .map(
              (key) =>
                `${({ holderName: "姓名", accountNumber: "账号", bankName: "银行", methodCode: "方式" } as Record<string, string>)[key]}：${String(payment[key] ?? "")}`,
            )
            .join("\n")}
        </pre>
      )}
      {order.status === "PAYMENT_PENDING" && order.buyerUserId === owner && (
        <>
          <p>请使用本人账户按订单资料在站外转账，实际完成付款后再确认。</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("确认已按本订单收款资料完成付款？"))
                action("paid", { proofId: null })
            }}
          >
            我已付款，通知卖家
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => action("cancel", { reason: reason || "买家取消未付款订单" })}
          >
            取消未付款订单
          </button>
        </>
      )}
      {order.status === "PAID" && order.sellerUserId === owner && (
        <>
          <p>务必核对收款账户实际到账，聊天与凭证不代表到账。</p>
          {verify}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm("已核实实际到账，确认放币？")) action("release", verification)
            }}
          >
            确认到账并放币
          </button>
        </>
      )}
      {["PAYMENT_PENDING", "PAID"].includes(order.status) && (
        <>
          <label>
            取消或申诉原因
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </label>
          <button
            type="button"
            disabled={busy || reason.trim().length < 5}
            onClick={() => action("appeal", { reason })}
          >
            提交申诉
          </button>
        </>
      )}
      <button type="button" onClick={() => void act(() => chat(order.orderId), "订单会话已打开")}>
        进入订单消息
      </button>
      <button type="button" onClick={close}>
        收起订单
      </button>
    </section>
  )
}
function AdForm({
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
      className="c2c-panel"
      onSubmit={(event) => {
        event.preventDefault()
        if (!market) return
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
      <h2>发布广告</h2>
      <label>
        市场
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
        广告方向
        <select value={side} onChange={(event) => setSide(event.target.value)}>
          <option value="SELL">商家出售</option>
          <option value="BUY">商家购买</option>
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
          收款账户
          <select name="account" aria-label="收款账户" required>
            <option value="">请选择</option>
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
          付款方式
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
      <label>
        交易条款
        <textarea name="terms" maxLength={2000} />
      </label>
      {verify}
      <button type="submit" disabled={disabled || !market}>
        确认发布广告
      </button>
    </form>
  )
}
function message(failure: unknown) {
  return failure instanceof Error ? failure.message : "操作未完成，请查询后重试"
}
