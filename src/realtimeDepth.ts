import { type ApiOrderBookLevel, OrderBookSchema } from "./api/types"
import { integer, type WsEnvelope } from "./realtime"

const MAX_LEVELS = 50

// Materialize depth before React's throttled publication. The feed's existing latest map
// owns this single bounded value; rendering never has to replay an event queue.
export function applyDepthEvent(event: WsEnvelope, previous?: WsEnvelope): WsEnvelope | null {
  const parsed = OrderBookSchema.safeParse(event.data)
  if (!parsed.success) return null
  const update = parsed.data
  try {
    const sequence = integer(update.sequence)
    if (sequence < 0n) return null
    if (update.updateType === "SNAPSHOT") {
      const bids = mergeLevels([], update.bids ?? [])
      const asks = mergeLevels([], update.asks ?? [])
      return { ...event, data: { ...update, bids, asks } }
    }
    if (update.updateType !== "DELTA" || !previous) return null
    if (event.productLine !== previous.productLine || event.symbol !== previous.symbol) return null
    const baseline = OrderBookSchema.parse(previous.data)
    const before = integer(baseline.sequence)
    if (sequence <= before) return previous
    if (integer(update.previousSequence) !== before) return null
    const bids = mergeLevels(baseline.bids ?? [], update.bids ?? [])
    const asks = mergeLevels(baseline.asks ?? [], update.asks ?? [])
    return { ...event, data: { ...update, updateType: "SNAPSHOT", bids, asks } }
  } catch {
    // Invalid units, a missing baseline or a broken chain require a fresh WS snapshot.
    return null
  }
}

function mergeLevels(
  baseline: readonly ApiOrderBookLevel[],
  updates: readonly ApiOrderBookLevel[],
): readonly ApiOrderBookLevel[] {
  const levels = new Map<string, ApiOrderBookLevel>()
  for (const level of [...baseline, ...updates]) {
    // The WS protocol uses integer ticks/steps; display decimals belong to the view.
    if (Array.isArray(level)) throw new Error("Expected depth ticks and steps")
    const price = integer(level.priceTicks)
    const quantity = integer(level.quantitySteps)
    if (price <= 0n || quantity < 0n) throw new Error("Invalid depth level")
    if (quantity === 0n) levels.delete(price.toString())
    else levels.set(price.toString(), level)
  }
  if (levels.size > MAX_LEVELS) throw new Error("Depth exceeds subscribed window")
  return [...levels.values()]
}
