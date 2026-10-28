import {
  ArrowLeftRight,
  ClipboardList,
  MessageCircle,
  RefreshCw,
  Store,
  Wallet,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { type C2cConversation, loadC2cStatus, startC2cConversation } from "../../api/c2c"
import {
  accountSchema,
  adDetailSchema,
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
  prepareTrade,
  quoteSchema,
  tradeReceipt,
  type Verification,
} from "../../api/c2cTrading"
import { request } from "../../api/client"
import { unitsToDecimal } from "../../lib/units"
import { useSession } from "../../state/session"
import { C2cMarketPreview } from "./C2cMarketPreview"
import { C2cOrderPanel, responseDeadline, c2cStatusText as statusText } from "./C2cOrderPanel"
import { C2cPage } from "./C2cPage"
import "./c2c.css"

type Tab = "market" | "orders" | "merchant" | "accounts" | "messages"
export function C2cTradingPage() {
  const session = useSession()
  return session ? (
    <C2cTradingHome key={String(session.user.userId)} owner={String(session.user.userId)} />
  ) : location.pathname.endsWith("/messages") ? (
    <C2cPage />
  ) : (
    <C2cMarketPreview />
  )
}
function C2cTradingHome({ owner }: { owner: string }) {
  const [tab, setTab] = useState<Tab>(
    location.pathname.endsWith("/messages") ? "messages" : "market",
  )
  const [conversation, setConversation] = useState<C2cConversation | undefined>()
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const workspaceLock = useRef(false)
  const changeBusy = useCallback((value: boolean) => {
    workspaceLock.current = value
    setWorkspaceBusy(value)
  }, [])
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const chat = async (orderId: string) => {
    try {
      const room = await startC2cConversation(owner, { orderId })
      if (active.current) {
        setConversation(room)
        setTab("messages")
      }
    } catch (failure) {
      throw new Error("订单消息暂不可用，请稍后重试。", { cause: failure })
    }
  }
  return (
    <div className="container section c2c-trading">
      <nav className="c2c-trading-tabs" aria-label="C2C 功能">
        {(
          [
            ["market", "自选交易", ArrowLeftRight],
            ["orders", "我的订单", ClipboardList],
            ["merchant", "商家中心", Store],
            ["accounts", "收款账户", Wallet],
            ["messages", "消息", MessageCircle],
          ] as const
        ).map(([key, title, Icon]) => (
          <button
            type="button"
            key={key}
            disabled={workspaceBusy}
            aria-pressed={tab === key}
            onClick={() => {
              if (!workspaceLock.current) setTab(key)
            }}
          >
            <Icon size={17} aria-hidden="true" />
            {title}
          </button>
        ))}
      </nav>
      {tab === "messages" ? (
        <C2cPage {...(conversation ? { initialConversation: conversation } : {})} />
      ) : (
        <TradingWorkspace
          key={owner}
          owner={owner}
          tab={tab}
          chat={chat}
          onBusyChange={changeBusy}
        />
      )}
    </div>
  )
}
function TradingWorkspace({
  owner,
  tab,
  chat,
  onBusyChange,
}: {
  owner: string
  tab: Tab
  chat: (orderId: string) => Promise<void>
  onBusyChange: (busy: boolean) => void
}) {
  const [runtime, setRuntime] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("")
  const [readReady, setReadReady] = useState<Record<string, boolean>>({})
  const [readErrors, setReadErrors] = useState<Record<string, string>>({})
  const [adsLoading, setAdsLoading] = useState(false),
    [adsError, setAdsError] = useState("")
  const [accountPage, setAccountPage] = useState(0)
  const [adOffset, setAdOffset] = useState(0),
    [adMore, setAdMore] = useState(false)
  const [orderOffset, setOrderOffset] = useState(0),
    [orderMore, setOrderMore] = useState(false)
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
    [order, setOrder] = useState<string | null>(null),
    [quote, setQuote] = useState<C2cQuote | null>(null)
  const [quantity, setQuantity] = useState(""),
    [payment, setPayment] = useState("")
  const [verification, setVerification] = useState<Verification>({ emailCode: "", totpCode: "" })
  const [pendingSnapshot] = useState(() => {
    try {
      return { pending: loadPendingTrade(owner), error: "" }
    } catch {
      return {
        pending: null,
        error: "本地原请求无法读取，请恢复存储后重新核对；确认前不能新建订单或广告。",
      }
    }
  })
  const [pendingError, setPendingError] = useState(pendingSnapshot.error)
  const [pending, setPending] = useState<C2cPendingTrade | null>(pendingSnapshot.pending),
    [receiptState, setReceiptState] = useState("")
  const live = useRef(true),
    operation = useRef(false)
  const reading = useRef(false),
    offersReading = useRef(false)
  const confirmationPanel = useRef<HTMLElement>(null),
    orderTrigger = useRef<HTMLButtonElement | null>(null),
    pageHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (selected) {
      confirmationPanel.current?.focus({ preventScroll: true })
      confirmationPanel.current?.scrollIntoView({ block: "start" })
    }
  }, [selected])
  const closeOrder = () => {
    setOrder(null)
    setNotice("")
    setError("")
    requestAnimationFrame(() => {
      if (orderTrigger.current?.isConnected) orderTrigger.current.focus()
      else pageHeading.current?.focus()
    })
  }
  const [quoteDeadline, setQuoteDeadline] = useState<number | null>(null),
    [quoteExpired, setQuoteExpired] = useState(false)
  const market = catalog?.markets.find((row) => row.marketId === marketId)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => () => onBusyChange(false), [onBusyChange])
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    reading.current = true
    setLoading(true)
    setLoadError("")
    void loadC2cStatus(abort.signal)
      .then(async (status) => {
        if (abort.signal.aborted) return null
        setRuntime(status.runtimeEnabled)
        setAvailable(status.available)
        if (!status.runtimeEnabled) return null
        return Promise.allSettled([
          c2cMarkets(owner, abort.signal),
          c2cAccounts(owner, abort.signal),
          c2cMe(owner, abort.signal),
          c2cBond(owner, abort.signal),
          c2cMyAds(owner, abort.signal),
          c2cTradingOrders(owner, abort.signal, orderOffset),
        ])
      })
      .then(async (values) => {
        if (!values) return
        const [markets, a, profile, b, mine, history] = values
        if (abort.signal.aborted) return
        const names = ["catalog", "accounts", "me", "bond", "ownAds", "orders"]
        setReadReady(
          Object.fromEntries(
            values.map((value, index) => [names[index], value.status === "fulfilled"]),
          ),
        )
        setReadErrors(
          Object.fromEntries(
            values.flatMap((value, index) =>
              value.status === "rejected" ? [[names[index], message(value.reason)]] : [],
            ),
          ),
        )
        if (markets.status === "fulfilled") {
          setCatalog(markets.value)
          setMarketId((old) =>
            markets.value.markets.some((row) => row.marketId === old)
              ? old
              : markets.value.markets[0]?.marketId || "",
          )
        }
        if (a.status === "fulfilled") setAccounts(a.value.items)
        if (profile.status === "fulfilled") setMe(profile.value)
        if (b.status === "fulfilled") setBond(b.value)
        if (mine.status === "fulfilled") setOwnAds(mine.value.items)
        if (history.status === "fulfilled") {
          if (
            history.value.items.some(
              (row) => row.buyerUserId !== owner && row.sellerUserId !== owner,
            )
          )
            throw Error("订单列表归属不匹配")
          setOrders(history.value.items)
          setOrderMore(history.value.hasMore)
        }
        try {
          const pendingBond = sessionStorage.getItem(`surprising.c2c.bond.${owner}`)
          if (pendingBond && b.status === "fulfilled") {
            const known =
              b.value.bond?.requestId === pendingBond
                ? b.value
                : await c2cRead(
                    owner,
                    `/me/merchant-bond?requestId=${encodeURIComponent(pendingBond)}`,
                    bondSchema,
                    abort.signal,
                  )
            if (known.bond && !abort.signal.aborted)
              sessionStorage.removeItem(`surprising.c2c.bond.${owner}`)
          }
        } catch (failure) {
          if (!abort.signal.aborted) {
            setReadReady((value) => ({ ...value, bond: false }))
            setReadErrors((value) => ({ ...value, bond: message(failure) }))
          }
        }
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setLoadError(message(failure))
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          reading.current = false
          setLoading(false)
        }
      })
    return () => {
      abort.abort()
      reading.current = false
    }
  }, [owner, revision, orderOffset])
  useEffect(() => {
    if (tab !== "market" || !marketId || !available) {
      setAds([])
      setAdsLoading(false)
      setAdMore(false)
      return
    }
    const abort = new AbortController()
    offersReading.current = true
    setAdsLoading(true)
    setAdsError("")
    const query = new URLSearchParams({
      marketId,
      side,
      limit: "20",
      offset: String(adOffset),
      ...(amount ? { amount } : {}),
      ...(method ? { methodCode: method } : {}),
    })
    const timer = setTimeout(() => {
      void c2cRead(
        owner,
        `/ads?${query}`,
        z.object({
          items: z
            .array(adSchema)
            .max(20)
            .refine((rows) => new Set(rows.map((row) => row.adId)).size === rows.length),
          hasMore: z.boolean(),
          offset: z.number().int().nonnegative(),
        }),
        abort.signal,
      )
        .then((page) => {
          if (
            page.offset !== adOffset ||
            page.items.some(
              (row) =>
                row.market.marketId !== marketId || row.side !== (side === "BUY" ? "SELL" : "BUY"),
            )
          )
            throw Error("广告响应与当前市场或方向不匹配，请重新查询")
          if (!abort.signal.aborted) {
            setAds(page.items)
            setAdMore(page.hasMore)
          }
        })
        .catch((failure: unknown) => {
          if (!abort.signal.aborted) {
            setAds([])
            setAdMore(false)
            setAdsError(message(failure))
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) {
            offersReading.current = false
            setAdsLoading(false)
          }
        })
    }, 200)
    return () => {
      abort.abort()
      clearTimeout(timer)
      offersReading.current = false
    }
  }, [owner, tab, marketId, side, amount, method, revision, available, adOffset])
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !operation.current &&
        !reading.current &&
        !offersReading.current
      )
        refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    setError("")
    setNotice("")
    setSelected(null)
    setQuote(null)
    setOrder(null)
    setVerification({ emailCode: "", totpCode: "" })
  }, [tab])
  useEffect(() => {
    if (quoteDeadline === null) {
      setQuoteExpired(false)
      return
    }
    setQuoteExpired(performance.now() >= quoteDeadline)
    const timer = setTimeout(
      () => setQuoteExpired(true),
      Math.max(0, quoteDeadline - performance.now()),
    )
    return () => clearTimeout(timer)
  }, [quoteDeadline])
  const act = async (action: () => Promise<unknown>, success = "操作已提交，请刷新确认进度") => {
    if (operation.current) return
    operation.current = true
    onBusyChange(true)
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
      onBusyChange(false)
      if (live.current) {
        setBusy(false)
        setVerification({ emailCode: "", totpCode: "" })
      }
    }
  }
  const confirmReceipt = async (original: C2cPendingTrade) => {
    const receipt = await tradeReceipt(owner, original)
    if (!live.current) return
    setReceiptState(receipt.status)
    if (["SUCCEEDED", "REJECTED"].includes(receipt.status)) {
      clearTrade(owner)
      setPending(null)
      if (receipt.status === "REJECTED" && receipt.errorCode !== "REQUEST_STOPPED")
        throw Error(receipt.message || "原请求未成交，请刷新后重新操作")
      if (original.kind === "ORDER_CREATE" && receipt.resultId) {
        if (live.current) {
          setOrder(receipt.resultId)
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
    if (pendingError) throw Error(pendingError)
    if (
      kind === "ORDER_CREATE" &&
      (!quote?.valid || quoteDeadline === null || performance.now() >= quoteDeadline)
    )
      throw Error("报价已失效，请重新获取报价后确认")
    if (kind === "ORDER_CREATE" && quote) {
      const current = await c2cRead(owner, `/quotes/${quote.quoteId}`, quoteSchema)
      if (
        !current.valid ||
        current.quoteId !== quote.quoteId ||
        current.ownerUserId !== owner ||
        current.adId !== selected?.adId ||
        current.paymentAccountId !== payment ||
        current.market.marketId !== selected.market.marketId ||
        performance.now() >= (quoteDeadline ?? 0)
      ) {
        setQuote(null)
        throw Error("报价或收款方式已变更，请重新获取报价")
      }
    }
    const original = await prepareTrade(owner, kind, input)
    if (live.current) {
      setPending(original)
      setReceiptState("")
    }
    await sendOriginal(original)
  }
  const choose = async (ad: C2cAd) => {
    const detail = await c2cRead(owner, `/ads/${ad.adId}`, adDetailSchema)
    if (
      detail.adId !== ad.adId ||
      detail.market.marketId !== ad.market.marketId ||
      detail.side !== ad.side
    )
      throw Error("广告详情归属不匹配，请重新选择")
    if (!live.current) return
    setSelected(detail)
    setQuote(null)
    setVerification({ emailCode: "", totpCode: "" })
    setQuantity("")
    setPayment(
      ad.side === "SELL"
        ? detail.paymentOptions?.[0]?.accountId || ""
        : accounts.find(
            (a) =>
              a.status === "APPROVED" &&
              a.fiat === ad.market.fiat &&
              detail.methodCodes.includes(a.methodCode),
          )?.accountId || "",
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
  const clearOfferSelection = () => {
    setAds([])
    setAdsLoading(true)
    setAdsError("")
    setAdOffset(0)
    setSelected(null)
    setQuote(null)
    setVerification({ emailCode: "", totpCode: "" })
  }
  const required = order
    ? []
    : tab === "orders"
      ? ["orders"]
      : tab === "market"
        ? ["catalog"]
        : tab === "accounts"
          ? ["catalog", "accounts"]
          : ["catalog", "accounts", "me", "bond", "ownAds"]
  const canStake =
    !!bond?.policy.configured &&
    ["PENDING", "APPROVED"].includes(me?.merchant?.status || "") &&
    (!bond?.bond || ["FAILED", "RETURNED"].includes(bond.bond.status))
  const accountPages = Math.max(1, Math.ceil(accounts.length / 8))
  const currentAccountPage = Math.min(accountPage, accountPages - 1)
  const workspaceReady =
    !!order || (runtime === true && !loadError && required.every((name) => readReady[name]))
  const workspaceErrors = required.map((name) => readErrors[name]).filter(Boolean)
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
      <div className="c2c-trading-heading">
        <div>
          <h1 ref={pageHeading} tabIndex={-1}>
            C2C 交易
          </h1>
          <p>核对交易对象、金额与收款资料，在订单内完成付款确认和售后沟通。</p>
        </div>
        <ArrowLeftRight size={28} aria-hidden="true" />
      </div>
      {error && (
        <p role="alert" className="c2c-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        disabled={busy || loading}
        onClick={() => {
          setError("")
          refresh()
        }}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {loading ? "正在同步状态…" : "刷新状态"}
      </button>
      {loadError && (
        <p role="alert" className="c2c-error">
          {loadError}
        </p>
      )}
      {pendingError && (
        <div className="c2c-panel">
          <p role="alert" className="c2c-error">
            {pendingError}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              try {
                setPending(loadPendingTrade(owner))
                setPendingError("")
              } catch {
                setPendingError("本地原请求仍不可用，请先恢复存储后重试。")
              }
            }}
          >
            重新读取本地请求
          </button>
        </div>
      )}
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
            onClick={() => {
              if (
                operation.current ||
                !window.confirm(
                  `确认停止尚未开始的原请求？\n请求：${pending.requestKey}\n该操作不会取消已经接收的交易。`,
                )
              )
                return
              void act(async () => {
                await c2cWrite(owner, `/submissions/${pending.requestKey}/stop`, {
                  kind: pending.kind,
                  requestHash: pending.requestHash,
                })
                await confirmReceipt(pending)
              }, "已查询并停止尚未开始的原请求")
            }}
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
  if (runtime === false)
    return (
      <section>
        <h1>C2C 交易</h1>
        <p className="c2c-panel" role="status">
          C2C 暂未开放
        </p>
      </section>
    )
  return (
    <section className="c2c-trading-body">
      {title}
      {!workspaceReady && (
        <div
          className="c2c-panel"
          role={workspaceErrors.length || loadError ? "alert" : "status"}
          aria-busy={loading}
        >
          {workspaceErrors.length ? (
            <>
              <p>当前业务资料暂不可用，请刷新后继续。</p>
              {workspaceErrors.map((error, index) => (
                <p key={required[index]}>{error}</p>
              ))}
            </>
          ) : loadError ? (
            <p>读取未完成，请重试，当前数据未用于操作。</p>
          ) : (
            <p>正在读取交易资料…</p>
          )}
        </div>
      )}
      <fieldset className="c2c-trading-workspace" disabled={busy || !workspaceReady}>
        {order && (
          <C2cOrderPanel
            key={order}
            owner={owner}
            orderId={order}
            busy={busy}
            close={closeOrder}
            chat={chat}
            act={act}
          />
        )}
        {workspaceReady && !order && tab === "market" && (
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
                我要买
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
                我要卖
              </button>
              <label>
                交易市场
                <select
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
                      {m.asset} / {m.fiat}
                    </option>
                  ))}
                </select>
              </label>
              {field(
                `法币金额筛选${market ? "（" + market.fiat + "）" : ""}`,
                amount,
                (value) => {
                  setAmount(value)
                  clearOfferSelection()
                },
                { inputMode: "decimal", maxLength: 80 },
              )}
              <label>
                支付方式
                <select
                  value={method}
                  onChange={(event) => {
                    setMethod(event.target.value)
                    clearOfferSelection()
                  }}
                >
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
              {adsLoading && ads.length === 0 ? (
                <p role="status" aria-busy="true">
                  正在查询广告…
                </p>
              ) : adsError ? (
                <div role="alert">
                  <p>{adsError}</p>
                  <button type="button" onClick={refresh}>
                    重新查询广告
                  </button>
                </div>
              ) : (
                ads.length === 0 && <p>{available ? "暂无符合条件的广告" : "C2C 市场暂未开放"}</p>
              )}
              {ads
                .filter(
                  (ad) =>
                    ad.market.marketId === marketId &&
                    ad.side === (side === "BUY" ? "SELL" : "BUY"),
                )
                .map((ad) => (
                  <article key={ad.adId} className="c2c-panel c2c-offer-card">
                    <h2>{ad.merchant?.nickname || `商家 ${ad.makerUserId}`}</h2>
                    <strong className="c2c-offer-price">
                      {c2cDecimal(ad.price)} {ad.market.fiat}
                    </strong>
                    <p>
                      可交易 {ad.availableQuantity} {ad.market.asset}
                    </p>
                    <p>
                      限额 {c2cDecimal(ad.minFiat)} – {c2cDecimal(ad.maxFiat)} {ad.market.fiat}
                    </p>
                    <p>
                      {ad.methodCodes
                        .map(
                          (code) =>
                            catalog?.paymentMethods.find((method) => method.code === code)?.label ||
                            code,
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
                      {ad.makerUserId === owner ? "本人广告" : ad.side === "SELL" ? "购买" : "出售"}
                    </button>
                  </article>
                ))}
            </div>
            {(adMore || adOffset > 0) && (
              <nav className="c2c-action-row" aria-label="广告分页">
                <button
                  type="button"
                  disabled={adsLoading || adOffset === 0}
                  onClick={() => {
                    setSelected(null)
                    setQuote(null)
                    setAdOffset((value) => Math.max(0, value - 20))
                  }}
                >
                  上一页
                </button>
                <span>第 {adOffset / 20 + 1} 页</span>
                <button
                  type="button"
                  disabled={adsLoading || !adMore}
                  onClick={() => {
                    setSelected(null)
                    setQuote(null)
                    setAdOffset((value) => value + 20)
                  }}
                >
                  下一页
                </button>
              </nav>
            )}
          </>
        )}
        {workspaceReady && selected && !order && tab === "market" && (
          <section
            className="c2c-panel c2c-trade-confirmation"
            aria-label="确认交易"
            ref={confirmationPanel}
            tabIndex={-1}
          >
            <h2>
              确认{selected.side === "SELL" ? "购买" : "出售"} {selected.market.asset}
            </h2>
            <p>
              商家：{selected.merchant?.nickname || selected.makerUserId} · 广告{" "}
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
              取消本次选择
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
            <label>
              收款方式
              <select
                aria-label="收款方式"
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
              获取报价
            </button>
            {quote && (
              <>
                <p>
                  {selected.side === "SELL" ? "应付" : "应收"} {c2cDecimal(quote.fiatAmount)}{" "}
                  {quote.market.fiat} · 数量 {quote.quantity} {quote.market.asset}
                </p>
                <p>
                  手续费 {unitsToDecimal(quote.buyerFeeUnits, quote.market.assetScale)} · 买方实收{" "}
                  {unitsToDecimal(quote.buyerReceivesUnits, quote.market.assetScale)}{" "}
                  {quote.market.asset}
                </p>
                <p>报价有效至 {new Date(quote.expiresAt).toLocaleTimeString()}</p>
                {quoteExpired && (
                  <p role="status" className="c2c-warning">
                    报价已到期，请重新获取报价后确认。
                  </p>
                )}
                {selected.side === "BUY" && verify}
                <button
                  type="button"
                  className="c2c-primary"
                  disabled={
                    busy ||
                    !quote.valid ||
                    quoteExpired ||
                    !!pending ||
                    !!pendingError ||
                    !available
                  }
                  onClick={() => {
                    if (operation.current) return
                    if (
                      window.confirm(
                        `确认按本次报价下单？\n商家：${selected.merchant?.nickname || selected.makerUserId}\n金额：${quote.fiatAmount} ${quote.market.fiat}\n数量：${quote.quantity} ${quote.market.asset}\n报价：${quote.quoteId}`,
                      )
                    )
                      void act(() => submit("ORDER_CREATE", { quoteId: quote.quoteId }))
                  }}
                >
                  确认下单
                </button>
              </>
            )}
          </section>
        )}
        {workspaceReady && !order && tab === "orders" && (
          <>
            <p className="c2c-muted">每页最多 30 条订单，点击后读取最新状态。</p>
            <div className="c2c-offers">
              {orders.length === 0 && <p>当前页暂无订单</p>}
              {orders.map((row) => (
                <button
                  type="button"
                  className="c2c-panel"
                  key={row.orderId}
                  onClick={(event) => {
                    orderTrigger.current = event.currentTarget
                    setOrder(row.orderId)
                  }}
                >
                  {row.buyerUserId === owner ? "购买" : "出售"} {row.quantity} {row.market.asset} ·{" "}
                  {c2cDecimal(row.fiatAmount)} {row.market.fiat}
                  <br />
                  {statusText[row.status] || row.status}
                  <small>{row.orderId}</small>
                </button>
              ))}
            </div>
            {(orderMore || orderOffset > 0) && (
              <nav className="c2c-action-row" aria-label="订单分页">
                <button
                  type="button"
                  disabled={loading || orderOffset === 0}
                  onClick={() => {
                    setOrders([])
                    setReadReady((value) => ({ ...value, orders: false }))
                    setOrderOffset((value) => Math.max(0, value - 30))
                  }}
                >
                  上一页
                </button>
                <span>第 {orderOffset / 30 + 1} 页</span>
                <button
                  type="button"
                  disabled={loading || !orderMore}
                  onClick={() => {
                    setOrders([])
                    setReadReady((value) => ({ ...value, orders: false }))
                    setOrderOffset((value) => value + 30)
                  }}
                >
                  下一页
                </button>
              </nav>
            )}
          </>
        )}
        {workspaceReady && !order && tab === "merchant" && (
          <>
            <div className="c2c-merchant-workspace">
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
                      确认质押
                    </button>
                  </>
                )}
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
                  !!pendingError ||
                  !available ||
                  me?.merchant?.status !== "APPROVED" ||
                  bond?.bond?.status !== "LOCKED"
                }
                verify={verify}
                submit={(payload) => {
                  if (operation.current) return
                  if (
                    window.confirm(
                      `确认发布广告？\n方向：${payload["side"] === "SELL" ? "出售" : "购买"}\n单价：${payload["price"]} ${market?.fiat}\n数量：${payload["quantity"]} ${market?.asset}\n出售广告会按原请求进行资金确认。`,
                    )
                  )
                    void act(() => submit("AD_PUBLISH", { payload }))
                }}
              />
            </div>
            <div className="c2c-offers">
              {ownAds.length === 0 && <p>暂无已发布广告</p>}
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
                        onClick={() => {
                          if (
                            action === "CLOSE" &&
                            !window.confirm(
                              `确认关闭广告 ${ad.adId}？\n${ad.market.asset}/${ad.market.fiat} · 剩余 ${ad.availableQuantity}\n后续资金进度以广告状态为准。`,
                            )
                          )
                            return
                          void act(() =>
                            c2cWrite(owner, `/ads/${ad.adId}/status`, {
                              action,
                              revision: ad.revision,
                              verification,
                            }),
                          )
                        }}
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
        {workspaceReady && !order && tab === "accounts" && (
          <>
            <div className="c2c-offers">
              {accounts.length === 0 && <p>暂无收款账户，添加实名资料后等待审核。</p>}
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
                    停用账户
                  </button>
                </article>
              ))}
            </div>
            {accounts.length > 8 && (
              <nav className="c2c-action-row" aria-label="收款账户分页">
                <button
                  type="button"
                  disabled={currentAccountPage === 0}
                  onClick={() => setAccountPage(Math.max(0, currentAccountPage - 1))}
                >
                  上一页
                </button>
                <span>
                  第 {currentAccountPage + 1} / {accountPages} 页
                </span>
                <button
                  type="button"
                  disabled={currentAccountPage >= accountPages - 1}
                  onClick={() => setAccountPage(currentAccountPage + 1)}
                >
                  下一页
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
              <h2>添加实名收款账户</h2>
              <label>
                收款法币
                <select value={marketId} onChange={(event) => setMarketId(event.target.value)}>
                  {catalog?.markets.map((row) => (
                    <option key={row.marketId} value={row.marketId}>
                      {row.fiat} · {row.asset}/{row.fiat}
                    </option>
                  ))}
                </select>
              </label>
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
                <input name="holder" required minLength={2} maxLength={80} autoComplete="name" />
              </label>
              <label>
                收款账号
                <input name="number" required minLength={3} maxLength={128} autoComplete="off" />
              </label>
              <label>
                开户银行（银行卡必填）
                <input name="bank" maxLength={120} />
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
      </fieldset>
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
      <h2>发布广告</h2>
      <p className="c2c-muted">商家审核与质押完成后，可发布当前市场的交易广告。</p>
      <fieldset className="c2c-fields c2c-ad-fields" disabled={disabled}>
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
        <label className="c2c-ad-terms">
          交易条款
          <textarea name="terms" maxLength={2000} />
        </label>
        {verify}
        <button type="submit" disabled={disabled || !market}>
          确认发布广告
        </button>
      </fieldset>
    </form>
  )
}
function message(failure: unknown) {
  return failure instanceof Error ? failure.message : "操作未完成，请查询后重试"
}
