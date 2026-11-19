import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import { type C2cTradingOrder, c2cDecimal } from "../../api/c2cTrading"
import { t } from "../../i18n"
import { c2cStatusLabel } from "./C2cOrderPanel"

export type C2cOrderScope = "ONGOING" | "ENDED" | "APPEALED"

export function C2cOrdersTab({
  owner,
  orders,
  orderScope,
  setOrderScope,
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
  orderScope: C2cOrderScope
  setOrderScope: (scope: C2cOrderScope) => void
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
      <div className="c2c-badge-filters c2c-order-tabs" role="tablist" aria-label={t("订单分类")}>
        {(
          [
            ["ONGOING", "实时订单"],
            ["ENDED", "已结束"],
            ["APPEALED", "争议单"],
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            role="tab"
            key={key}
            className={`c2c-filter-pill ${orderScope === key ? "active" : ""}`}
            aria-selected={orderScope === key}
            onClick={() => {
              if (orderScope === key) return
              setOrders([])
              setOrderOffset(0)
              setReadReady((value) => ({ ...value, orders: false }))
              setOrderScope(key)
            }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="c2c-offers">
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
            {row.buyerUserId === owner ? t("购买") : t("出售")} {row.quantity} {row.market.asset} ·{" "}
            {c2cDecimal(row.fiatAmount)} {row.market.fiat}
            <br />
            {c2cStatusLabel(row.status, row.status)}
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
