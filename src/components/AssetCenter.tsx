import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, Eye, EyeOff, FileText, RefreshCw, Search, Send, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { localized } from "../localized";
import type { LanguageMode } from "../localized";
import { displayUnits } from "../config";
import type { AccountLedgerEntry, Balance, ProductAccountType, ProductMode, ProductLine, ValuationCurrency } from "../types";
import { AssetIcon, SupportBubble, assetName } from "./AssetPrimitives";
import { UiButton, UiCard, UiEmptyState, UiLoadingState } from "./UiPrimitives";

export type ProductAssetMeta = Record<ProductMode, {
  label: string;
  labelEn: string;
  shortLabel: string;
  shortLabelEn: string;
  accountType: ProductAccountType;
  productLine: ProductLine;
}>;

export type ProductBalances = Record<ProductMode, Balance[]>;
const HIDDEN_BALANCE = "••••••";

export function emptyProductBalances(): ProductBalances {
  return { linear: [], inverse: [], linearDelivery: [], inverseDelivery: [], option: [], spot: [] };
}

export function AssetCenter({
  activeProduct,
  balancesByProduct,
  balanceState,
  session,
  language,
  productMeta,
  valuationCurrency,
  valuationRates,
  valuationRateState,
  valuationMarketState,
  valuationPrices,
  recentLedger,
  recentLedgerState,
  recentLedgerHasMore,
  onValuationCurrencyChange,
  onOpenProduct,
  onOpenOverview,
  onOpenLedger,
  onDeposit,
  onWithdraw,
  onTransfer,
  onHelp,
  onRefresh
}: {
  activeProduct: ProductMode | null;
  balancesByProduct: ProductBalances;
  balanceState: "idle" | "loading" | "ready" | "error";
  session: { user: { email?: string | null } } | null;
  language: LanguageMode;
  productMeta: ProductAssetMeta;
  valuationCurrency: ValuationCurrency;
  valuationRates: Partial<Record<ValuationCurrency, number>>;
  valuationRateState: "idle" | "loading" | "ready" | "error";
  valuationMarketState: "idle" | "loading" | "ready" | "error";
  valuationPrices: Record<string, number>;
  recentLedger: AccountLedgerEntry[];
  recentLedgerState: "idle" | "loading" | "ready" | "error";
  recentLedgerHasMore: boolean;
  onValuationCurrencyChange: (currency: ValuationCurrency) => void;
  onOpenProduct: (product: ProductMode) => void;
  onOpenOverview: () => void;
  onOpenLedger: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: (product: ProductMode, asset?: string) => void;
  onHelp: () => void;
  onRefresh: () => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [balancesVisible, setBalancesVisible] = useState(true);
  const valuationRate = valuationRates[valuationCurrency];
  const allBalances = useMemo(() => Object.values(balancesByProduct).flat(), [balancesByProduct]);
  const totalValue = useMemo(() => {
    if (valuationRate === undefined || valuationRateState !== "ready" || valuationMarketState !== "ready") return null;
    const values = allBalances.map((balance) => {
      const price = assetValuationPrice(balance.asset, valuationPrices);
      return price === null ? null : unitsToNumber(balance.equityUnits) * price * valuationRate;
    });
    return values.every((value) => value !== null) ? values.reduce((sum, value) => sum + (value ?? 0), 0) : null;
  }, [allBalances, valuationMarketState, valuationPrices, valuationRate, valuationRateState]);

  if (activeProduct) {
    return <ProductAssetsPage
      product={activeProduct}
      balances={balancesByProduct[activeProduct]}
      balanceState={balanceState}
      language={language}
      productMeta={productMeta}
      valuationCurrency={valuationCurrency}
      valuationRates={valuationRates}
      valuationRateState={valuationRateState}
      valuationMarketState={valuationMarketState}
      valuationPrices={valuationPrices}
      balancesVisible={balancesVisible}
      onToggleBalances={() => setBalancesVisible((current) => !current)}
      onValuationCurrencyChange={onValuationCurrencyChange}
      onBack={onOpenOverview}
      onDeposit={onDeposit}
      onWithdraw={onWithdraw}
      onTransfer={(asset) => onTransfer(activeProduct, asset)}
      onHelp={onHelp}
      onRefresh={onRefresh}
    />;
  }

  return <section className="asset-page asset-center-page">
    <div className="asset-center-heading">
      <div>
        <span className="asset-eyebrow">ASSET CENTER</span>
        <h1>{text("资产总览", "Asset overview")}</h1>
        <p>{text("统一查看六条产品线的真实账户资产，进入独立页面后只展示该账户上下文。", "View real balances across six isolated product accounts, then open each account in its own context.")}</p>
      </div>
      <UiButton variant="secondary" className="asset-refresh-button" type="button" onClick={onRefresh}><RefreshCw size={15} />{text("刷新", "Refresh")}</UiButton>
    </div>
    <div className="asset-overview-layout">
      <div className="asset-overview-main">
        <UiCard className="asset-summary-card asset-overview-summary">
          <div>
            <div className="asset-label"><WalletCards size={15} />{text("全部产品线总权益", "Total equity across products")} <button className="asset-visibility-toggle" type="button" aria-pressed={!balancesVisible} aria-label={balancesVisible ? text("隐藏资产数字", "Hide balances") : text("显示资产数字", "Show balances")} onClick={() => setBalancesVisible((current) => !current)}>{balancesVisible ? <Eye size={15} /> : <EyeOff size={15} />}</button></div>
            <h2>{balancesVisible ? session && balanceState !== "loading" && totalValue !== null ? formatValuation(totalValue, valuationCurrency) : "—" : HIDDEN_BALANCE} <span><select className="asset-valuation-select" value={valuationCurrency} onChange={(event) => onValuationCurrencyChange(event.target.value as ValuationCurrency)} aria-label={text("估值货币", "Valuation currency")}><option value="USDT">USDT</option><option value="USD">USD</option><option value="CNY">CNY</option></select><ChevronDown size={13} /></span></h2>
            <p className="asset-login-note">{!session ? text("登录后同步真实资产。", "Log in to sync real balances.") : balanceState === "loading" ? text("正在同步六条产品线余额…", "Syncing balances across six products…") : totalValue === null ? text("行情或汇率未同步，暂不显示总估值。", "Valuation is hidden until prices and FX are synchronized.") : text("估值只用于展示，账户余额以后台账本为准。", "Valuation is for display; backend ledger remains authoritative.")}</p>
          </div>
          <div className="asset-summary-stat"><strong>{allBalances.length}</strong><span>{text("资产记录", "Asset records")}</span></div>
        </UiCard>
        <section className="asset-product-grid" aria-label={text("产品线资产", "Product assets")}>
          {(Object.keys(productMeta) as ProductMode[]).map((product) => <ProductAssetCard key={product} product={product} balances={balancesByProduct[product]} productMeta={productMeta} language={language} valuationCurrency={valuationCurrency} valuationRates={valuationRates} valuationPrices={valuationPrices} balancesVisible={balancesVisible} onOpen={() => onOpenProduct(product)} />)}
        </section>
      </div>
      <aside className="asset-overview-side">
        <div className="asset-product-nav"><div><span className="asset-eyebrow">PRODUCT ACCOUNTS</span><h2>{text("产品线资产", "Product accounts")}</h2></div>{(Object.keys(productMeta) as ProductMode[]).map((product) => <button type="button" key={product} onClick={() => onOpenProduct(product)}><span>{language === "en-US" ? productMeta[product].shortLabelEn : productMeta[product].shortLabel}</span><small>{productMeta[product].accountType}</small><ArrowRight size={14} /></button>)}</div>
        <LedgerPreview language={language} entries={recentLedger} state={recentLedgerState} hasMore={recentLedgerHasMore} onOpenLedger={onOpenLedger} onRefresh={onRefresh} productMeta={productMeta} text={text} />
      </aside>
    </div>
    {balanceState === "error" && <p className="asset-center-alert" role="alert">{text("部分产品线余额暂不可用，页面不会用估算值填充。", "Some product balances are unavailable; the page will not fill estimated values.")}</p>}
    <SupportBubble language={language} onOpen={onHelp} />
  </section>;
}

function ProductAssetsPage({ product, balances, balanceState, language, productMeta, valuationCurrency, valuationRates, valuationRateState, valuationMarketState, valuationPrices, balancesVisible, onToggleBalances, onValuationCurrencyChange, onBack, onDeposit, onWithdraw, onTransfer, onHelp, onRefresh }: {
  product: ProductMode;
  balances: Balance[];
  balanceState: "idle" | "loading" | "ready" | "error";
  language: LanguageMode;
  productMeta: ProductAssetMeta;
  valuationCurrency: ValuationCurrency;
  valuationRates: Partial<Record<ValuationCurrency, number>>;
  valuationRateState: "idle" | "loading" | "ready" | "error";
  valuationMarketState: "idle" | "loading" | "ready" | "error";
  valuationPrices: Record<string, number>;
  balancesVisible: boolean;
  onToggleBalances: () => void;
  onValuationCurrencyChange: (currency: ValuationCurrency) => void;
  onBack: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: (asset?: string) => void;
  onHelp: () => void;
  onRefresh: () => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const meta = productMeta[product];
  const isSpot = product === "spot";
  return <section className="asset-page asset-center-page">
    <div className="asset-center-heading">
      <div>
        <UiButton variant="quiet" className="asset-back-button" type="button" onClick={onBack}><ArrowLeft size={15} />{text("返回资产总览", "Back to overview")}</UiButton>
        <span className="asset-eyebrow">{meta.labelEn.toUpperCase()}</span>
        <h1>{language === "en-US" ? meta.labelEn : meta.label}{text("资产", " assets")}</h1>
        <p>{text(`账户类型：${meta.accountType} · 产品线独立隔离`, `Account: ${meta.accountType} · isolated product context`)}</p>
      </div>
      <UiButton variant="secondary" className="asset-refresh-button" type="button" onClick={onRefresh}><RefreshCw size={15} />{text("刷新", "Refresh")}</UiButton>
    </div>
    <UiCard className="asset-summary-card asset-product-summary">
      <div>
        <div className="asset-label"><WalletCards size={15} />{text("账户权益", "Account equity")} <button className="asset-visibility-toggle" type="button" aria-pressed={!balancesVisible} aria-label={balancesVisible ? text("隐藏资产数字", "Hide balances") : text("显示资产数字", "Show balances")} onClick={onToggleBalances}>{balancesVisible ? <Eye size={15} /> : <EyeOff size={15} />}</button></div>
        <h2>{balancesVisible ? formatBalanceValuation(balances, valuationCurrency, valuationRates, valuationRateState, valuationMarketState, valuationPrices) : HIDDEN_BALANCE} <span><select className="asset-valuation-select" value={valuationCurrency} onChange={(event) => onValuationCurrencyChange(event.target.value as ValuationCurrency)} aria-label={text("估值货币", "Valuation currency")}><option value="USDT">USDT</option><option value="USD">USD</option><option value="CNY">CNY</option></select><ChevronDown size={13} /></span></h2>
        <p className="asset-login-note">{balanceState === "loading" ? text("正在同步该产品线余额…", "Syncing this product balance…") : text(`${balances.length} 个资产记录，余额按 ${meta.accountType} 账户返回。`, `${balances.length} asset records returned from ${meta.accountType}.`)}</p>
      </div>
      <div className="asset-actions">
        {isSpot && <><UiButton variant="primary" className="active" type="button" onClick={onDeposit}>{text("充值", "Deposit")}</UiButton><UiButton variant="secondary" type="button" onClick={onWithdraw}>{text("提现", "Withdraw")}</UiButton></>}
        <UiButton variant="secondary" type="button" onClick={() => onTransfer()}><Send size={14} />{text("划转", "Transfer")}</UiButton>
      </div>
    </UiCard>
    <section className="asset-holdings-card">
      <div className="asset-section-heading"><div><span className="asset-eyebrow">HOLDINGS</span><h2>{text("资产明细", "Asset details")}</h2></div><span className="asset-account-chip">{meta.accountType}</span></div>
      <AssetHoldingsTable balances={balances} language={language} valuationCurrency={valuationCurrency} valuationRates={valuationRates} valuationRateState={valuationRateState} valuationMarketState={valuationMarketState} valuationPrices={valuationPrices} balancesVisible={balancesVisible} onTransfer={onTransfer} />
      {balanceState === "error" && <p className="asset-center-alert" role="alert">{text("该产品线余额暂不可用，未显示估算数据。", "This product balance is unavailable; estimated data is hidden.")}</p>}
    </section>
    <SupportBubble language={language} onOpen={onHelp} />
  </section>;
}

function ProductAssetCard({ product, balances, productMeta, language, valuationCurrency, valuationRates, valuationPrices, balancesVisible, onOpen }: { product: ProductMode; balances: Balance[]; productMeta: ProductAssetMeta; language: LanguageMode; valuationCurrency: ValuationCurrency; valuationRates: Partial<Record<ValuationCurrency, number>>; valuationPrices: Record<string, number>; balancesVisible: boolean; onOpen: () => void }) {
  const meta = productMeta[product];
  const value = formatBalanceValuation(balances, valuationCurrency, valuationRates, "ready", "ready", valuationPrices);
  const text = (zh: string, en: string) => localized(language, zh, en);
  return <button className="asset-product-card" type="button" onClick={onOpen}>
    <span className="asset-product-card-top"><span className="asset-product-icon"><WalletCards size={17} /></span><ArrowUpRight size={16} /></span>
    <strong>{language === "en-US" ? meta.labelEn : meta.label}</strong><small>{meta.accountType}</small>
    <span className="asset-product-card-value">{balancesVisible ? value : HIDDEN_BALANCE}</span><span className="asset-product-card-meta">{balances.length} {text("项资产", "asset records")}</span>
  </button>;
}

function AssetHoldingsTable({ balances, language, valuationCurrency, valuationRates, valuationRateState, valuationMarketState, valuationPrices, balancesVisible, onTransfer }: { balances: Balance[]; language: LanguageMode; valuationCurrency: ValuationCurrency; valuationRates: Partial<Record<ValuationCurrency, number>>; valuationRateState: "idle" | "loading" | "ready" | "error"; valuationMarketState: "idle" | "loading" | "ready" | "error"; valuationPrices: Record<string, number>; balancesVisible: boolean; onTransfer: (asset?: string) => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [query, setQuery] = useState("");
  const rows = balances.filter((balance) => `${balance.asset} ${assetName(balance.asset)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <div className="asset-table-toolbar"><label className="asset-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("搜索币种", "Search assets")} aria-label={text("搜索币种", "Search assets")} /></label><span>{rows.length} / {balances.length}</span></div>
    <div className="asset-holdings-table">
      <div className="asset-holdings-row asset-holdings-head"><span>{text("资产", "Asset")}</span><span>{text("可用", "Available")}</span><span>{text("冻结", "Locked")}</span><span>{text("总额", "Total")}</span><span>{text("估值", "Valuation")}</span><span /></div>
      {rows.length === 0 ? <UiEmptyState title={text("暂无资产记录", "No asset records")} /> : rows.map((balance) => <div className="asset-holdings-row" key={`${balance.accountType ?? "account"}-${balance.asset}`}>
        <span className="asset-holding-name"><AssetIcon symbol={balance.asset} /><strong>{balance.asset}</strong><small>{assetName(balance.asset)}</small></span>
        <span>{balancesVisible ? displayUnits(balance.availableUnits, 8) : HIDDEN_BALANCE}</span><span>{balancesVisible ? displayUnits(balance.lockedUnits, 8) : HIDDEN_BALANCE}</span><strong>{balancesVisible ? displayUnits(balance.equityUnits, 8) : HIDDEN_BALANCE}</strong>
        <span>{balancesVisible ? formatSingleBalanceValuation(balance, valuationCurrency, valuationRates, valuationRateState, valuationMarketState, valuationPrices) : HIDDEN_BALANCE}</span>
        <UiButton variant="secondary" className="asset-row-transfer" type="button" onClick={() => onTransfer(balance.asset)}><Send size={13} />{text("划转", "Transfer")}</UiButton>
      </div>)}
    </div>
  </>;
}

function LedgerPreview({ language, entries, state, hasMore, onOpenLedger, onRefresh, productMeta, text }: { language: LanguageMode; entries: AccountLedgerEntry[]; state: "idle" | "loading" | "ready" | "error"; hasMore: boolean; onOpenLedger: () => void; onRefresh: () => void; productMeta: ProductAssetMeta; text: (zh: string, en: string) => string }) {
  return <aside className="recent-ledger-card asset-ledger-preview">
    <div className="ledger-title"><div><span className="asset-eyebrow">LEDGER</span><h2>{text("最近资金变化", "Recent funding changes")}</h2></div><UiButton variant="quiet" className="ledger-refresh-button" type="button" onClick={onRefresh} aria-label={text("刷新资金变化", "Refresh funding changes")}><RefreshCw size={15} /></UiButton></div>
    <p className="asset-login-note">{text("默认显示最近 10 条，完整记录支持按账户和产品线分页查看。", "Showing the latest 10 entries; full history is paginated by account and product line.")}</p>
    {state === "loading" ? <UiLoadingState label={text("正在加载资金变化…", "Loading funding changes…")} /> : state === "error" ? <UiEmptyState title={text("资金变化暂不可用", "Funding changes unavailable")} /> : entries.length === 0 ? <UiEmptyState icon={<FileText size={20} />} title={text("暂无资金变化", "No funding changes")} /> : <div className="asset-ledger-list">{entries.slice(0, 10).map((entry) => <div className="asset-ledger-item" key={entry.entryId}><span className={`asset-ledger-dot ${entry.amountUnits >= 0 ? "positive" : "negative"}`} /><div><strong>{ledgerReason(entry, language)}</strong><small>{entry.asset} · {formatLedgerTime(entry.createdAt, language)}</small></div><b className={entry.amountUnits >= 0 ? "up" : "down"}>{entry.amountUnits >= 0 ? "+" : ""}{displayUnits(entry.amountUnits, 8)}</b></div>)}</div>}
    {hasMore && <UiButton variant="quiet" className="asset-ledger-more" type="button" onClick={onOpenLedger}>{text("查看全部资金流水", "View full funding ledger")}<ArrowRight size={14} /></UiButton>}
  </aside>;
}

export function formatLedgerTime(value: string, language: LanguageMode): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(language === "en-US" ? "en-US" : "zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ledgerReason(entry: AccountLedgerEntry, language: LanguageMode): string {
  const value = entry.reason || entry.referenceType || "Ledger";
  if (language === "en-US") return value.replaceAll("充值", "Deposit").replaceAll("提现", "Withdrawal").replaceAll("划转", "Transfer");
  return value;
}

function formatBalanceValuation(balances: Balance[], currency: ValuationCurrency, rates: Partial<Record<ValuationCurrency, number>>, rateState: string, marketState: string, prices: Record<string, number>): string {
  if (!balances.length || rateState !== "ready" || marketState !== "ready") return "—";
  const rate = rates[currency];
  if (rate === undefined) return "—";
  const values = balances.map((balance) => {
    const price = assetValuationPrice(balance.asset, prices);
    return price === null ? null : unitsToNumber(balance.equityUnits) * price * rate;
  });
  return values.every((value) => value !== null) ? formatValuation(values.reduce((sum, value) => sum + (value ?? 0), 0), currency) : "—";
}

function formatSingleBalanceValuation(balance: Balance, currency: ValuationCurrency, rates: Partial<Record<ValuationCurrency, number>>, rateState: string, marketState: string, prices: Record<string, number>): string {
  if (rateState !== "ready" || marketState !== "ready" || rates[currency] === undefined) return "—";
  const price = assetValuationPrice(balance.asset, prices);
  return price === null ? "—" : formatValuation(unitsToNumber(balance.equityUnits) * price * (rates[currency] ?? 1), currency);
}

function assetValuationPrice(asset: string, prices: Record<string, number>): number | null {
  if (asset.toUpperCase() === "USDT") return 1;
  const price = prices[asset.toUpperCase()];
  return Number.isFinite(price) && price > 0 ? price : null;
}

function formatValuation(value: number, currency: ValuationCurrency): string {
  const amount = value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "CNY" ? `¥${amount}` : currency === "USD" ? `$${amount}` : `${amount} USDT`;
}

function unitsToNumber(units: number): number {
  return units / 100_000_000;
}
