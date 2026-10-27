import { ArrowLeft, Copy, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { z } from "zod"
import {
  c2cDecimal,
  c2cRead,
  c2cWrite,
  challengeC2c,
  orderDetailSchema,
  type Verification,
} from "../../api/c2cTrading"
import { unitsToDecimal } from "../../lib/units"

export const c2cStatusText: Record<string, string> = {
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
  DISABLED: "已停用",
  PAYMENT_PENDING: "待付款",
  PAID: "已付款，待放币",
  APPEALED: "申诉中",
  RELEASE_PENDING: "放币处理中",
  COMPLETED: "已完成",
  CANCELED: "已取消",
  EXPIRED: "已超时",
  OPEN: "待处理",
  REVIEWING: "处理中",
  RESOLVED: "已裁决",
}
export function responseDeadline(expiresAt: string, serverTime: string, startedAt: number) {
  return startedAt + Math.max(0, Date.parse(expiresAt) - Date.parse(serverTime))
}
type Detail = z.infer<typeof orderDetailSchema>
export function C2cOrderPanel({
  owner,
  orderId,
  busy,
  close,
  chat,
  act,
}: {
  owner: string
  orderId: string
  busy: boolean
  close: () => void
  chat: (id: string) => Promise<void>
  act: (action: () => Promise<unknown>, success?: string) => Promise<void>
}) {
  const [order, setOrder] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("")
  const [reload, setReload] = useState(0),
    [reveal, setReveal] = useState(false)
  const [reason, setReason] = useState(""),
    [received, setReceived] = useState(false)
  const [verification, setVerification] = useState<Verification>({ emailCode: "", totpCode: "" })
  const [deadline, setDeadline] = useState<number | null>(null),
    [expired, setExpired] = useState(false)
  const [copied, setCopied] = useState("")
  const reading = useRef(false),
    locked = useRef(busy),
    alive = useRef(true)
  const deciding = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  locked.current = busy
  useEffect(() => {
    alive.current = true
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: "start" })
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const abort = new AbortController(),
      started = performance.now()
    reading.current = true
    setLoading(true)
    setError("")
    void c2cRead(owner, `/orders/${orderId}`, orderDetailSchema, abort.signal)
      .then((value) => {
        if (
          value.orderId !== orderId ||
          ![value.buyerUserId, value.sellerUserId].includes(owner) ||
          value.payment.fiat !== value.market.fiat
        )
          throw Error("订单或收款资料归属不匹配，请重新读取")
        if (abort.signal.aborted) return
        setOrder(value)
        setDeadline(
          value.paymentExpiresAt
            ? responseDeadline(value.paymentExpiresAt, value.serverTime, started)
            : null,
        )
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setOrder(null)
          setReveal(false)
          setReceived(false)
          setError(failure instanceof Error ? failure.message : "订单暂不可用，请重新读取")
        }
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
  }, [owner, orderId, reload])
  useEffect(() => {
    const timer = setInterval(() => {
      if (!reading.current && !locked.current && document.visibilityState === "visible")
        setReload((value) => value + 1)
    }, 4000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (deadline === null) {
      setExpired(false)
      return
    }
    setExpired(performance.now() >= deadline)
    const timer = setTimeout(() => setExpired(true), Math.max(0, deadline - performance.now()))
    return () => clearTimeout(timer)
  }, [deadline])
  const confirm = (action: "paid" | "release" | "cancel" | "appeal") => {
    if (!order || busy || loading || deciding.current) return
    if (action === "paid" && (deadline === null || performance.now() >= deadline)) {
      setError("付款窗口已结束，请刷新订单并通过申诉或消息核对，勿继续转账。")
      return
    }
    if (action === "release" && !received) {
      setError("请先核对本订单款项实际到账。")
      return
    }
    if (action === "appeal" && reason.trim().length < 5) return
    const text = {
      paid: "确认已经实际完成付款并通知卖家",
      release: "确认已核实实际到账并放币",
      cancel: "取消尚未付款的订单",
      appeal: "提交订单申诉",
    }[action]
    if (
      !window.confirm(
        `${text}\n订单：${order.orderId}\n金额：${c2cDecimal(order.fiatAmount)} ${order.market.fiat}\n数量：${order.quantity} ${order.market.asset}${reason.trim() ? "\n原因：" + reason.trim() : ""}`,
      )
    )
      return
    const body =
      action === "paid"
        ? { proofId: null }
        : action === "release"
          ? { ...verification }
          : { reason: reason.trim() || "买家取消未付款订单" }
    deciding.current = true
    void act(async () => {
      try {
        const response = await c2cWrite(owner, `/orders/${order.orderId}/${action}`, body)
        const result = orderDetailSchema.parse(action === "appeal" ? response["order"] : response)
        if (
          result.orderId !== orderId ||
          ![result.buyerUserId, result.sellerUserId].includes(owner) ||
          result.payment.fiat !== result.market.fiat
        )
          throw Error("操作响应归属不匹配，请重新读取原订单")
        if (alive.current) {
          setOrder(result)
          setReason("")
          setReceived(false)
          setReload((value) => value + 1)
        }
      } catch (failure) {
        if (alive.current) {
          setOrder(null)
          setReveal(false)
          setError("操作结果需要重新核对，请读取原订单，不要重复提交。")
          setReceived(false)
        }
        throw failure
      } finally {
        if (alive.current) setVerification({ emailCode: "", totpCode: "" })
      }
    }, "订单操作已提交，请核对最新状态").finally(() => {
      deciding.current = false
    })
  }
  const ongoing =
    order &&
    ["PAYMENT_PENDING", "PAID", "APPEALED", "RELEASE_PENDING", "REFUND_PENDING"].includes(
      order.status,
    )
  return (
    <section className="c2c-panel c2c-order-detail" aria-label="交易订单">
      <div className="c2c-panel-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {order ? c2cStatusText[order.status] : "交易订单"}
          </h2>
          <code>{orderId}</code>
        </div>
        <button type="button" disabled={busy} onClick={close}>
          <ArrowLeft size={16} aria-hidden="true" />
          返回列表
        </button>
      </div>
      <div className="c2c-action-row">
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          重新读取订单
        </button>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(orderId).then(
              () => setCopied("订单编号已复制"),
              () => setCopied("复制失败，请手动选取订单编号"),
            )
          }
        >
          <Copy size={16} aria-hidden="true" />
          复制订单编号
        </button>
      </div>
      {copied && <p role="status">{copied}</p>}
      {loading && (
        <p role="status" aria-busy="true">
          正在读取订单状态…
        </p>
      )}
      {error && (
        <p role="alert" className="c2c-error">
          {error}
        </p>
      )}
      {order && (
        <>
          <dl className="c2c-order-summary">
            <div>
              <dt>交易金额</dt>
              <dd>
                {c2cDecimal(order.fiatAmount)} {order.market.fiat}
              </dd>
            </div>
            <div>
              <dt>交易数量</dt>
              <dd>
                {order.quantity} {order.market.asset}
              </dd>
            </div>
            <div>
              <dt>单价</dt>
              <dd>
                {c2cDecimal(order.price)} {order.market.fiat}
              </dd>
            </div>
            <div>
              <dt>买方实收</dt>
              <dd>
                {unitsToDecimal(order.buyerReceivesUnits, order.market.assetScale)}{" "}
                {order.market.asset}
              </dd>
            </div>
            <div>
              <dt>买方手续费</dt>
              <dd>
                {unitsToDecimal(order.buyerFeeUnits, order.market.assetScale)} {order.market.asset}
              </dd>
            </div>
          </dl>
          {order.paymentExpiresAt && (
            <p>付款截止：{new Date(order.paymentExpiresAt).toLocaleString()}</p>
          )}
          {order.status === "PAYMENT_PENDING" && expired && (
            <p className="c2c-warning" role="status">
              付款窗口已结束，勿继续转账；请刷新核对订单终态，已付款争议可发起申诉。
            </p>
          )}
          {order.terms && (
            <div className="c2c-order-terms">
              <strong>本单交易条款</strong>
              <p>{order.terms}</p>
            </div>
          )}
          {ongoing && (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => setReveal((value) => !value)}
            >
              {reveal ? "收起收款资料" : "查看订单收款资料"}
            </button>
          )}
          {ongoing && reveal && (
            <dl className="c2c-payment-details">
              {[
                ["收款姓名", order.payment.holderName],
                ["收款账号", order.payment.accountNumber],
                ["开户银行", order.payment.bankName || "—"],
                ["收款方式", order.payment.methodCode],
                ["法币", order.payment.fiat],
              ].map(([title, value]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {order.status === "PAYMENT_PENDING" && order.buyerUserId === owner && (
            <>
              <p>使用本人账户按本订单收款资料在站外转账，实际完成付款后再确认。</p>
              <div className="c2c-action-row">
                <button
                  type="button"
                  className="c2c-primary"
                  disabled={busy || loading || expired || deadline === null}
                  onClick={() => confirm("paid")}
                >
                  我已付款，通知卖家
                </button>
                <button type="button" disabled={busy || loading} onClick={() => confirm("cancel")}>
                  取消未付款订单
                </button>
              </div>
            </>
          )}
          {order.status === "PAID" && order.sellerUserId === owner && (
            <fieldset className="c2c-fields" disabled={busy || loading}>
              <p>
                <ShieldCheck size={16} aria-hidden="true" />
                核对收款账户实际到账，聊天和凭证不能代替到账记录。
              </p>
              <label className="c2c-check">
                <input
                  type="checkbox"
                  checked={received}
                  onChange={(event) => setReceived(event.target.checked)}
                />
                已核对本订单款项实际到账
              </label>
              <label>
                邮箱验证码
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={verification.emailCode}
                  onChange={(event) =>
                    setVerification({ ...verification, emailCode: event.target.value })
                  }
                />
              </label>
              <label>
                验证器验证码（已绑定时）
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={verification.totpCode}
                  onChange={(event) =>
                    setVerification({ ...verification, totpCode: event.target.value })
                  }
                />
              </label>
              <div className="c2c-action-row">
                <button
                  type="button"
                  onClick={() => void act(() => challengeC2c(owner), "验证码已发送")}
                >
                  获取资金验证码
                </button>
                <button
                  type="button"
                  className="c2c-primary"
                  disabled={!received}
                  onClick={() => confirm("release")}
                >
                  确认到账并放币
                </button>
              </div>
            </fieldset>
          )}
          {["PAYMENT_PENDING", "PAID"].includes(order.status) && (
            <fieldset className="c2c-fields" disabled={busy || loading}>
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
                disabled={reason.trim().length < 5}
                onClick={() => confirm("appeal")}
              >
                提交申诉
              </button>
            </fieldset>
          )}
          {order.appeals.length > 0 && (
            <details className="c2c-order-terms">
              <summary>申诉记录 · {order.appeals.length}</summary>
              {order.appeals.slice(-20).map((row) => (
                <article key={row.appealId}>
                  <p>
                    <strong>{c2cStatusText[row.status]}</strong> ·{" "}
                    {new Date(row.createdAt).toLocaleString()}
                  </p>
                  <p>{row.reason}</p>
                  {row.decision && (
                    <p>
                      {row.decision === "RELEASE"
                        ? "裁决放币"
                        : row.decision === "REFUND"
                          ? "退回原卖家"
                          : row.decision}
                      ：{row.decisionReason}
                    </p>
                  )}
                  <code>{row.appealId}</code>
                </article>
              ))}
            </details>
          )}
        </>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void act(() => chat(orderId), "订单会话已打开")}
      >
        <MessageCircle size={16} aria-hidden="true" />
        进入订单消息
      </button>
    </section>
  )
}
