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
  adDetailSchema,
  adSchema,
  bondSchema,
  type C2cAd,
  type C2cPendingTrade,
  type C2cQuote,
  type C2cTradingOrder,
  c2cAccounts,
  c2cBond,
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
import { t } from "../../i18n"
import { useSession } from "../../state/session"
import { C2cAccountsTab } from "./C2cAccountsTab"
import { C2cMarketPreview } from "./C2cMarketPreview"
import { C2cMarketTab } from "./C2cMarketTab"
import { C2cMerchantTab } from "./C2cMerchantTab"
import { C2cOrderPanel } from "./C2cOrderPanel"
import { C2cOrdersTab } from "./C2cOrdersTab"
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
      <nav className="c2c-trading-tabs" aria-label={t("C2C 功能")}>
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
        {t("获取资金验证码")}
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
            {t("C2C 交易")}
          </h1>
          <p>{t("核对交易对象、金额与收款资料，在订单内完成付款确认和售后沟通。")}</p>
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
        {loading ? t("正在同步状态…") : t("刷新状态")}
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
            {t("重新读取本地请求")}
          </button>
        </div>
      )}
      {pending && (
        <div className="c2c-panel">
          <p>
            {t("原请求结果")}
            {receiptState ? `：${receiptState}` : t("待确认")}
            {t("，请先查询，勿另建订单或广告。")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => confirmReceipt(pending), "已查询原请求")}
          >
            {t("查询原请求")}
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
            {t("停止未开始的请求")}
          </button>
          {receiptState === "UNKNOWN" && (
            <>
              {verify}
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => sendOriginal(pending))}
              >
                {t("按原请求重试")}
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
        <h1>{t("C2C 交易")}</h1>
        <p className="c2c-panel" role="status">
          {t("C2C 暂未开放")}
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
              <p>{t("当前业务资料暂不可用，请刷新后继续。")}</p>
              {workspaceErrors.map((error, index) => (
                <p key={required[index]}>{error}</p>
              ))}
            </>
          ) : loadError ? (
            <p>{t("读取未完成，请重试，当前数据未用于操作。")}</p>
          ) : (
            <p>{t("正在读取交易资料…")}</p>
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
          <C2cMarketTab
            owner={owner}
            side={side}
            setSide={setSide}
            busy={busy}
            clearOfferSelection={clearOfferSelection}
            marketId={marketId}
            setMarketId={setMarketId}
            catalog={catalog}
            market={market}
            amount={amount}
            setAmount={setAmount}
            method={method}
            setMethod={setMethod}
            adsLoading={adsLoading}
            ads={ads}
            adsError={adsError}
            refresh={refresh}
            available={available}
            pending={pending}
            pendingError={pendingError}
            act={act}
            choose={choose}
            adMore={adMore}
            adOffset={adOffset}
            setSelected={setSelected}
            setQuote={setQuote}
            setAdOffset={setAdOffset}
            selected={selected}
            confirmationPanel={confirmationPanel}
            setVerification={setVerification}
            quantity={quantity}
            setQuantity={setQuantity}
            payment={payment}
            setPayment={setPayment}
            accounts={accounts}
            readReady={readReady}
            live={live}
            setQuoteDeadline={setQuoteDeadline}
            quote={quote}
            quoteExpired={quoteExpired}
            verify={verify}
            operation={operation}
            submit={submit}
            field={field}
          />
        )}
        {workspaceReady && !order && tab === "orders" && (
          <C2cOrdersTab
            owner={owner}
            orders={orders}
            orderMore={orderMore}
            orderOffset={orderOffset}
            loading={loading}
            orderTrigger={orderTrigger}
            setOrder={setOrder}
            setOrders={setOrders}
            setReadReady={setReadReady}
            setOrderOffset={setOrderOffset}
          />
        )}
        {workspaceReady && !order && tab === "merchant" && (
          <C2cMerchantTab
            owner={owner}
            me={me}
            bond={bond}
            canStake={canStake}
            busy={busy}
            pending={pending}
            pendingError={pendingError}
            available={available}
            market={market}
            catalog={catalog}
            setMarketId={setMarketId}
            accounts={accounts}
            ownAds={ownAds}
            verification={verification}
            verify={verify}
            operation={operation}
            act={act}
            submit={submit}
          />
        )}
        {workspaceReady && !order && tab === "accounts" && (
          <C2cAccountsTab
            owner={owner}
            accounts={accounts}
            currentAccountPage={currentAccountPage}
            accountPages={accountPages}
            setAccountPage={setAccountPage}
            busy={busy}
            catalog={catalog}
            market={market}
            marketId={marketId}
            setMarketId={setMarketId}
            verification={verification}
            setVerification={setVerification}
            setError={setError}
            act={act}
            live={live}
            field={field}
          />
        )}
      </fieldset>
    </section>
  )
}
function message(failure: unknown) {
  return failure instanceof Error ? failure.message : "操作未完成，请查询后重试"
}
