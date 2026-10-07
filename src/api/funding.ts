import { z } from "zod"
import { request } from "./client"

const NetworkSchema = z.object({
  networkId: z.number(),
  networkCode: z.string(),
  displayName: z.string(),
  minDeposit: z.string(),
  minWithdrawal: z.string(),
  withdrawalFee: z.string(),
  confirmations: z.number(),
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
