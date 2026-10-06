import { expect, it } from "vitest"
import { bookPriceMultipliers } from "./bookPriceSteps"

it("bounds aggregation by price and keeps the exact contract tick", () => {
  for (const [tick, price] of [
    [0.1, 86000],
    [0.01, 2700],
    [0.01, 120],
    [1e-12, 1.23e-10],
  ] as const) {
    const choices = bookPriceMultipliers(tick, price)
    expect(choices[0]).toBe(1)
    expect(choices.length).toBeLessThanOrEqual(8)
    expect(choices.every((n) => Number.isSafeInteger(n) && n > 0)).toBe(true)
    expect((choices.at(-1) ?? Number.NaN) * tick).toBeLessThanOrEqual(Math.max(tick, price * 0.001))
  }
  expect(bookPriceMultipliers(0.01, 120)).toEqual([1, 2, 5, 10])
  expect(bookPriceMultipliers(0.1, 86000)).not.toEqual(bookPriceMultipliers(0.01, 120))
})
it("keeps a safe base selection before price discovery", () => {
  expect(bookPriceMultipliers(0, 100)).toEqual([1])
  expect(bookPriceMultipliers(0.1, Number.NaN)).toEqual([1])
})
