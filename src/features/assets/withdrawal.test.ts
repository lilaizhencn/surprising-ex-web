import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { fundingDecimal } from "../../api/funding"
import { BalanceListSchema } from "../../api/types"
import { withdrawalAmount } from "./withdrawalAmount"
import {
  clearWithdrawalIntent,
  confirmedWithdrawalIntent,
  readWithdrawalIntent,
  saveWithdrawalIntent,
  type WithdrawalIntent,
  withdrawalIntentKey,
  withdrawalRecorded,
} from "./withdrawalIntent"

const intent: WithdrawalIntent = {
  userId: "1",
  reference: "withdraw-11111111-1111-4111-8111-111111111111",
  asset: "USDT",
  network: "ETH",
  address: "0x123",
  amount: "0.00000001",
  fee: "0",
  receivedAmount: "0.00000001",
  networkRevision: 0,
  createdAt: "2026-10-26T12:00:00Z",
}
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    dispatchEvent: vi.fn(),
  })
})
afterEach(() => vi.unstubAllGlobals())

it("a missing balance collection cannot become a successful zero balance", () => {
  expect(BalanceListSchema.safeParse({}).success).toBe(false)
  expect(BalanceListSchema.safeParse({ balances: null }).success).toBe(false)
  expect(BalanceListSchema.safeParse({ balances: [] }).success).toBe(true)
})

it("checks minimum, precision and available units without rounding money", () => {
  expect(withdrawalAmount("90071992.54740993", "100000000", "0.00000001", "9007199254740993")).toBe(
    "90071992.54740993",
  )
  expect(() => withdrawalAmount("90071992.54740994", "100000000", "0", "9007199254740993")).toThrow(
    "Insufficient",
  )
  expect(() => withdrawalAmount("0.000000001", "100000000", "0", "1")).toThrow("precision")
  expect(() => withdrawalAmount("0.01", "100000000", "0.02", "999999999")).toThrow("minimum")
})
it("reads configured scientific notation exactly, including zero and large decimals", () => {
  expect(fundingDecimal("0E-8")).toBe("0")
  expect(fundingDecimal("1E-8")).toBe("0.00000001")
  expect(fundingDecimal("9007199254740993.0100")).toBe("9007199254740993.01")
  expect(fundingDecimal("1.2300E+2")).toBe("123")
  for (const value of ["-1", "NaN", "1E999", "Infinity"])
    expect(() => fundingDecimal(value)).toThrow()
})
it("persists only the original request and never security codes", () => {
  saveWithdrawalIntent({ ...intent, emailCode: "123456", totpCode: "654321" } as WithdrawalIntent)
  expect(readWithdrawalIntent("1")).toEqual(intent)
  expect(storage.get(withdrawalIntentKey("1"))).not.toContain("123456")
  expect(readWithdrawalIntent("2")).toBeNull()
})
it("an unconfirmed or malformed reference cannot be silently discarded", () => {
  saveWithdrawalIntent(intent)
  expect(withdrawalRecorded(intent)).toBe(false)
  expect(() => clearWithdrawalIntent(intent)).toThrow("Confirm the original")
  storage.set(withdrawalIntentKey("1"), "broken")
  expect(() => readWithdrawalIntent("1")).toThrow("saved withdrawal reference")
  storage.set(withdrawalIntentKey("1"), JSON.stringify({ ...intent, userId: "2" }))
  expect(() => readWithdrawalIntent("1")).toThrow("saved withdrawal reference")
})
it("only a recorded matching request may be acknowledged; failed persistence keeps it recoverable", () => {
  const accepted = {
    ...intent,
    receipt: { id: "wallet-1", withdrawalId: "gateway-1", status: "PENDING_APPROVAL" },
  }
  saveWithdrawalIntent(accepted)
  expect(withdrawalRecorded(accepted)).toBe(true)
  expect(() => clearWithdrawalIntent({ ...accepted, reference: "another" })).toThrow()
  clearWithdrawalIntent(accepted)
  expect(readWithdrawalIntent("1")).toBeNull()
  window.localStorage.setItem = () => {
    throw new Error("denied")
  }
  expect(() => saveWithdrawalIntent(intent)).toThrow("Cannot save")
})

it("binds a recovery receipt to the originally approved fee and net amount", () => {
  const receipt = {
    id: "wallet-1",
    withdrawalId: "gateway-1",
    status: "COMPLETED" as const,
    success: true as const,
    amount: intent.amount,
    platformFee: intent.fee,
    receivedAmount: intent.receivedAmount,
    networkRevision: intent.networkRevision,
  }
  expect(confirmedWithdrawalIntent(intent, receipt).receipt?.status).toBe("COMPLETED")
  for (const changed of [
    { ...receipt, platformFee: "1" },
    { ...receipt, receivedAmount: "1" },
    { ...receipt, amount: "1" },
    { ...receipt, networkRevision: 1 },
  ]) {
    expect(() => confirmedWithdrawalIntent(intent, changed)).toThrow("approved quote")
  }
})
