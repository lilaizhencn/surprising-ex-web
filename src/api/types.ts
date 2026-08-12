import { z } from "zod"

const NumericSchema = z.union([z.string(), z.number()])
const NullableNumericSchema = NumericSchema.nullable().optional()

export const GenericObjectSchema = z.record(z.string(), z.unknown())

export const UserSchema = z
  .object({
    userId: z.union([z.string(), z.number()]),
    username: z.string().nullable().optional(),
    email: z.string().optional(),
    phone: z.string().nullable().optional(),
    status: z.string().optional(),
    roles: z.array(z.string()).optional(),
    createdAt: z.string().optional(),
  })
  .passthrough()

export const AuthSessionSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.string().optional(),
    requiresEmailVerification: z.boolean().optional(),
    user: UserSchema,
  })
  .passthrough()

export const JwtPrincipalSchema = z
  .object({
    userId: z.union([z.string(), z.number()]),
    username: z.string().nullable().optional(),
    status: z.string(),
    roles: z.array(z.string()),
    expiresAt: z.string(),
  })
  .passthrough()

export const EmailVerificationChallengeSchema = z
  .object({
    challengeId: z.union([z.string(), z.number()]).optional(),
    expiresAt: z.string().optional(),
    accepted: z.boolean().optional(),
  })
  .passthrough()

export const MarketSchema = z
  .object({
    symbol: z.string(),
    baseAsset: z.string().optional(),
    quoteAsset: z.string().optional(),
    contractType: z.string().optional(),
    productLine: z.string().optional(),
    lastPrice: NumericSchema.optional(),
    lastPriceTicks: z.number().optional(),
    change24h: NumericSchema.optional(),
    change24hPpm: z.number().optional(),
    volume24h: NumericSchema.optional(),
    volume24hUnits: z.number().optional(),
    high24h: NumericSchema.optional(),
    low24h: NumericSchema.optional(),
    priceTickUnits: z.number().optional(),
    quantityStepUnits: z.number().optional(),
    pricePrecision: z.number().optional(),
    quantityPrecision: z.number().optional(),
    maxLeverage: z.number().optional(),
    fundingRate: NumericSchema.optional(),
    nextFundingTime: z.string().optional(),
    instrumentType: z.string().optional(),
    contractValueAsset: z.string().optional(),
    contractMultiplierPpm: z.number().optional(),
    initialMarginRatePpm: z.number().optional(),
    maintenanceMarginRatePpm: z.number().optional(),
    makerFeeRatePpm: z.number().optional(),
    takerFeeRatePpm: z.number().optional(),
    fundingIntervalHours: z.number().optional(),
    expiryTime: z.string().nullable().optional(),
    deliveryTime: z.string().nullable().optional(),
    underlyingSymbol: z.string().nullable().optional(),
    strikePriceUnits: z.number().nullable().optional(),
    optionType: z.string().nullable().optional(),
    optionExerciseStyle: z.string().nullable().optional(),
    settlementMethod: z.string().nullable().optional(),
  })
  .passthrough()

export const MarketListSchema = z
  .object({
    instruments: z.array(MarketSchema).optional(),
    items: z.array(MarketSchema).optional(),
  })
  .passthrough()

export const CandleSchema = z
  .object({
    openTime: z.string(),
    openPrice: NumericSchema,
    highPrice: NumericSchema,
    lowPrice: NumericSchema,
    closePrice: NumericSchema,
    baseVolume: NumericSchema.optional(),
  })
  .passthrough()

export const CandleListSchema = z
  .object({
    candles: z.array(CandleSchema).optional(),
    items: z.array(CandleSchema).optional(),
  })
  .passthrough()

export const BalanceSchema = z
  .object({
    asset: z.string(),
    accountType: z.string().optional(),
    availableUnits: NumericSchema.optional(),
    lockedUnits: NumericSchema.optional(),
    free: NumericSchema.optional(),
    locked: NumericSchema.optional(),
  })
  .passthrough()

export const BalanceListSchema = z
  .object({
    balances: z.array(BalanceSchema).optional(),
    items: z.array(BalanceSchema).optional(),
  })
  .passthrough()

export const AssetScalesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number()]).transform((value) => String(value)),
)

export const OrderSchema = z
  .object({
    orderId: z.union([z.string(), z.number()]).optional(),
    clientOrderId: z.string().optional(),
    symbol: z.string().optional(),
    side: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    price: NullableNumericSchema,
    origQty: NullableNumericSchema,
    executedQty: NullableNumericSchema,
    time: z.union([z.string(), z.number()]).optional(),
    updateTime: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

export const OrderListSchema = z.union([
  z.array(OrderSchema),
  z
    .object({ orders: z.array(OrderSchema).optional(), items: z.array(OrderSchema).optional() })
    .passthrough(),
])

export const OrderBookLevelSchema = z.tuple([NumericSchema, NumericSchema])
export const OrderBookSchema = z
  .object({
    lastUpdateId: z.union([z.string(), z.number()]).optional(),
    bids: z.array(OrderBookLevelSchema).optional(),
    asks: z.array(OrderBookLevelSchema).optional(),
  })
  .passthrough()

const IdentifierSchema = z.union([z.string(), z.number()])

export const FundingRateSchema = z
  .object({
    symbol: z.string(),
    sequence: IdentifierSchema,
    fundingRatePpm: IdentifierSchema,
    premiumRatePpm: IdentifierSchema,
    interestRatePpm: IdentifierSchema,
    fundingTime: z.string(),
    fundingIntervalHours: z.number(),
    status: z.string(),
    eventTime: z.string(),
  })
  .passthrough()

export const FundingRatePageSchema = z
  .object({
    count: z.number(),
    rates: z.array(FundingRateSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    sort: z.string(),
    limit: z.number(),
  })
  .passthrough()

export const FundingPaymentSchema = z
  .object({
    paymentId: IdentifierSchema,
    settlementId: IdentifierSchema,
    userId: IdentifierSchema,
    symbol: z.string(),
    asset: z.string(),
    marginMode: z.string(),
    positionSide: z.string(),
    signedQuantitySteps: IdentifierSchema,
    notionalUnits: IdentifierSchema,
    fundingRatePpm: IdentifierSchema,
    amountUnits: IdentifierSchema,
    createdAt: z.string(),
  })
  .passthrough()

export const FundingPaymentPageSchema = z
  .object({
    count: z.number(),
    payments: z.array(FundingPaymentSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    sort: z.string(),
    limit: z.number(),
  })
  .passthrough()

export const AccountLedgerEntrySchema = z
  .object({
    entryId: IdentifierSchema,
    userId: IdentifierSchema,
    asset: z.string(),
    amountUnits: IdentifierSchema,
    balanceAfterUnits: IdentifierSchema,
    referenceType: z.string(),
    referenceId: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    tradeId: IdentifierSchema.nullable().optional(),
    orderId: IdentifierSchema.nullable().optional(),
    symbol: z.string().nullable().optional(),
    feeRatePpm: IdentifierSchema.nullable().optional(),
    createdAt: z.string(),
  })
  .passthrough()

export const AccountLedgerPageSchema = z
  .object({
    count: z.number(),
    entries: z.array(AccountLedgerEntrySchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    sort: z.string(),
    limit: z.number(),
  })
  .passthrough()

export const ProductTransferRecordSchema = z
  .object({
    transferId: IdentifierSchema,
    userId: IdentifierSchema,
    sourceAccountType: z.string(),
    targetAccountType: z.string(),
    asset: z.string(),
    amountUnits: IdentifierSchema,
    referenceId: z.string().nullable().optional(),
    status: z.string(),
    reason: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough()

export const ProductTransferRecordPageSchema = z
  .object({
    count: z.number(),
    transfers: z.array(ProductTransferRecordSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    sort: z.string(),
    limit: z.number(),
  })
  .passthrough()

export const DepositAddressSchema = z
  .object({
    address: z.string().optional(),
    depositAddress: z.string().optional(),
    memo: z.string().optional(),
    tag: z.string().optional(),
  })
  .passthrough()
  .refine((value) => Boolean(value.address || value.depositAddress), {
    message: "custody response must include a deposit address",
  })

const ProductBalanceSchema = z
  .object({
    userId: IdentifierSchema,
    accountType: z.string(),
    asset: z.string(),
    availableUnits: IdentifierSchema,
    lockedUnits: IdentifierSchema,
    equityUnits: IdentifierSchema,
    updatedAt: z.string(),
  })
  .passthrough()

export const ProductTransferResponseSchema = z
  .object({
    transferId: IdentifierSchema,
    userId: IdentifierSchema,
    sourceAccountType: z.string(),
    targetAccountType: z.string(),
    asset: z.string(),
    amountUnits: IdentifierSchema,
    referenceId: z.string(),
    status: z.string(),
    sourceBalance: ProductBalanceSchema,
    targetBalance: ProductBalanceSchema,
    createdAt: z.string(),
  })
  .passthrough()

export const WithdrawalSubmissionSchema = z
  .object({
    id: z.string(),
    withdrawalId: z.string(),
    status: z.string(),
    success: z.literal(true),
  })
  .passthrough()

export const WalletRecordSchema = GenericObjectSchema
export const WalletRecordsSchema = z.array(WalletRecordSchema)

export const KycProfileSchema = GenericObjectSchema.nullable()
export const SecurityApiKeySchema = GenericObjectSchema
export const SecurityApiKeyListSchema = z.array(SecurityApiKeySchema)

export const UserSessionSchema = z
  .object({
    sessionId: z.union([z.string(), z.number()]),
    userId: z.union([z.string(), z.number()]),
    active: z.boolean(),
    expiresAt: z.string(),
    revokedAt: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough()

export const UserSessionPageSchema = z
  .object({
    count: z.number(),
    sessions: z.array(UserSessionSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    sort: z.string(),
    limit: z.number(),
  })
  .passthrough()

export const LoginHistoryEntrySchema = z
  .object({
    loginId: z.union([z.string(), z.number()]),
    userId: z.union([z.string(), z.number()]).nullable().optional(),
    result: z.string(),
    reason: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .passthrough()

export const LoginHistoryPageSchema = z
  .object({
    count: z.number(),
    logs: z.array(LoginHistoryEntrySchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    sort: z.string(),
    limit: z.number(),
  })
  .passthrough()
export const HelpArticleSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  category: z.string(),
  summary: z.string(),
  body: z.string(),
  updatedAt: z.string(),
})
export const HelpArticleListSchema = z.array(HelpArticleSchema)

export type AuthSession = z.infer<typeof AuthSessionSchema>
export type JwtPrincipal = z.infer<typeof JwtPrincipalSchema>
export type ApiUserSession = z.infer<typeof UserSessionSchema>
export type ApiLoginHistoryEntry = z.infer<typeof LoginHistoryEntrySchema>
export type ApiMarket = z.infer<typeof MarketSchema>
export type ApiCandle = z.infer<typeof CandleSchema>
export type ApiBalance = z.infer<typeof BalanceSchema>
export type ApiOrder = z.infer<typeof OrderSchema>
export type ApiOrderBook = z.infer<typeof OrderBookSchema>
export type ApiOrderBookLevel = z.infer<typeof OrderBookLevelSchema>
export type ApiWalletRecord = z.infer<typeof WalletRecordSchema>
export type ApiHelpArticle = z.infer<typeof HelpArticleSchema>
export type ApiFundingRate = z.infer<typeof FundingRateSchema>
export type ApiFundingPayment = z.infer<typeof FundingPaymentSchema>
export type ApiAccountLedgerEntry = z.infer<typeof AccountLedgerEntrySchema>
export type ApiProductTransferRecord = z.infer<typeof ProductTransferRecordSchema>
export type ApiProductTransferResponse = z.infer<typeof ProductTransferResponseSchema>
export type ApiWithdrawalSubmission = z.infer<typeof WithdrawalSubmissionSchema>
