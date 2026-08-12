import { RefreshCw, Search, Star, TrendingUp, Volume2, WifiOff } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { compact, displayPpm, displayPrice } from "../config";
import { localized } from "../localized";
import type { LanguageMode } from "../localized";
import { marketFavoriteKey, marketProductForPresentation, marketTickerIsReady } from "../marketPresentation";
import { priceFromTicks } from "../valuation";
import type { Market, ProductMode } from "../types";
import type { ProductAssetMeta } from "./AssetCenter";
import { UiButton, UiCard, UiEmptyState, UiErrorState, UiLoadingState, UiStatusBadge } from "./UiPrimitives";

type MarketFilter = "all" | ProductMode;
export type MarketCenterState = "loading" | "ready" | "degraded" | "error";

const FAVORITES_KEY = "surprising-ex.market-favorites";

export function MarketsPage({ markets, marketState, language, productMeta, onRefresh, onOpenMarket }: {
  markets: Market[];
  marketState: MarketCenterState;
  language: LanguageMode;
  productMeta: ProductAssetMeta;
  onRefresh: () => void;
  onOpenMarket: (market: Market) => void;
}) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [filter, setFilter] = useState<MarketFilter>("all");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const visibleMarkets = markets.filter((market) => {
    const matchesProduct = filter === "all" || marketProductForPresentation(market) === filter;
    const normalizedQuery = query.trim().toUpperCase();
    return matchesProduct && (!normalizedQuery || `${market.symbol} ${market.displayName}`.toUpperCase().includes(normalizedQuery));
  });
  const tickerMarkets = visibleMarkets.filter(marketTickerIsReady);
  const gainers = [...tickerMarkets].sort((left, right) => right.change24hPpm - left.change24hPpm).slice(0, 3);
  const volumeLeaders = [...tickerMarkets].sort((left, right) => right.volume24hUnits - left.volume24hUnits).slice(0, 3);
  const risingCount = tickerMarkets.filter((market) => market.change24hPpm >= 0).length;
  const totalVolume = tickerMarkets.reduce((total, market) => total + market.volume24hUnits, 0);

  function toggleFavorite(market: Market) {
    const key = marketFavoriteKey(market);
    setFavorites((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  }

  return (
    <section className="markets-page">
      <header className="markets-heading">
        <div>
          <span className="asset-eyebrow">MARKET CENTER</span>
          <h1>{text("行情中心", "Market center")}</h1>
          <p>{text("用真实 instrument 与行情数据比较市场，选择交易对后进入对应产品线工作台。", "Compare live instrument and market data, then open a pair in its isolated product workspace.")}</p>
        </div>
        <UiButton variant="secondary" type="button" onClick={onRefresh}><RefreshCw size={15} />{text("刷新行情", "Refresh markets")}</UiButton>
      </header>

      <div className="markets-toolbar">
        <label className="markets-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text("搜索币对或产品", "Search pairs or products")} aria-label={text("搜索币对或产品", "Search pairs or products")} /></label>
        <div className="markets-filters" role="group" aria-label={text("产品线筛选", "Product filters")}>
          <button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{text("全部", "All")}</button>
          {(Object.keys(productMeta) as ProductMode[]).map((product) => <button type="button" aria-pressed={filter === product} className={filter === product ? "active" : ""} key={product} onClick={() => setFilter(product)}>{language === "en-US" ? productMeta[product].shortLabelEn : productMeta[product].shortLabel}</button>)}
        </div>
      </div>

      {marketState === "loading" && markets.length === 0 ? <UiLoadingState label={text("正在同步市场…", "Syncing markets…")} /> : marketState === "error" && markets.length === 0 ? <UiErrorState title={text("行情服务暂不可用", "Market service unavailable")} description={text("未收到真实市场数据，页面不会用演示数据填充。", "No live market data was received; demo data is not shown.")} action={<UiButton variant="secondary" type="button" onClick={onRefresh}>{text("重新加载", "Retry")}</UiButton>} /> : (
        <>
          {marketState === "loading" && <div className="markets-sync-note" role="status">{text("正在同步最新行情，当前列表保持可用。", "Syncing the latest ticker; the current list remains available.")}</div>}
          {marketState === "error" && markets.length > 0 && <div className="markets-sync-note error" role="alert">{text("行情同步失败，以下为最近一次可用列表。", "Ticker sync failed; showing the last available market list.")}</div>}
          <div className="markets-stats">
            <UiCard><span>{text("可交易市场", "Tradable markets")}</span><strong>{visibleMarkets.length}</strong><small>{filter === "all" ? text("全部产品线", "All products") : productMeta[filter].shortLabel}</small></UiCard>
            <UiCard><span>{text("上涨市场", "Rising markets")}</span><strong className="market-stat-positive">{risingCount}</strong><small>{tickerMarkets.length ? `${Math.round((risingCount / tickerMarkets.length) * 100)}% ${text("占已同步行情", "of synced tickers")}` : text("等待行情快照", "Waiting for ticker snapshot")}</small></UiCard>
            <UiCard><span>{text("24H成交额", "24H volume")}</span><strong>{tickerMarkets.length ? compact(totalVolume) : "—"}</strong><small>{text("按后端返回计价", "As returned by gateway")}</small></UiCard>
          </div>

          {visibleMarkets.length === 0 ? <UiEmptyState icon={<Search size={20} />} title={text("没有匹配的市场", "No matching markets")} description={text("尝试清除搜索词或切换产品线。", "Clear the search or choose another product line.")} /> : (
            <>
              <div className="markets-leaderboards">
                <Leaderboard title={text("涨跌榜", "Change leaders")} icon={<TrendingUp size={16} />} markets={gainers} language={language} productMeta={productMeta} favorites={favorites} onFavorite={toggleFavorite} onOpen={onOpenMarket} value="change" />
                <Leaderboard title={text("成交额榜", "Volume leaders")} icon={<Volume2 size={16} />} markets={volumeLeaders} language={language} productMeta={productMeta} favorites={favorites} onFavorite={toggleFavorite} onOpen={onOpenMarket} value="volume" />
              </div>
              <UiCard className="markets-table-card">
                <div className="markets-table-heading"><div><span className="asset-eyebrow">MARKET SNAPSHOT</span><h2>{text("全部市场", "All markets")}</h2></div><UiStatusBadge tone={marketState === "degraded" || tickerMarkets.length === 0 ? "warning" : "positive"}>{marketState === "degraded" ? text("数据降级", "Degraded") : tickerMarkets.length === 0 ? text("等待行情", "Waiting for ticker") : text("实时数据", "Live data")}</UiStatusBadge></div>
                <div className="markets-table" role="table" aria-label={text("市场列表", "Market list")}>
                  <div className="markets-table-row markets-table-head" role="row"><span>{text("市场", "Market")}</span><span>{text("最新价", "Last")}</span><span>{text("24H变化", "24H change")}</span><span>{text("24H成交额", "24H volume")}</span><span>{text("状态", "Status")}</span><span /></div>
                  {visibleMarkets.map((market) => <MarketRow key={marketFavoriteKey(market)} market={market} language={language} productMeta={productMeta} favorite={favorites.includes(marketFavoriteKey(market))} onFavorite={toggleFavorite} onOpen={onOpenMarket} />)}
                </div>
              </UiCard>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Leaderboard({ title, icon, markets, language, productMeta, favorites, onFavorite, onOpen, value }: { title: string; icon: ReactNode; markets: Market[]; language: LanguageMode; productMeta: ProductAssetMeta; favorites: string[]; onFavorite: (market: Market) => void; onOpen: (market: Market) => void; value: "change" | "volume" }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  return <UiCard className="market-leaderboard"><h2>{icon}{title}</h2>{markets.map((market) => <MarketRow compact key={`${value}-${marketFavoriteKey(market)}`} market={market} language={language} productMeta={productMeta} favorite={favorites.includes(marketFavoriteKey(market))} onFavorite={onFavorite} onOpen={onOpen} metric={value} />)}{markets.length === 0 && <UiEmptyState title={text("暂无数据", "No data")} />}</UiCard>;
}

function MarketRow({ market, language, productMeta, favorite, compact: compactRow = false, onFavorite, onOpen, metric = "change" }: { market: Market; language: LanguageMode; productMeta: ProductAssetMeta; favorite: boolean; compact?: boolean; onFavorite: (market: Market) => void; onOpen: (market: Market) => void; metric?: "change" | "volume" }) {
  const product = marketProductForPresentation(market);
  const changeIsPositive = market.change24hPpm >= 0;
  const productName = language === "en-US" ? productMeta[product].shortLabelEn : productMeta[product].shortLabel;
  const tickerReady = marketTickerIsReady(market);
  const tickerLabel = tickerReady ? (language === "en-US" ? "Trading" : "交易中") : (language === "en-US" ? "Waiting for ticker" : "等待行情");
  const compactMetric = metric === "volume" ? (tickerReady ? compact(market.volume24hUnits) : "—") : (tickerReady ? `${changeIsPositive ? "+" : ""}${displayPpm(market.change24hPpm)}` : "—");
  return <article className={`market-data-row${compactRow ? " compact" : ""}`}>
    <button className="market-data-main" type="button" onClick={() => onOpen(market)}>
      <strong>{market.symbol}</strong><small>{productName} · {market.quoteAsset}</small>
    </button>
    <strong className="market-data-price">{displayMarketPrice(market)}</strong>
    <strong className={metric === "volume" ? "market-data-volume-compact" : tickerReady ? (changeIsPositive ? "market-positive" : "market-negative") : "market-data-muted"}>{compactRow ? compactMetric : tickerReady ? `${changeIsPositive ? "+" : ""}${displayPpm(market.change24hPpm)}` : "—"}</strong>
    <span className="market-data-volume">{tickerReady ? compact(market.volume24hUnits) : "—"}</span>
    {!compactRow && <UiStatusBadge tone={tickerReady && market.status === "TRADING" ? "positive" : "warning"}>{market.status === "TRADING" ? tickerLabel : market.status ?? "—"}</UiStatusBadge>}
    <button className="market-favorite" type="button" aria-label={favorite ? `${market.symbol} ${language === "en-US" ? "remove favorite" : "取消收藏"}` : `${market.symbol} ${language === "en-US" ? "add favorite" : "加入自选"}`} aria-pressed={favorite} onClick={() => onFavorite(market)}><Star size={15} fill={favorite ? "currentColor" : "none"} /></button>
  </article>;
}

function displayMarketPrice(market: Market): string {
  return marketTickerIsReady(market) ? displayPrice(priceFromTicks(market, market.lastPriceTicks)) : "—";
}

function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
