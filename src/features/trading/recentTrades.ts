// REST export sequence and WS matcher sequence belong to different domains.
// Core trade IDs identify the same fill on both paths and retain exact log ordering.
export function mergeRecentTrades(
  older: readonly Record<string, unknown>[],
  newer: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  const rows = new Map<string, Record<string, unknown>>()
  for (const row of [...older, ...newer]) {
    const id = String(row["tradeId"] ?? row["sequence"] ?? "")
    if (id) rows.set(id, { ...rows.get(id), ...row })
  }
  return [...rows.values()]
    .sort((a, b) => {
      const left = String(a["tradeId"] ?? "").split(":")
      const right = String(b["tradeId"] ?? "").split(":")
      if (left.length === 5 && right.length === 5 && left[0] === right[0]) {
        for (let i = 1; i < 5; i++) {
          if (!/^\d+$/.test(left[i] ?? "") || !/^\d+$/.test(right[i] ?? "")) break
          const difference = BigInt(right[i] ?? "0") - BigInt(left[i] ?? "0")
          if (difference !== 0n) return difference > 0n ? 1 : -1
        }
      }
      return String(b["eventTime"] ?? "").localeCompare(String(a["eventTime"] ?? ""))
    })
    .slice(0, 50)
}
