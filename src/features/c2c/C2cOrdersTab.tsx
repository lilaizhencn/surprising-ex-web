import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { type C2cTradingOrder, c2cDecimal } from "../../api/c2cTrading"
import { t } from "../../i18n"
import { c2cStatusText as statusText } from "./C2cOrderPanel"

export function C2cOrdersTab({
  owner,
  orders,
  orderMore,
  orderOffset,
  loading,
  orderTrigger,
  setOrder,
  setOrders,
  setReadReady,
  setOrderOffset,
}: {
  owner: string
  orders: C2cTradingOrder[]
  orderMore: boolean
  orderOffset: number
  loading: boolean
  orderTrigger: MutableRefObject<HTMLButtonElement | null>
  setOrder: (id: string) => void
  setOrders: (orders: C2cTradingOrder[]) => void
  setReadReady: Dispatch<SetStateAction<Record<string, boolean>>>
  setOrderOffset: Dispatch<SetStateAction<number>>
}) {
  return (
    <>
      <p className="c2c-muted">{t("每页最多 30 条订单，点击后读取最新状态。")}</p>
      <div className="c2c-offers">
        {orders.length === 0 && <p>{t("当前页暂无订单")}</p>}
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
            {row.buyerUserId === owner ? t("购买") : t("出售")} {row.quantity}{" "}
            {row.market.asset} · {c2cDecimal(row.fiatAmount)} {row.market.fiat}
            <br />
            {statusText[row.status] || row.status}
            <small>{row.orderId}</small>
          </button>
        ))}
      </div>
      {(orderMore || orderOffset > 0) && (
        <nav className="c2c-action-row" aria-label={t("订单分页")}>
          <button
            type="button"
            disabled={loading || orderOffset === 0}
            onClick={() => {
              setOrders([])
              setReadReady((value) => ({ ...value, orders: false }))
              setOrderOffset((value) => Math.max(0, value - 30))
            }}
          >
            {t("上一页")}
          </button>
          <span>
            {t("第 ")}
            {orderOffset / 30 + 1} {t(" 页")}
          </span>
          <button
            type="button"
            disabled={loading || !orderMore}
            onClick={() => {
              setOrders([])
              setReadReady((value) => ({ ...value, orders: false }))
              setOrderOffset((value) => value + 30)
            }}
          >
            {t("下一页")}
          </button>
        </nav>
      )}
    </>
  )
}
