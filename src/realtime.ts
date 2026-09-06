import type { ProductLine } from "./types/domain"

export const PRODUCTS: ProductLine[] = [
  "SPOT",
  "LINEAR_PERPETUAL",
  "INVERSE_PERPETUAL",
  "LINEAR_DELIVERY",
  "INVERSE_DELIVERY",
  "OPTION",
]
export const PRIVATE_CHANNELS = new Set([
  "accountState",
  "orders",
  "triggerOrders",
  "positions",
  "positionRisk",
  "accountRisk",
  "executionReports",
])
export type Row = Record<string, unknown>
export type WsEnvelope = Row & {
  op?: string
  channel?: string
  id?: string
  symbol?: string
  period?: string
  productLine?: ProductLine
  userId?: string | number
  version?: string
  data?: unknown
  eventTime?: string
}
type Entry = { version: string; value: Row | null }
export const record = (value: unknown): Row =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Row) : {}
export const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.map(record) : [])
const positionKey = (v: Row) => `${v["symbol"]}:${v["positionSide"] ?? "NET"}`
const versionPattern = /^\d{19}:\d{10}$/

export function parseRealtimeJson(raw: string): WsEnvelope {
  return JSON.parse(
    raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
      if (/^-?\d{16,}$/.test(token) && !Number.isSafeInteger(Number(token))) return `"${token}"`
      return token
    }),
  )
}

export class PrivateView {
  status = "INITIALIZING"
  fence = ""
  receivedAt = 0
  readonly entities = new Map<string, Entry>()
  apply(event: WsEnvelope, now = Date.now()): boolean {
    const data = record(event.data)
    if (event.op === "snapshot") {
      if (data["status"] !== "READY") {
        this.status = String(data["status"])
        return true
      }
      const fence = String(data["snapshotVersion"] ?? "")
      if (!versionPattern.test(fence) || !data["account"] || fence < this.fence) return false
      if (fence === this.fence) {
        this.receivedAt = now
        this.status = "READY"
        return true
      }
      for (const [key, entry] of this.entities)
        if (entry.version <= fence) this.entities.delete(key)
      const put = (key: string, value: Row) => {
        if (!this.entities.has(key)) this.entities.set(key, { version: fence, value })
      }
      const account = record(data["account"])
      put("metadata", { positionMode: account["positionMode"] })
      for (const v of rows(account["balances"])) put(`balance:${v["asset"]}`, v)
      for (const v of rows(account["positions"])) put(`position:${positionKey(v)}`, v)
      for (const v of rows(data["openOrders"])) put(`order:${v["orderId"]}`, v)
      for (const v of rows(data["triggerOrders"])) put(`trigger:${v["triggerOrderId"]}`, v)
      for (const v of rows(data["positionRisks"])) put(`risk:${positionKey(v)}`, v)
      this.fence = fence
      this.status = "READY"
      this.receivedAt = now
      return true
    }
    const version = String(data["version"])
    if (event.op !== "event" || !versionPattern.test(version) || version <= this.fence) return false
    const value = record(data["value"])
    const put = (key: string, row: Row | null) => {
      if (version > (this.entities.get(key)?.version ?? ""))
        this.entities.set(key, { version, value: row })
    }
    switch (event.channel) {
      case "accountState":
        if (data["entityId"] === "user" && value["positionMode"] !== undefined)
          put("metadata", { positionMode: value["positionMode"] })
        for (const row of rows(value["balances"])) put(`balance:${row["asset"]}`, row)
        break
      case "positions":
        for (const row of rows(value["positions"])) {
          const key = positionKey(row)
          put(`position:${key}`, Number(row["signedQuantitySteps"]) === 0 ? null : row)
          if (Number(row["signedQuantitySteps"]) === 0) put(`risk:${key}`, null)
        }
        break
      case "orders":
        put(`order:${value["orderId"]}`, value["status"] === "OPEN" ? value : null)
        break
      case "triggerOrders":
        for (const row of rows(data["value"]))
          put(
            `trigger:${row["triggerOrderId"]}`,
            ["PENDING", "TRIGGERING"].includes(String(row["status"])) ? row : null,
          )
        break
      case "positionRisk":
      case "accountRisk":
        put(`risk:${positionKey(value)}`, value)
        break
      default:
        return false
    }
    if (this.entities.size > 20000) {
      this.entities.clear()
      this.fence = ""
      this.status = "STALE"
    }
    return true
  }
  rows(kind: string): Row[] {
    return [...this.entities].flatMap(([key, entry]) =>
      key.startsWith(`${kind}:`) && entry.value ? [entry.value] : [],
    )
  }
  get positionMode(): string {
    return String(this.entities.get("metadata")?.value?.["positionMode"] ?? "ONE_WAY")
  }
  ready(now = Date.now()): boolean {
    return this.status === "READY" && now - this.receivedAt < 15000
  }
}

export function unwrapEvent(event: WsEnvelope): WsEnvelope {
  const data = record(event.data)
  if (event.op !== "event" || !("value" in data)) return event
  let value = data["value"]
  const body = record(value)
  if (event.channel === "depth" && Array.isArray(body["levels"])) {
    value = {
      ...body,
      updateType: "SNAPSHOT",
      depth: 20,
      sequence: String(body["exportSequence"] ?? 0),
      bids: rows(body["levels"]).filter((v) => v["side"] === "BUY"),
      asks: rows(body["levels"]).filter((v) => v["side"] === "SELL"),
    }
  }
  return {
    ...event,
    version: String(data["version"]),
    id: `${event.productLine}:${event.channel}:${data["entityId"]}:${data["version"]}`,
    data: value,
  }
}
export function newerPublicEvent(event: WsEnvelope, previous?: WsEnvelope): boolean {
  if (!previous) return true
  if (
    ["depth", "bookTicker", "trades"].includes(event.channel ?? "") &&
    event.version &&
    previous.version
  )
    return event.version > previous.version
  const time = Date.parse(event.eventTime ?? ""),
    oldTime = Date.parse(previous.eventTime ?? "")
  if (Number.isFinite(time) && Number.isFinite(oldTime) && time !== oldTime) return time > oldTime
  return !event.version || !previous.version || event.version > previous.version
}
export interface Subscription {
  channel: string
  productLine: ProductLine
  symbol?: string
  period?: string
}
export function subscriptionKey(s: Subscription): string {
  return `${s.productLine}:${s.channel}:${s.symbol ?? "*"}:${s.period ?? ""}`
}
export function privateSubscriptions(products: readonly ProductLine[]): Subscription[] {
  return products.flatMap((productLine) =>
    [...PRIVATE_CHANNELS]
      .filter((channel) => channel !== "accountRisk")
      .map((channel) => ({ channel, productLine })),
  )
}
export function integer(value: unknown): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value)
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value)
  throw new Error("Expected exact integer units")
}
export function positionValuation(
  position: Row,
  market: Row | undefined,
): { pnl: bigint; value: bigint } | null {
  if (!market) return null
  try {
    const q = integer(position["signedQuantitySteps"]),
      entry = integer(position["entryPriceTicks"]),
      mark = integer(market["markPriceTicks"])
    const multiplier = integer(market["notionalMultiplierUnits"])
    if (mark <= 0n || entry <= 0n || multiplier <= 0n) return null
    let pnl = q * (mark - entry) * multiplier
    if (String(market["contractType"]).includes("INVERSE")) {
      const numerator = pnl * integer(market["settleScaleUnits"]),
        denominator = entry * mark * integer(market["priceTickUnits"])
      if (denominator <= 0n) return null
      const abs = numerator < 0n ? -numerator : numerator
      pnl =
        (abs / denominator + ((abs % denominator) * 2n >= denominator ? 1n : 0n)) *
        (numerator < 0n ? -1n : 1n)
    }
    const value =
      String(market["contractType"]).includes("OPTION") || market["instrumentType"] === "OPTION"
        ? q * mark * multiplier
        : pnl
    return { pnl, value }
  } catch {
    return null
  }
}

export function accountEquity(
  view: PrivateView,
  markets: readonly Row[],
  product: ProductLine,
): { balances: Row[]; complete: boolean } {
  let complete = view.ready()
  const riskByPosition = new Map(view.rows("risk").map((r) => [positionKey(r), r]))
  const equity = new Map<string, bigint>()
  for (const p of view.rows("position").filter((p) => Number(p["signedQuantitySteps"]) !== 0)) {
    const market = markets.find(
      (m) =>
        m["symbol"] === p["symbol"] && String(m["changeId"]) === String(p["instrumentChangeId"]),
    )
    const valuation = positionValuation(p, market)
    const risk = riskByPosition.get(positionKey(p))
    try {
      const value =
        valuation?.value ?? (product === "OPTION" ? null : integer(risk?.["unrealizedPnlUnits"]))
      if (value === null) {
        complete = false
        continue
      }
      const asset = String(p["marginAsset"])
      equity.set(asset, (equity.get(asset) ?? 0n) + value)
    } catch {
      complete = false
    }
  }
  const cash = view.rows("balance")
  if ([...equity.keys()].some((asset) => !cash.some((b) => b["asset"] === asset))) complete = false
  const balances = cash.map((b) => {
    try {
      return {
        ...b,
        equityUnits: (
          integer(b["availableUnits"]) +
          integer(b["lockedUnits"]) +
          (equity.get(String(b["asset"])) ?? 0n)
        ).toString(),
      }
    } catch {
      complete = false
      return { ...b, equityUnits: null }
    }
  })
  return { balances, complete }
}
