import { z } from "zod"

const NumericSchema = z.union([z.string().max(256), z.number()])
const NullableNumericSchema = NumericSchema.nullable().optional()
const IdentifierSchema = z.union([z.string(), z.number()])
// Keep the existing string/number DTO shape while bounding primitive Core units.
const Int64WireSchema = z
  .union([
    z
      .string()
      .max(20)
      .regex(/^-?\d+$/),
    z.number().int().refine(Number.isSafeInteger),
  ])
  .refine((value) => {
    const text = String(value)
    const negative = text.startsWith("-")
    const digits = negative ? text.slice(1) : text
    return (
      digits.length <= 19 &&
      (digits.length < 19 || digits <= (negative ? "9223372036854775808" : "9223372036854775807"))
    )
  })
const UserIdSchema = Int64WireSchema.refine((value) => /^[1-9]\d{0,18}$/.test(String(value)))
const NonnegativeInt64WireSchema = Int64WireSchema.refine((value) => !String(value).startsWith("-"))
const NonnegativeInt64TextSchema = NonnegativeInt64WireSchema.transform(String)
const Int64TextSchema = Int64WireSchema.transform(String)

export const GenericObjectSchema = z.record(z.string(), z.unknown())

const PositiveInt64Schema = NonnegativeInt64TextSchema.refine(
  (value) =>
    value.length <= 19 &&
    /^\d+$/.test(value) &&
    BigInt(value) > 0n &&
    BigInt(value) <= 9223372036854775807n,
)
export const TradeFillPageSchema = z
  .object({
    userId: PositiveInt64Schema,
    productLine: z.string(),
    count: z.number().int().nonnegative(),
    trades: z.array(
      z.object({
        tradeId: z.string().min(1),
        productLine: z.string(),
        instrumentId: PositiveInt64Schema,
        orderId: PositiveInt64Schema,
        side: z.enum(["BUY", "SELL"]),
        positionSide: z.enum(["NET", "LONG", "SHORT"]),
        liquidityRole: z.enum(["MAKER", "TAKER"]),
        priceTicks: PositiveInt64Schema,
        quantitySteps: PositiveInt64Schema,
        feeRatePpm: Int64TextSchema.refine(
          (value) =>
            value.length <= 20 &&
            /^-?\d+$/.test(value) &&
            BigInt(value) >= -1000000n &&
            BigInt(value) <= 1000000n,
        ),
        eventTime: z.iso.datetime(),
      }),
    ),
    nextCursor: z.string().min(1).nullable(),
    hasMore: z.boolean(),
    sort: z.literal("eventTime.desc"),
    limit: z.number().int().min(1).max(1000),
  })
  .refine(
    (page) =>
      page.count === page.trades.length &&
      page.count <= page.limit &&
      page.hasMore === Boolean(page.nextCursor) &&
      page.trades.every(
        (fill) =>
          fill.productLine === page.productLine && fill.tradeId.startsWith(`${page.productLine}:`),
      ),
    "Invalid private fill page",
  )

export const UserSchema = z
  .object({
    userId: UserIdSchema,
    username: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
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
    accessTokenExpiresAt: z.string().optional(),
    refreshTokenExpiresAt: z.string().optional(),
    requiresEmailVerification: z.boolean().optional(),
    user: UserSchema,
  })
  .passthrough()

export const JwtPrincipalSchema = z
  .object({
    userId: UserIdSchema,
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
    status: z.string().optional(),
    symbol: z.string(),
    instrumentId: NonnegativeInt64TextSchema,
    changeId: NonnegativeInt64TextSchema.optional(),
    baseAsset: z.string().optional(),
    quoteAsset: z.string().optional(),
    settleAsset: z.string().optional(),
    // Preserve unknown wire enums for mapMarket to quarantine as UNKNOWN, never a guessed product.
    contractType: z.string().optional(),
    productLine: z.string().optional(),
    lastPrice: NumericSchema.optional(),
    lastPriceTicks: NonnegativeInt64TextSchema.optional(),
    change24h: NumericSchema.optional(),
    change24hPpm: NonnegativeInt64TextSchema.optional(),
    volume24h: NumericSchema.optional(),
    quoteVolume24h: NumericSchema.optional(),
    volume24hUnits: NonnegativeInt64TextSchema.optional(),
    high24h: NumericSchema.optional(),
    low24h: NumericSchema.optional(),
    trend: z.array(z.number().finite().positive()).max(32).optional(),
    notionalMultiplierUnits: NonnegativeInt64TextSchema.optional(),
    minQuantitySteps: NonnegativeInt64TextSchema.optional(),
    maxQuantitySteps: NonnegativeInt64TextSchema.optional(),
    minNotionalUnits: NonnegativeInt64TextSchema.optional(),
    maxNotionalUnits: NonnegativeInt64TextSchema.optional(),
    maxPositionNotionalUnits: NonnegativeInt64TextSchema.optional(),
    userOpenInterestLimitFloorUnits: NonnegativeInt64TextSchema.optional(),
    priceTickUnits: NonnegativeInt64TextSchema.optional(),
    quantityStepUnits: NonnegativeInt64TextSchema.optional(),
    pricePrecision: z.number().optional(),
    quantityPrecision: z.number().optional(),
    maxLeveragePpm: NonnegativeInt64TextSchema.optional(),
    fundingRate: NumericSchema.optional(),
    nextFundingTime: z.string().optional(),
    instrumentType: z.string().optional(),
    contractValueAsset: z.string().optional(),
    contractMultiplierPpm: NonnegativeInt64TextSchema.optional(),
    initialMarginRatePpm: NonnegativeInt64TextSchema.optional(),
    maintenanceMarginRatePpm: NonnegativeInt64TextSchema.optional(),
    makerFeeRatePpm: NonnegativeInt64TextSchema.optional(),
    takerFeeRatePpm: NonnegativeInt64TextSchema.optional(),
    fundingIntervalHours: z.number().optional(),
    expiryTime: z.string().nullable().optional(),
    deliveryTime: z.string().nullable().optional(),
    underlyingInstrumentId: z.string().nullable().optional(),
    underlyingProductLine: z
      .enum([
        "SPOT",
        "LINEAR_PERPETUAL",
        "INVERSE_PERPETUAL",
        "LINEAR_DELIVERY",
        "INVERSE_DELIVERY",
        "OPTION",
      ])
      .nullable()
      .optional(),
    strikePriceUnits: NonnegativeInt64TextSchema.nullable().optional(),
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
    quoteVolume: NumericSchema.optional(),
    updatedAt: z.string().optional(),
    eventTime: z.string().optional(),
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
    availableUnits: Int64WireSchema.optional(),
    lockedUnits: Int64WireSchema.optional(),
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
  .refine(
    (value) => Array.isArray(value.balances) || Array.isArray(value.items),
    "Missing balance collection",
  )

export const PositionSchema = z
  .object({
    userId: NonnegativeInt64TextSchema.optional(),
    instrumentId: z.string(),
    instrumentChangeId: NonnegativeInt64TextSchema.optional(),
    marginMode: z.string().optional(),
    positionSide: z.string().optional(),
    signedQuantitySteps: Int64TextSchema,
    entryPriceTicks: NonnegativeInt64TextSchema,
    realizedPnlUnits: Int64TextSchema,
    updatedAt: z.string().optional(),
  })
  .passthrough()

// Risk snapshots are a separate API contract: they do not contain realized PnL.
export const PositionRiskSchema = PositionSchema.omit({ realizedPnlUnits: true }).extend({
  marginMode: z.string(),
  positionSide: z.string(),
  liquidationPriceTicks: NonnegativeInt64TextSchema.nullable(),
})
export const PositionRiskListSchema = z.object({ positions: z.array(PositionRiskSchema) })

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
    orderId: NonnegativeInt64WireSchema.optional(),
    clientOrderId: z.string().optional(),
    instrumentId: z.string().optional(),
    side: z.string().optional(),
    type: z.string().optional(),
    orderType: z.string().optional(),
    timeInForce: z.string().optional(),
    priceTicks: NonnegativeInt64TextSchema.optional(),
    quantitySteps: NonnegativeInt64TextSchema.optional(),
    executedQuantitySteps: NonnegativeInt64TextSchema.optional(),
    remainingQuantitySteps: NonnegativeInt64TextSchema.optional(),
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

export const OrderHistoryPageSchema = z
  .object({
    count: z.number().int().nonnegative(),
    orders: z.array(
      OrderSchema.extend({
        orderId: PositiveInt64Schema,
        userId: PositiveInt64Schema,
        instrumentId: PositiveInt64Schema,
        side: z.enum(["BUY", "SELL"]),
        orderType: z.enum(["LIMIT", "MARKET"]),
        status: z.enum(["FILLED", "CANCELED", "REJECTED"]),
        priceTicks: NonnegativeInt64TextSchema,
        quantitySteps: PositiveInt64Schema,
        executedQuantitySteps: NonnegativeInt64TextSchema,
        remainingQuantitySteps: NonnegativeInt64TextSchema,
        cumulativeFeeUnits: Int64TextSchema,
        averagePriceTicks: z
          .string()
          .regex(/^\d+(?:\.\d+)?$/)
          .nullable(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      }).refine(
        (order) =>
          [order.executedQuantitySteps, order.quantitySteps, order.remainingQuantitySteps].every(
            (value) => value.length <= 19 && /^\d+$/.test(value),
          ) &&
          BigInt(order.executedQuantitySteps) <= BigInt(order.quantitySteps) &&
          BigInt(order.remainingQuantitySteps) <= BigInt(order.quantitySteps),
      ),
    ),
    nextCursor: z.string().min(1).nullable(),
    hasMore: z.boolean(),
    sort: z.literal("updatedAt.desc"),
    limit: z.number().int().min(1).max(1000),
  })
  .refine(
    (page) =>
      page.count === page.orders.length &&
      page.count <= page.limit &&
      page.hasMore === Boolean(page.nextCursor),
    "Invalid order history page",
  )

const DirectOrderSubmissionSchema = z
  .object({
    orderId: z.union([z.string(), z.number()]),
    status: OrderStatusSchema,
    clientOrderId: z.string().optional(),
    instrumentId: z.string().optional(),
    rejectReason: z.string().nullable().optional(),
  })
  .passthrough()

export const OrderSubmissionSchema = z.union([
  DirectOrderSubmissionSchema,
  z
    .object({ result: DirectOrderSubmissionSchema })
    .passthrough()
    .transform((response) => response.result),
])

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
    triggerOrderId: NonnegativeInt64TextSchema,
    userId: NonnegativeInt64TextSchema.optional(),
    clientTriggerOrderId: z.string().optional(),
    instrumentId: z.string(),
    side: z.enum(["BUY", "SELL"]),
    triggerType: z.enum(["TAKE_PROFIT", "STOP_LOSS", "TRAILING_STOP"]),
    priceSource: z.enum(["MARK", "LAST", "INDEX"]).optional(),
    triggerCondition: z.enum(["GREATER_OR_EQUAL", "LESS_OR_EQUAL"]).optional(),
    triggerPriceTicks: NonnegativeInt64TextSchema,
    activationPriceTicks: NonnegativeInt64TextSchema.nullable().optional(),
    callbackRatePpm: NonnegativeInt64TextSchema.nullable().optional(),
    orderType: z.enum(["LIMIT", "MARKET"]),
    timeInForce: z.enum(["GTC", "IOC", "FOK", "GTX"]),
    priceTicks: NonnegativeInt64TextSchema,
    quantitySteps: NonnegativeInt64TextSchema,
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
      priceTicks: NonnegativeInt64WireSchema,
      quantitySteps: NonnegativeInt64WireSchema,
      orderCount: NonnegativeInt64WireSchema.optional(),
    })
    .passthrough(),
])
export const OrderBookSchema = z
  .object({
    instrumentId: z.string().optional(),
    sequence: NonnegativeInt64WireSchema.optional(),
    previousSequence: NonnegativeInt64WireSchema.nullish(),
    updateType: z.enum(["SNAPSHOT", "DELTA"]).optional(),
    depth: z.number().optional(),
    lastUpdateId: z.union([z.string(), z.number()]).optional(),
    bids: z.array(OrderBookLevelSchema).readonly().optional(),
    asks: z.array(OrderBookLevelSchema).readonly().optional(),
  })
  .passthrough()

export const FundingRateSchema = z
  .object({
    instrumentId: z.string(),
    sequence: NonnegativeInt64WireSchema,
    fundingRatePpm: Int64WireSchema,
    premiumRatePpm: Int64WireSchema.nullable(),
    interestRatePpm: Int64WireSchema.nullable(),
    fundingTime: z.string(),
    fundingIntervalHours: z.number().nullable(),
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
    instrumentId: z.string(),
    asset: z.string(),
    marginMode: z.string(),
    positionSide: z.string(),
    signedQuantitySteps: Int64WireSchema,
    notionalUnits: Int64WireSchema,
    fundingRatePpm: Int64WireSchema,
    amountUnits: Int64WireSchema,
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
    amountUnits: Int64WireSchema,
    balanceAfterUnits: Int64WireSchema,
    referenceType: z.string(),
    referenceId: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    tradeId: IdentifierSchema.nullable().optional(),
    orderId: IdentifierSchema.nullable().optional(),
    instrumentId: z.string().nullable().optional(),
    feeRatePpm: Int64WireSchema.nullable().optional(),
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
    amountUnits: Int64WireSchema,
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
    availableUnits: Int64WireSchema,
    lockedUnits: Int64WireSchema,
    equityUnits: Int64WireSchema,
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
    amountUnits: Int64WireSchema,
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

export const KycProfileSchema = z
  .object({
    userId: PositiveInt64Schema,
    status: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "EXPIRED"]),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .passthrough()
  .nullable()
export const KycDocumentSchema = z
  .object({ documentId: PositiveInt64Schema, userId: PositiveInt64Schema })
  .passthrough()
export const KycProviderSchema = z.object({
  provider: z.enum(["SELF", "SUMSUB", "VERIFF"]),
  simulationEnabled: z.boolean(),
})
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

export const DeviceStatusSchema = z.object({
  sessionId: IdentifierSchema,
  deviceId: z.string().nullable(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastSeen: z.string(),
  active: z.boolean(),
  current: z.boolean(),
  blocked: z.boolean(),
})
export const IpStatusSchema = z.object({
  ipAddress: z.string(),
  loginCount: z.number(),
  lastSeen: z.string(),
  blocked: z.boolean(),
})

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

export const NotificationSchema = z.object({
  notificationId: PositiveInt64Schema,
  category: z.string().min(1).max(64),
  title: z.string().min(1),
  body: z.string(),
  readAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
})
export const NotificationListSchema = z
  .array(NotificationSchema)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((row) => row.notificationId)).size === rows.length,
    "Duplicate notification IDs",
  )
export const AnnouncementSchema = z
  .object({
    announcementId: PositiveInt64Schema,
    version: PositiveInt64Schema,
    category: z.enum(["GENERAL", "PRODUCT", "MAINTENANCE", "SECURITY", "RISK"]),
    title: z.string().min(1),
    summary: z.string(),
    body: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    readAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .passthrough()
export const AnnouncementPageSchema = z
  .object({
    announcements: z.array(AnnouncementSchema).max(100),
    unreadCount: z.number().int().nonnegative(),
    offset: z.number().int().min(0).max(1_000_000),
    limit: z.number().int().min(1).max(100),
    hasMore: z.boolean(),
  })
  .refine(
    (page) =>
      page.announcements.length <= page.limit &&
      (!page.hasMore || page.announcements.length > 0) &&
      new Set(page.announcements.map((row) => row.announcementId)).size ===
        page.announcements.length,
    "Invalid announcement page",
  )
export type ApiNotification = z.infer<typeof NotificationSchema>
export type ApiAnnouncement = z.infer<typeof AnnouncementSchema>

export type AuthSession = z.infer<typeof AuthSessionSchema>
export type JwtPrincipal = z.infer<typeof JwtPrincipalSchema>
export type ApiUserSession = z.infer<typeof UserSessionSchema>
export type ApiDeviceStatus = z.infer<typeof DeviceStatusSchema>
export type ApiIpStatus = z.infer<typeof IpStatusSchema>
export type ApiLoginHistoryEntry = z.infer<typeof LoginHistoryEntrySchema>
export type ApiMarket = z.infer<typeof MarketSchema>
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

export const LoginChallengeSchema = z.object({
  requiresVerification: z.literal(true),
  challengeToken: z.string(),
  expiresAt: z.string(),
  simulated: z.boolean().optional(),
  methods: z
    .array(
      z.object({ type: z.enum(["EMAIL", "PHONE", "TOTP"]), destination: z.string().nullable() }),
    )
    .min(1),
})
export type LoginChallenge = z.infer<typeof LoginChallengeSchema>
export type LoginVerificationCodes = {
  challengeToken: string
  emailCode?: string | undefined
  phoneCode?: string | undefined
  totpCode?: string | undefined
}
