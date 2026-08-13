import { z } from "zod"

const NumericSchema = z.union([z.string(), z.number()])
const NullableNumericSchema = NumericSchema.nullable().optional()
const IdentifierSchema = z.union([z.string(), z.number()])
const SafeIntegerWireSchema = z
  .union([
    z.string().regex(/^\d+$/),
    z.number().int().nonnegative().refine(Number.isSafeInteger, "整数必须以字符串传输。"),
  ])
  .transform(String)
const SignedIntegerWireSchema = z
  .union([
    z.string().regex(/^-?\d+$/),
    z.number().int().refine(Number.isSafeInteger, "整数必须以字符串传输。"),
  ])
  .transform(String)

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
    settleAsset: z.string().optional(),
    contractType: z.string().optional(),
    productLine: z.string().optional(),
    lastPrice: NumericSchema.optional(),
    lastPriceTicks: SafeIntegerWireSchema.optional(),
    change24h: NumericSchema.optional(),
    change24hPpm: SafeIntegerWireSchema.optional(),
    volume24h: NumericSchema.optional(),
    volume24hUnits: SafeIntegerWireSchema.optional(),
    high24h: NumericSchema.optional(),
    low24h: NumericSchema.optional(),
    priceTickUnits: SafeIntegerWireSchema.optional(),
    quantityStepUnits: SafeIntegerWireSchema.optional(),
    pricePrecision: z.number().optional(),
    quantityPrecision: z.number().optional(),
    maxLeverage: z.number().optional(),
    fundingRate: NumericSchema.optional(),
    nextFundingTime: z.string().optional(),
    instrumentType: z.string().optional(),
    contractValueAsset: z.string().optional(),
    contractMultiplierPpm: SafeIntegerWireSchema.optional(),
    initialMarginRatePpm: SafeIntegerWireSchema.optional(),
    maintenanceMarginRatePpm: SafeIntegerWireSchema.optional(),
    makerFeeRatePpm: SafeIntegerWireSchema.optional(),
    takerFeeRatePpm: SafeIntegerWireSchema.optional(),
    fundingIntervalHours: z.number().optional(),
    expiryTime: z.string().nullable().optional(),
    deliveryTime: z.string().nullable().optional(),
    underlyingSymbol: z.string().nullable().optional(),
    strikePriceUnits: SafeIntegerWireSchema.nullable().optional(),
    optionType: z.string().nullable().optional(),
    optionExerciseStyle: z.string().nullable().optional(),
    settlementMethod: z.string().nullable().optional(),
  })
  .passthrough()

export const OptionQuoteSchema = z
  .object({
    symbol: z.string(),
    underlyingSymbol: z.string(),
    optionType: z.enum(["CALL", "PUT"]),
    expiryTime: z.string(),
    asOf: z.string(),
    underlyingPrice: NumericSchema,
    optionPrice: NumericSchema,
    strikePrice: NumericSchema,
    timeToExpiryYears: NumericSchema,
    impliedVolatility: NumericSchema,
    delta: NumericSchema,
    gamma: NumericSchema,
    thetaPerYear: NumericSchema,
    vega: NumericSchema,
    rho: NumericSchema,
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

export const PositionSchema = z
  .object({
    userId: SafeIntegerWireSchema.optional(),
    symbol: z.string(),
    instrumentVersion: SafeIntegerWireSchema.optional(),
    marginMode: z.string().optional(),
    positionSide: z.string().optional(),
    signedQuantitySteps: SignedIntegerWireSchema,
    entryPriceTicks: SafeIntegerWireSchema,
    realizedPnlUnits: SignedIntegerWireSchema,
    updatedAt: z.string().optional(),
  })
  .passthrough()

export const PositionListSchema = z.union([
  z.array(PositionSchema),
  z
    .object({
      positions: z.array(PositionSchema).optional(),
      items: z.array(PositionSchema).optional(),
    })
    .passthrough(),
])

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
    orderType: z.string().optional(),
    timeInForce: z.string().optional(),
    priceTicks: SafeIntegerWireSchema.optional(),
    quantitySteps: SafeIntegerWireSchema.optional(),
    executedQuantitySteps: SafeIntegerWireSchema.optional(),
    remainingQuantitySteps: SafeIntegerWireSchema.optional(),
    marginMode: z.string().optional(),
    positionSide: z.string().optional(),
    reduceOnly: z.boolean().optional(),
    postOnly: z.boolean().optional(),
    status: z.string().optional(),
    price: NullableNumericSchema,
    origQty: NullableNumericSchema,
    executedQty: NullableNumericSchema,
    time: z.union([z.string(), z.number()]).optional(),
    updateTime: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

const OrderStatusSchema = z.enum([
  "PENDING_RESERVE",
  "ACCEPTED",
  "REJECTED",
  "CANCEL_REQUESTED",
  "CANCELED",
  "PARTIALLY_FILLED",
  "FILLED",
])

export const OrderSubmissionSchema = z
  .object({
    orderId: z.union([z.string(), z.number()]),
    status: OrderStatusSchema,
    clientOrderId: z.string().optional(),
    symbol: z.string().optional(),
    rejectReason: z.string().nullable().optional(),
  })
  .passthrough()

export const OrderListSchema = z.union([
  z.array(OrderSchema),
  z
    .object({
      count: z.number().optional(),
      orders: z.array(OrderSchema).optional(),
      items: z.array(OrderSchema).optional(),
      nextCursor: z.string().nullable().optional(),
      hasMore: z.boolean().optional(),
      sort: z.string().optional(),
      limit: z.number().optional(),
    })
    .passthrough(),
])

export const TriggerOrderSchema = z
  .object({
    triggerOrderId: SafeIntegerWireSchema,
    userId: SafeIntegerWireSchema.optional(),
    clientTriggerOrderId: z.string().optional(),
    symbol: z.string(),
    side: z.enum(["BUY", "SELL"]),
    triggerType: z.enum(["TAKE_PROFIT", "STOP_LOSS", "TRAILING_STOP"]),
    triggerCondition: z.enum(["GREATER_OR_EQUAL", "LESS_OR_EQUAL"]).optional(),
    triggerPriceTicks: SafeIntegerWireSchema,
    activationPriceTicks: SafeIntegerWireSchema.nullable().optional(),
    callbackRatePpm: SafeIntegerWireSchema.nullable().optional(),
    orderType: z.enum(["LIMIT", "MARKET"]),
    timeInForce: z.enum(["GTC", "IOC", "FOK", "GTX"]),
    priceTicks: SafeIntegerWireSchema,
    quantitySteps: SafeIntegerWireSchema,
    marginMode: z.string().optional(),
    positionSide: z.string().optional(),
    status: z.enum(["PENDING", "TRIGGERING", "TRIGGERED", "TRIGGER_FAILED", "CANCELED", "EXPIRED"]),
    rejectReason: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    triggeredAt: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough()

export const TriggerOrderQuerySchema = z
  .object({
    count: z.number(),
    orders: z.array(TriggerOrderSchema),
    nextCursor: z.string().nullable().optional(),
    hasMore: z.boolean().optional(),
    sort: z.string().optional(),
    limit: z.number().optional(),
  })
  .passthrough()

export const OrderBookLevelSchema = z.union([
  z.tuple([NumericSchema, NumericSchema]),
  z
    .object({
      priceTicks: IdentifierSchema,
      quantitySteps: IdentifierSchema,
      orderCount: IdentifierSchema.optional(),
    })
    .passthrough(),
])
export const OrderBookSchema = z
  .object({
    symbol: z.string().optional(),
    sequence: IdentifierSchema.optional(),
    previousSequence: IdentifierSchema.optional(),
    updateType: z.enum(["SNAPSHOT", "DELTA"]).optional(),
    depth: z.number().optional(),
    lastUpdateId: z.union([z.string(), z.number()]).optional(),
    bids: z.array(OrderBookLevelSchema).readonly().optional(),
    asks: z.array(OrderBookLevelSchema).readonly().optional(),
  })
  .passthrough()

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

export const ExchangeRateConvertSchema = z
  .object({
    fromCurrency: z.string(),
    toCurrency: z.string(),
    amount: NumericSchema,
    convertedAmount: NumericSchema,
    rate: NumericSchema,
    route: z.string().optional(),
    rateTime: z.string(),
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
    sourceBalance: ProductBalanceSchema.optional(),
    targetBalance: ProductBalanceSchema.optional(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
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
export type ApiOptionQuote = z.infer<typeof OptionQuoteSchema>
export type ApiCandle = z.infer<typeof CandleSchema>
export type ApiBalance = z.infer<typeof BalanceSchema>
export type ApiOrder = z.infer<typeof OrderSchema>
export type ApiTriggerOrder = z.infer<typeof TriggerOrderSchema>
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
