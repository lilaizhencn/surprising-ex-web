import { z } from "zod"
import { request } from "./client"

/** Expand decimal notation without converting financial values through a floating-point number. */
export function fundingDecimal(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(value)
  if (!match || value.length > 120) throw new Error("Invalid configured amount")
  const whole = match[1] ?? "0",
    fraction = match[2] ?? ""
  const digits = whole + fraction
  if (!/[1-9]/.test(digits)) return "0"
  const point = whole.length + Number(match[3] ?? 0)
  if (Math.abs(point) > 120) throw new Error("Invalid configured precision")
  const plain =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`
  return plain
    .replace(/^0+(?=\d)/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "")
}
const ConfiguredAmount = z.string().transform((value, context) => {
  try {
    return fundingDecimal(value)
  } catch {
    context.addIssue({ code: "custom", message: "Invalid configured amount" })
    return z.NEVER
  }
})
const NetworkSchema = z.object({
  networkId: z.number(),
  networkCode: z.string(),
  displayName: z.string(),
  minDeposit: ConfiguredAmount,
  minWithdrawal: ConfiguredAmount,
  withdrawalFee: ConfiguredAmount,
  confirmations: z.number().int().nonnegative(),
})
const FundingAssetSchema = z.object({
  asset: z.string(),
  displayName: z.string(),
  logoUrl: z.string(),
  networks: z.array(NetworkSchema),
})
const AddressSchema = z.object({
  asset: z.string(),
  network: z.string(),
  address: z.string().min(1),
  memo: z.string(),
})
export type FundingAsset = z.infer<typeof FundingAssetSchema>
export type FundingAddress = z.infer<typeof AddressSchema>
export function loadFundingAssets(operation: "deposit" | "withdraw", signal?: AbortSignal) {
  return request(
    `/api/v1/wallet/assets?operation=${operation}`,
    z.array(FundingAssetSchema),
    signal ? { signal } : {},
  )
}
export function getDepositAddress(asset: string, network: string, signal: AbortSignal) {
  return request("/api/v1/wallet/deposit-address", AddressSchema, {
    method: "POST",
    body: { asset, network },
    signal,
  })
}
