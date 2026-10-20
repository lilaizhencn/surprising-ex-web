import { ArrowLeft, ChevronRight, MessageCircle, Plus, RefreshCw, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  type C2cConversation,
  type C2cOrder,
  c2cTimeline,
  loadC2cConversations,
  loadC2cOrder,
  loadC2cOrders,
  loadC2cStatus,
  startC2cConversation,
} from "../../api/c2c"
import { Badge, Button, IconButton, SearchField, StateView } from "../../components/ui/Primitives"
import { t, useLocale } from "../../i18n"
import { config } from "../../lib/config"
import { unitsToDecimal } from "../../lib/units"
import { acquireRealtimeConnections } from "../../sharedRealtimeConnections"
import { useSession } from "../../state/session"
import { ChatAttachment } from "./ChatAttachment"
import { ChatComposer } from "./ChatComposer"
import { useC2cConversation } from "./useC2cConversation"
import "./c2c.css"

export function C2cPage() {
  useLocale()
  const session = useSession()
  if (!session)
    return (
      <div className="container section c2c-login">
        <MessageCircle size={36} />
        <h1>{t("C2C messages")}</h1>
        <p>{t("Sign in to view your conversations and orders.")}</p>
        <a className="button button-primary" href="/auth/login?redirect=%2Fc2c">
          {t("Sign in")}
        </a>
      </div>
    )
  return (
    <C2cWorkspace
      key={String(session.user.userId)}
      owner={String(session.user.userId)}
      token={session.accessToken}
    />
  )
}

function C2cWorkspace({ owner, token }: { readonly owner: string; readonly token: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [tab, setTab] = useState<"messages" | "orders">("messages")
  const [search, setSearch] = useState("")
  const [conversations, setConversations] = useState<C2cConversation[]>([])
  const [orders, setOrders] = useState<C2cOrder[]>([])
  const [selection, setSelection] = useState<C2cConversation | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [opening, setOpening] = useState(false)
  const [newConversation, setNewConversation] = useState(false)
  const alive = useRef(true)
  const nextOffset = useRef(0)
  const generation = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    generation.current++
    const abort = new AbortController()
    setLoading(true)
    setError("")
    const timer = window.setTimeout(
      () => {
        void (async () => {
          const status = await loadC2cStatus(abort.signal)
          if (abort.signal.aborted) return
          setEnabled(status.runtimeEnabled)
          if (!status.runtimeEnabled) return
          if (tab === "messages") {
            const page = await loadC2cConversations(owner, search, 0, abort.signal)
            if (!abort.signal.aborted) {
              setConversations(page.items)
              setMore(page.hasMore)
              nextOffset.current = page.items.length
            }
          } else {
            const page = await loadC2cOrders(owner, 0, abort.signal)
            if (!abort.signal.aborted) {
              setOrders(page.items)
              setMore(page.hasMore)
              nextOffset.current = page.items.length
            }
          }
        })()
          .catch((failure: unknown) => {
            if (!abort.signal.aborted)
              setError(
                failure instanceof Error ? failure.message : t("Unable to load conversations."),
              )
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false)
          })
      },
      search ? 250 : 0,
    )
    return () => {
      abort.abort()
      window.clearTimeout(timer)
    }
  }, [owner, tab, search, revision])

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const connection = acquireRealtimeConnections(
      config.wsBaseUrlForProductLine,
      token,
      (event) => {
        if (event.op === "c2c.changed" && !timer)
          timer = setTimeout(() => {
            timer = undefined
            refresh()
          }, 300)
      },
      () => {},
    )
    connection.update([{ channel: "c2c.inbox" }])
    return () => {
      if (timer) clearTimeout(timer)
      connection.close()
    }
  }, [enabled, token, refresh])

  const start = async (target: { orderId: string } | { targetUserId: string }) => {
    if (opening) return t("Opening conversation…")
    setOpening(true)
    setError("")
    try {
      const conversation = await startC2cConversation(owner, target)
      if (alive.current) {
        setSelection(conversation)
        setTab("messages")
        setNewConversation(false)
        refresh()
      }
      return null
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t("Unable to open conversation.")
      if (alive.current) setError(message)
      return message
    } finally {
      if (alive.current) setOpening(false)
    }
  }
  const loadMore = async () => {
    if (loading || !more) return
    setLoading(true)
    const requestGeneration = generation.current
    try {
      if (tab === "messages") {
        const page = await loadC2cConversations(owner, search, nextOffset.current)
        if (alive.current && requestGeneration === generation.current) {
          setConversations((previous) => [
            ...new Map([...previous, ...page.items].map((c) => [c.conversationId, c])).values(),
          ])
          nextOffset.current += page.items.length
          setMore(page.hasMore)
        }
      } else {
        const page = await loadC2cOrders(owner, nextOffset.current)
        if (alive.current && requestGeneration === generation.current) {
          setOrders((previous) => [
            ...new Map(
              [...previous, ...page.items].map((order) => [order.orderId, order]),
            ).values(),
          ])
          nextOffset.current += page.items.length
          setMore(page.hasMore)
        }
      }
    } catch (failure) {
      if (alive.current && requestGeneration === generation.current)
        setError(failure instanceof Error ? failure.message : t("Unable to load conversations."))
    } finally {
      if (alive.current && requestGeneration === generation.current) setLoading(false)
    }
  }
  return (
    <div className="container c2c-page">
      <div className="c2c-page-heading">
        <div>
          <span className="eyebrow">C2C</span>
          <h1>{t("Messages & orders")}</h1>
        </div>
        <span>{t("Your order conversations, in one place.")}</span>
      </div>
      <div className={`c2c-workspace ${selection ? "c2c-has-selection" : ""}`}>
        <aside className="c2c-sidebar" aria-label={t("Conversations")}>
          <div className="c2c-sidebar-header">
            <div className="c2c-tabs">
              <button
                type="button"
                aria-pressed={tab === "messages"}
                onClick={() => setTab("messages")}
              >
                {t("Messages")}
              </button>
              <button
                type="button"
                aria-pressed={tab === "orders"}
                onClick={() => setTab("orders")}
              >
                {t("Orders")}
              </button>
            </div>
            <IconButton
              label="New conversation"
              disabled={!enabled}
              onClick={() => setNewConversation(true)}
            >
              <Plus size={19} />
            </IconButton>
          </div>
          {tab === "messages" ? (
            <div className="c2c-search">
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={t("Search conversations")}
              />
            </div>
          ) : null}
          <div className="c2c-sidebar-list" aria-busy={loading}>
            {error ? <StateView kind="error" message={error} retry={refresh} /> : null}
            {enabled === false ? (
              <StateView kind="empty" message="C2C messaging is not enabled yet." />
            ) : loading && (tab === "messages" ? !conversations.length : !orders.length) ? (
              <StateView kind="loading" message="Loading…" />
            ) : tab === "messages" ? (
              conversations.length ? (
                conversations.map((conversation) => (
                  <button
                    type="button"
                    className={`c2c-conversation ${selection?.conversationId === conversation.conversationId ? "is-selected" : ""}`}
                    key={conversation.conversationId}
                    onClick={() => setSelection(conversation)}
                  >
                    <span className="c2c-avatar" aria-hidden="true">
                      {conversation.peer.nickname.slice(0, 1)}
                    </span>
                    <span className="c2c-conversation-summary">
                      <strong>{conversation.peer.nickname}</strong>
                      <span>
                        {conversation.lastMessage?.text ||
                          (conversation.lastMessage?.hasAttachment
                            ? t("Attachment")
                            : t("No messages yet"))}
                      </span>
                      <small>
                        {conversation.orderId
                          ? `${t("Order")} · ${conversation.orderId.slice(-8)}`
                          : t("Consultation")}
                      </small>
                    </span>
                    <span className="c2c-conversation-meta">
                      {conversation.lastMessage ? (
                        <time>{time(conversation.lastMessage.createdAt)}</time>
                      ) : null}
                      {conversation.unreadCount !== "0" ? (
                        <span className="c2c-unread">
                          {BigInt(conversation.unreadCount) > 99n
                            ? "99+"
                            : conversation.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))
              ) : !error ? (
                <StateView
                  kind="empty"
                  message="No conversations yet. Open an order or contact a merchant."
                />
              ) : null
            ) : orders.length ? (
              orders.map((order) => (
                <button
                  type="button"
                  key={order.orderId}
                  className="c2c-order-row"
                  disabled={opening}
                  onClick={() => void start({ orderId: order.orderId })}
                >
                  <span>
                    <strong>
                      {t(order.buyerUserId === owner ? "Buy" : "Sell")} {order.market.asset}
                    </strong>
                    <small>
                      {order.orderId.slice(-8)} · {time(order.createdAt)}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {order.fiatAmount} {order.market.fiat}
                    </strong>
                    <small>{orderStatus(order.status)}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : !error ? (
              <StateView kind="empty" message="No C2C orders yet." />
            ) : null}
            {more && enabled ? (
              <Button tone="ghost" loading={loading} onClick={() => void loadMore()}>
                {t("Load more")}
              </Button>
            ) : null}
          </div>
        </aside>
        {selection ? (
          <ConversationPanel
            key={selection.conversationId}
            owner={owner}
            token={token}
            conversation={selection}
            onBack={() => {
              setSelection(null)
              refresh()
            }}
          />
        ) : (
          <div className="c2c-empty-conversation">
            <MessageCircle size={44} strokeWidth={1.3} />
            <h2>{t("Stay connected to your trade")}</h2>
            <p>{t("Choose a conversation or open a C2C order to contact the other party.")}</p>
          </div>
        )}
      </div>
      {newConversation ? (
        <NewConversationDialog
          opening={opening}
          onClose={() => setNewConversation(false)}
          onStart={start}
        />
      ) : null}
    </div>
  )
}

function ConversationPanel({
  owner,
  token,
  conversation,
  onBack,
}: {
  readonly owner: string
  readonly token: string
  readonly conversation: C2cConversation
  readonly onBack: () => void
}) {
  const chat = useC2cConversation(owner, token, conversation)
  const [showOrder, setShowOrder] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ top: number; height: number } | null>(null)
  const bottom = useRef(true)
  const size = useRef({ width: 0, height: 0 })
  const timeline = c2cTimeline(chat.messages, chat.events)
  useLayoutEffect(() => {
    const node = scroller.current
    if (!node) return
    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height
      anchor.current = null
    } else if (bottom.current) node.scrollTop = node.scrollHeight
  }, [chat.messages, chat.events])
  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      size.current = { width: node.clientWidth, height: node.clientHeight }
      if (bottom.current) node.scrollTop = node.scrollHeight
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const read = () => {
      if (bottom.current && document.visibilityState === "visible" && document.hasFocus())
        void chat.markRead()
    }
    read()
    window.addEventListener("focus", read)
    document.addEventListener("visibilitychange", read)
    return () => {
      window.removeEventListener("focus", read)
      document.removeEventListener("visibilitychange", read)
    }
  }, [chat.messages, chat.events, chat.markRead])
  const older = async () => {
    await chat.loadOlder(() => {
      const node = scroller.current
      if (node) anchor.current = { top: node.scrollTop, height: node.scrollHeight }
    })
  }
  return (
    <section className="c2c-chat" aria-label={t("Order conversation")}>
      <header className="c2c-chat-header">
        <IconButton label="Back to conversations" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <span className="c2c-avatar" aria-hidden="true">
          {conversation.peer.nickname.slice(0, 1)}
        </span>
        <div>
          <h2>{conversation.peer.nickname}</h2>
          <small>
            {t("UID")} {conversation.peer.userId} ·{" "}
            {chat.live ? t("Connected") : t("Reconnecting…")}
          </small>
        </div>
        {conversation.orderId ? (
          <Button tone="outline" onClick={() => setShowOrder(true)}>
            {t("View order")}
          </Button>
        ) : (
          <Badge>{t("Consultation")}</Badge>
        )}
      </header>
      {conversation.orderId ? (
        <div className="c2c-order-strip">
          <span>
            {t("Order")} {conversation.orderId}
          </span>
          <Badge>{orderStatus(chat.currentConversation.order?.status ?? "")}</Badge>
        </div>
      ) : null}
      {chat.error ? (
        <div className="c2c-chat-error" role="alert">
          {chat.error}
          <Button tone="ghost" onClick={chat.retry}>
            <RefreshCw size={15} />
            {t("Retry")}
          </Button>
        </div>
      ) : null}
      <div
        ref={scroller}
        className="c2c-timeline"
        role="log"
        aria-label={t("Messages")}
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={chat.loading}
        onScroll={() => {
          const node = scroller.current
          if (!node) return
          // A responsive layout change is not an intentional scroll away from
          // the latest message. ResizeObserver restores the pinned bottom.
          if (node.clientWidth !== size.current.width || node.clientHeight !== size.current.height)
            return
          bottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60
          setAtBottom(bottom.current)
          if (bottom.current && document.visibilityState === "visible" && document.hasFocus())
            void chat.markRead()
        }}
      >
        {chat.loading ? <StateView kind="loading" message="Loading messages…" /> : null}
        {chat.hasOlder ? (
          <div className="c2c-load-older">
            <Button tone="ghost" loading={chat.older} onClick={() => void older()}>
              {t("Earlier messages")}
            </Button>
          </div>
        ) : null}
        {!chat.loading && timeline.length === 0 ? (
          <StateView kind="empty" message="No messages yet. Start the conversation." />
        ) : null}
        {timeline.map((item) =>
          "event" in item ? (
            <div key={item.key} className="c2c-system-event">
              <span>{orderEvent(item.event.type)}</span>
              <time>{time(item.at)}</time>
            </div>
          ) : (
            <article
              key={item.key}
              className={`c2c-message ${item.message.senderUserId === owner && item.message.authorKind === "USER" ? "is-own" : ""}`}
            >
              {item.message.authorKind !== "USER" ? (
                <Badge tone="info">
                  {t(item.message.authorKind === "SUPPORT" ? "Customer support" : "System")}
                </Badge>
              ) : null}
              <div className="c2c-message-bubble">
                {item.message.text ? <p>{item.message.text}</p> : null}
                {item.message.attachment ? (
                  <ChatAttachment owner={owner} attachment={item.message.attachment} />
                ) : null}
              </div>
              <div className="c2c-message-meta">
                <time dateTime={item.at}>{time(item.at)}</time>
                {item.message.senderUserId === owner ? (
                  <span>
                    {chat.reads.some(
                      (read) =>
                        read.userId === conversation.peer.userId &&
                        BigInt(read.messageId) >= BigInt(item.message.messageId),
                    )
                      ? t("Read")
                      : t("Sent")}
                  </span>
                ) : null}
              </div>
            </article>
          ),
        )}
      </div>
      {!atBottom ? (
        <button
          className="c2c-jump"
          type="button"
          onClick={() => {
            bottom.current = true
            setAtBottom(true)
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
            void chat.markRead()
          }}
        >
          {t("Latest messages")} ↓
        </button>
      ) : null}
      <ChatComposer
        owner={owner}
        conversation={conversation}
        onSent={(message) => {
          bottom.current = true
          setAtBottom(true)
          chat.sent(message)
        }}
      />
      {showOrder && conversation.orderId ? (
        <OrderDialog
          owner={owner}
          orderId={conversation.orderId}
          onClose={() => setShowOrder(false)}
        />
      ) : null}
    </section>
  )
}

function NewConversationDialog({
  opening,
  onClose,
  onStart,
}: {
  readonly opening: boolean
  readonly onClose: () => void
  readonly onStart: (
    target: { orderId: string } | { targetUserId: string },
  ) => Promise<string | null>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [kind, setKind] = useState<"order" | "merchant">("order")
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const valid =
    kind === "order"
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
      : /^[1-9]\d{0,18}$/.test(value.trim())
  return (
    <dialog ref={dialog} className="c2c-dialog" aria-labelledby="c2c-new-title" onCancel={onClose}>
      <header>
        <h2 id="c2c-new-title">{t("New conversation")}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid)
            void onStart(
              kind === "order" ? { orderId: value.trim() } : { targetUserId: value.trim() },
            ).then((message) => {
              if (message) setError(message)
            })
        }}
      >
        <label>
          {t("Conversation type")}
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value === "order" ? "order" : "merchant")
              setValue("")
            }}
          >
            <option value="order">{t("Order")}</option>
            <option value="merchant">{t("Merchant consultation")}</option>
          </select>
        </label>
        <label>
          {t(kind === "order" ? "Order ID" : "Merchant UID")}
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            maxLength={kind === "order" ? 36 : 19}
            autoComplete="off"
          />
        </label>
        <p>
          {t(
            "Only order participants can join its conversation. Consultations follow the recipient's privacy settings.",
          )}
        </p>
        {error ? (
          <p className="c2c-error" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={opening} disabled={!valid}>
          {t("Open conversation")}
        </Button>
      </form>
    </dialog>
  )
}

function OrderDialog({
  owner,
  orderId,
  onClose,
}: {
  readonly owner: string
  readonly orderId: string
  readonly onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [order, setOrder] = useState<C2cOrder | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    setError("")
    void loadC2cOrder(owner, orderId, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setOrder(value)
      })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : t("Unable to load order."))
      })
    return () => abort.abort()
  }, [owner, orderId, attempt])
  return (
    <dialog
      ref={dialog}
      className="c2c-dialog"
      aria-labelledby="c2c-order-title"
      onCancel={onClose}
    >
      <header>
        <h2 id="c2c-order-title">{t("Order details")}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </header>
      {error ? (
        <StateView kind="error" message={error} retry={() => setAttempt((value) => value + 1)} />
      ) : !order ? (
        <StateView kind="loading" message="Loading…" />
      ) : (
        <>
          <Badge>{orderStatus(order.status)}</Badge>
          <dl>
            <dt>{t("Order ID")}</dt>
            <dd>{order.orderId}</dd>
            <dt>{t("Amount")}</dt>
            <dd>
              {order.fiatAmount} {order.market.fiat}
            </dd>
            <dt>{t("Quantity")}</dt>
            <dd>
              {order.quantity} {order.market.asset}
            </dd>
            <dt>{t("Price")}</dt>
            <dd>
              {order.price} {order.market.fiat}
            </dd>
            <dt>{t("Buyer fee")}</dt>
            <dd>
              {unitsToDecimal(order.buyerFeeUnits, order.market.assetScale)} {order.market.asset}
            </dd>
            <dt>{t("Buyer receives")}</dt>
            <dd>
              {unitsToDecimal(order.buyerReceivesUnits, order.market.assetScale)}{" "}
              {order.market.asset}
            </dd>
          </dl>
          {order.terms ? (
            <>
              <h3>{t("Trading terms")}</h3>
              <p className="c2c-terms">{order.terms}</p>
            </>
          ) : null}
        </>
      )}
    </dialog>
  )
}

const statuses: Record<string, string> = {
  RESERVING: "Securing funds",
  PAYMENT_PENDING: "Awaiting payment",
  PAID: "Buyer marked as paid",
  RELEASE_PENDING: "Releasing funds",
  COMPLETED: "Completed",
  REFUND_PENDING: "Refunding",
  CANCELED: "Canceled",
  EXPIRED: "Expired",
  APPEALED: "Under appeal",
  FAILED: "Failed",
}
export const orderStatus = (status: string) => t(statuses[status] ?? status)
const events: Record<string, string> = {
  ORDER_CREATED: "Order created",
  ESCROW_CONFIRMED: "Funds secured",
  BUYER_MARKED_PAID: "The buyer marked the order as paid. Confirm receipt separately.",
  SELLER_CONFIRMED_RECEIPT: "The seller requested release",
  COMPLETED: "Order completed",
  CANCELED: "Order canceled",
  EXPIRED: "Order expired",
  APPEAL_OPENED: "An appeal was opened",
  APPEAL_RELEASE_APPROVED: "The appeal was resolved",
  APPEAL_REFUND_APPROVED: "The appeal was resolved",
}
const orderEvent = (type: string) => t(events[type] ?? "Order status updated")
function time(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(document.documentElement.lang || undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
}
