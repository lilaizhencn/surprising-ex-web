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
  instrumentId?: string
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
const positionKey = (v: Row) => `${v["instrumentId"]}:${v["positionSide"] ?? "NET"}`
const versionPattern = /^\d{19}:\d{10}$/
const validVersion = (value: string): boolean =>
  versionPattern.test(value) &&
  value.slice(0, 19) <= "9223372036854775807" &&
  value.slice(20) <= "2147483647"

export function parseRealtimeJson(raw: string): WsEnvelope {
  return JSON.parse(
    raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
      if (/^-?\d{16,}$/.test(token) && (token.length > 17 || !Number.isSafeInteger(Number(token))))
        return `"${token}"`
      return token
    }),
  )
}

// A snapshot is accepted atomically: arrays, exact financial units and row identities
// must all be valid before the live entities or their fence can change.
const marginModes = ["CROSS", "ISOLATED"]
const positionSides = ["NET", "LONG", "SHORT"]
const orderTypes = ["LIMIT", "MARKET"]
const timeInForce = ["GTC", "IOC", "FOK", "GTX"]
const hasText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0
const oneOf = (value: unknown, allowed: string[]): boolean => allowed.includes(String(value))
function exactInt64(value: unknown): boolean {
  try {
    if (typeof value === "string" && value.length > 20) return false
    const parsed = integer(value)
    return parsed >= -9223372036854775808n && parsed <= 9223372036854775807n
  } catch {
    return false
  }
}
const positiveInt64 = (value: unknown): boolean =>
  exactInt64(value) && /^[1-9]\d*$/.test(String(value))
const validIntegerFields = (v: Row, fields: string[]): boolean =>
  fields.every((field) => exactInt64(v[field]))
const validBalance = (v: Row): boolean =>
  hasText(v["asset"]) && validIntegerFields(v, ["availableUnits", "lockedUnits"])
const validPositionIdentity = (v: Row): boolean =>
  hasText(v["instrumentId"]) && oneOf(v["positionSide"], positionSides)
const validPosition = (v: Row): boolean =>
  validPositionIdentity(v) &&
  hasText(v["marginAsset"]) &&
  oneOf(v["marginMode"], marginModes) &&
  validIntegerFields(v, [
    "signedQuantitySteps",
    "entryPriceTicks",
    "entryValueTicks",
    "realizedPnlUnits",
    "positionMarginUnits",
  ])
const validLeverage = (v: Row): boolean =>
  hasText(v["instrumentId"]) &&
  oneOf(v["marginMode"], marginModes) &&
  positiveInt64(v["leveragePpm"])
const validReservation = (v: Row): boolean =>
  positiveInt64(v["orderId"]) &&
  hasText(v["instrumentId"]) &&
  hasText(v["asset"]) &&
  oneOf(v["kind"], ["SPOT_ASSET", "DERIVATIVE_MARGIN"]) &&
  validIntegerFields(v, ["reservedUnits", "releasedUnits", "consumedUnits", "orderQuantitySteps"])
const validOrderIdentity = (v: Row): boolean =>
  validPositionIdentity(v) &&
  oneOf(v["side"], ["BUY", "SELL"]) &&
  oneOf(v["marginMode"], marginModes) &&
  oneOf(v["orderType"], orderTypes) &&
  oneOf(v["timeInForce"], timeInForce)
const validOrder = (v: Row): boolean =>
  positiveInt64(v["orderId"]) &&
  validOrderIdentity(v) &&
  v["status"] === "OPEN" &&
  validIntegerFields(v, [
    "priceTicks",
    "quantitySteps",
    "executedQuantitySteps",
    "remainingQuantitySteps",
    "cumulativeFeeUnits",
  ])
const validTrigger = (v: Row): boolean =>
  positiveInt64(v["triggerOrderId"]) &&
  positiveInt64(v["userId"]) &&
  validOrderIdentity(v) &&
  oneOf(v["status"], ["PENDING", "TRIGGERING"]) &&
  oneOf(v["triggerType"], ["TAKE_PROFIT", "STOP_LOSS", "TRAILING_STOP"]) &&
  validIntegerFields(v, [
    "triggerPriceTicks",
    "activationPriceTicks",
    "callbackRatePpm",
    "highestPriceTicks",
    "lowestPriceTicks",
    "priceTicks",
    "quantitySteps",
  ])
const validRisk = (v: Row): boolean =>
  validPositionIdentity(v) &&
  oneOf(v["status"], ["NORMAL", "WARNING", "LIQUIDATION"]) &&
  validIntegerFields(v, [
    "equityUnits",
    "unrealizedPnlUnits",
    "maintenanceMarginUnits",
    "marginRatioPpm",
  ])
function validExtraNumbers(row: Row): boolean {
  const fields = [
    "userId",
    "revision",
    "makerFeeRatePpm",
    "takerFeeRatePpm",
    "createdAtEpochMillis",
    "updatedAtEpochMillis",
    "clusterPosition",
    "executedValueHigh",
    "executedValueLow",
    "placedOrderId",
    "triggerSequence",
    "triggeredPriceTicks",
    "activatedAtEpochMillis",
    "expiresAtEpochMillis",
    "triggeredAtEpochMillis",
    "instrumentChangeId",
  ]
  return (
    fields.every((field) => row[field] === undefined || exactInt64(row[field])) &&
    (row["priceSource"] === undefined || oneOf(row["priceSource"], ["MARK", "LAST", "INDEX"])) &&
    (row["triggerCondition"] === undefined ||
      oneOf(row["triggerCondition"], ["GREATER_OR_EQUAL", "LESS_OR_EQUAL"]))
  )
}
function ownsRow(row: Row, event: WsEnvelope): boolean {
  return (
    (row["userId"] === undefined ||
      (positiveInt64(row["userId"]) &&
        (event.userId === undefined || String(row["userId"]) === String(event.userId)))) &&
    (row["productLine"] === undefined ||
      (oneOf(row["productLine"], PRODUCTS) &&
        (event.productLine === undefined || row["productLine"] === event.productLine)))
  )
}
function ownsPrivateData(data: Row, event: WsEnvelope): boolean {
  const account = record(event.op === "snapshot" ? data["account"] : data["value"])
  if (!ownsRow(account, event)) return false
  const sections = [
    account["balances"],
    account["positions"],
    account["leverages"],
    account["reservations"],
    data["openOrders"],
    data["triggerOrders"],
    data["positionRisks"],
    Array.isArray(data["value"]) ? data["value"] : [],
  ]
  return sections.every(
    (value) => !Array.isArray(value) || value.every((row) => ownsRow(record(row), event)),
  )
}

function validRows(
  value: unknown,
  key: (row: Row) => string,
  valid: (row: Row) => boolean,
): boolean {
  if (!Array.isArray(value) || value.length > 20_000) return false
  const keys = new Set<string>()
  for (const entry of value) {
    const row = record(entry)
    const identity = key(row)
    if (!valid(row) || !validExtraNumbers(row) || keys.has(identity)) return false
    keys.add(identity)
  }
  return true
}
const leverageKey = (v: Row) => `${v["instrumentId"]}:${v["marginMode"]}`
function validSnapshot(data: Row): boolean {
  const account = record(data["account"])
  const sections = [
    account["balances"],
    account["reservations"],
    account["positions"],
    account["leverages"],
    data["openOrders"],
    data["triggerOrders"],
    data["positionRisks"],
  ]
  const count = sections.reduce<number>(
    (total, section) => total + (Array.isArray(section) ? section.length : 0),
    0,
  )
  return (
    count <= 20_000 &&
    validExtraNumbers(account) &&
    oneOf(account["positionMode"], ["ONE_WAY", "HEDGE"]) &&
    validRows(account["balances"], (v) => String(v["asset"]), validBalance) &&
    validRows(account["reservations"], (v) => String(v["orderId"]), validReservation) &&
    validRows(account["positions"], positionKey, validPosition) &&
    validRows(account["leverages"], leverageKey, validLeverage) &&
    validRows(data["openOrders"], (v) => String(v["orderId"]), validOrder) &&
    validRows(data["triggerOrders"], (v) => String(v["triggerOrderId"]), validTrigger) &&
    validRows(data["positionRisks"], positionKey, validRisk)
  )
}

function validPrivateEvent(channel: string | undefined, data: Row): boolean {
  const value = record(data["value"])
  if (!validExtraNumbers(value)) return false
  switch (channel) {
    case "accountState":
      return (
        (value["positionMode"] === undefined ||
          oneOf(value["positionMode"], ["ONE_WAY", "HEDGE"])) &&
        (value["balances"] === undefined ||
          validRows(value["balances"], (v) => String(v["asset"]), validBalance)) &&
        (value["reservations"] === undefined ||
          validRows(value["reservations"], (v) => String(v["orderId"]), validReservation)) &&
        (value["leverages"] === undefined ||
          validRows(value["leverages"], leverageKey, validLeverage))
      )
    case "positions":
      return validRows(value["positions"], positionKey, validPosition)
    case "orders":
      return (
        validOrder({ ...value, status: "OPEN" }) &&
        oneOf(value["status"], ["OPEN", "FILLED", "CANCELED", "REJECTED"])
      )
    case "triggerOrders":
      return validRows(
        data["value"],
        (v) => String(v["triggerOrderId"]),
        (v) =>
          validTrigger({ ...v, status: "PENDING" }) &&
          oneOf(v["status"], [
            "PENDING",
            "TRIGGERING",
            "TRIGGERED",
            "TRIGGER_FAILED",
            "CANCELED",
            "EXPIRED",
          ]),
      )
    case "accountRisk":
    case "positionRisk":
      return validRisk(value)
    default:
      return true
  }
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
      if (validVersion(fence) && fence < this.fence) return false
      if (!validVersion(fence) || !validSnapshot(data) || !ownsPrivateData(data, event)) {
        this.status = "STALE"
        return false
      }
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
      for (const v of rows(account["leverages"]))
        put(`leverage:${v["instrumentId"]}:${v["marginMode"]}`, v)
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
    if (event.op !== "event") return false
    if (!validVersion(version)) {
      this.status = "STALE"
      return false
    }
    if (version <= this.fence) return false
    if (!validPrivateEvent(event.channel, data) || !ownsPrivateData(data, event)) {
      this.status = "STALE"
      return false
    }
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
        for (const row of rows(value["leverages"]))
          put(`leverage:${row["instrumentId"]}:${row["marginMode"]}`, row)
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
    return this.status === "READY" && now >= this.receivedAt && now - this.receivedAt < 15000
  }
}

export function unwrapEvent(event: WsEnvelope): WsEnvelope {
  const data = record(event.data)
  if (event.op !== "event" || !("value" in data)) return event
  const value = data["value"]
  return {
    ...event,
    version: String(data["version"]),
    id: `${event.productLine}:${event.channel}:${data["entityId"]}:${data["version"]}`,
    data: value,
  }
}
export function newerPublicEvent(event: WsEnvelope, previous?: WsEnvelope): boolean {
  // A newly subscribed book establishes a new baseline, even after a local Core reset.
  if (event.channel === "depth" && record(event.data)["updateType"] === "SNAPSHOT") return true
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
  instrumentId?: string
  period?: string
}
export interface C2cSubscription {
  channel: "c2c.inbox" | "c2c.messages"
  conversationId?: string
  after?: string
  afterEvent?: string
  productLine?: never
  instrumentId?: never
  period?: never
}
export type RealtimeSubscription = Subscription | C2cSubscription
export function isC2cSubscription(s: RealtimeSubscription): s is C2cSubscription {
  return s.productLine === undefined && (s.channel === "c2c.inbox" || s.channel === "c2c.messages")
}
export function isPrivateRealtimeChannel(channel: string): boolean {
  return PRIVATE_CHANNELS.has(channel) || channel === "c2c.inbox" || channel === "c2c.messages"
}
export function subscriptionProducts(
  subscriptions: readonly RealtimeSubscription[],
): ProductLine[] {
  return [...new Set(subscriptions.flatMap((s) => (s.productLine ? [s.productLine] : [])))]
}
export function subscriptionKey(s: RealtimeSubscription): string {
  if (isC2cSubscription(s)) return `${s.channel}:${s.conversationId ?? ""}`
  return `${s.productLine}:${s.channel}:${s.instrumentId ?? "*"}:${s.period ?? ""}`
}
export function privateSubscriptions(products: readonly ProductLine[]): Subscription[] {
  return products.flatMap((productLine) =>
    [...PRIVATE_CHANNELS]
      .filter((channel) => channel !== "accountRisk")
      .map((channel) => ({ channel, productLine })),
  )
}
/** Wire integers may include the Core's unsigned 128-bit cumulative execution value. */
export function integer(value: unknown): bigint {
  let parsed: bigint
  if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value)
  else if (typeof value === "string" && value.length <= 40 && /^-?\d+$/.test(value))
    parsed = BigInt(value)
  else throw new Error("Expected bounded exact integer units")
  if (parsed < -(1n << 127n) || parsed > (1n << 128n) - 1n)
    throw new Error("Integer units exceed the Core wire range")
  return parsed
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
        m["instrumentId"] === p["instrumentId"] &&
        String(m["changeId"]) === String(p["instrumentChangeId"]),
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
