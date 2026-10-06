/** Only whole multiples of the contract tick; keep aggregation useful at the current price. */
export function bookPriceMultipliers(tick: number, referencePrice: number): readonly number[] {
  if (
    !Number.isFinite(tick) ||
    tick <= 0 ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  )
    return [1]
  const maximum = Math.max(1, (referencePrice * 0.001) / tick)
  const choices: number[] = []
  for (let power = 1; power <= maximum && Number.isSafeInteger(power); power *= 10) {
    for (const factor of [1, 2, 5]) if (power * factor <= maximum) choices.push(power * factor)
  }
  if (choices.length <= 8) return choices
  return Array.from(
    { length: 8 },
    (_, index) => choices[Math.round((index * (choices.length - 1)) / 7)] ?? 1,
  )
}
