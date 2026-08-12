import { ArrowLeft, ChevronDown, FileText, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadAccountLedger, loadProductLedger } from "../api/surprising";
import { displayUnits } from "../config";
import { localized } from "../localized";
import type { LanguageMode } from "../localized";
import type { AccountLedgerEntry, AuthSession, LedgerPage, ProductAccountType, ProductLine, ProductMode } from "../types";
import { AssetIcon } from "./AssetPrimitives";
import { UiAlert, UiButton, UiCard, UiEmptyState, UiLoadingState } from "./UiPrimitives";
import type { ProductAssetMeta } from "./AssetCenter";
import { formatLedgerTime } from "./AssetCenter";

type LedgerFilter = "all" | ProductMode;

export function FundingLedgerPage({ session, language, productMeta, onBack }: { session: AuthSession | null; language: LanguageMode; productMeta: ProductAssetMeta; onBack: () => void }) {
  const text = (zh: string, en: string) => localized(language, zh, en);
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [page, setPage] = useState<LedgerPage<AccountLedgerEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRevision = useRef(0);

  useEffect(() => {
    const revision = ++requestRevision.current;
    if (!session) {
      setPage(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const load = filter === "all"
      ? loadAccountLedger(session, 50)
      : loadProductLedger(session, productMeta[filter].accountType, productMeta[filter].productLine, 50);
    void load.then((nextPage) => {
      if (!cancelled && requestRevision.current === revision) setPage(nextPage);
    }).catch((reason: unknown) => {
      if (!cancelled && requestRevision.current === revision) setError(reason instanceof Error ? reason.message : text("资金流水暂不可用", "Funding ledger is unavailable"));
    }).finally(() => {
      if (!cancelled && requestRevision.current === revision) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [filter, productMeta, reloadKey, session?.accessToken]);

  function loadMore() {
    if (!session || !page?.nextCursor || loading) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    const load = filter === "all"
      ? loadAccountLedger(session, 50, page.nextCursor)
      : loadProductLedger(session, productMeta[filter].accountType, productMeta[filter].productLine, 50, page.nextCursor);
    void load.then((nextPage) => {
      if (requestRevision.current === revision) {
        setPage((current) => current ? { ...nextPage, entries: [...current.entries, ...nextPage.entries] } : nextPage);
      }
    }).catch((reason: unknown) => {
      if (requestRevision.current === revision) setError(reason instanceof Error ? reason.message : text("加载更多流水失败", "Failed to load more ledger entries"));
    }).finally(() => {
      if (requestRevision.current === revision) setLoading(false);
    });
  }

  const entries = useMemo(() => page?.entries ?? [], [page?.entries]);
  return <section className="asset-page funding-ledger-page">
    <div className="ledger-page-heading">
      <div><UiButton variant="quiet" className="asset-back-button" type="button" onClick={onBack}><ArrowLeft size={15} />{text("返回资产总览", "Back to overview")}</UiButton><span className="asset-eyebrow">FUNDING LEDGER</span><h1>{text("资金流水", "Funding ledger")}</h1><p>{text("查看账户总资金变化，或按产品线账户隔离查询。", "Review account-wide funding changes or isolate a product account.")}</p></div><UiButton variant="secondary" className="asset-refresh-button" type="button" onClick={() => setReloadKey((current) => current + 1)}><RefreshCw size={15} />{text("刷新", "Refresh")}</UiButton>
    </div>
    <div className="ledger-filter-bar"><label>{text("流水范围", "Ledger scope")}<select value={filter} onChange={(event) => { setFilter(event.target.value as LedgerFilter); setPage(null); }}><option value="all">{text("全部账户", "All accounts")}</option>{(Object.keys(productMeta) as ProductMode[]).map((product) => <option value={product} key={product}>{language === "en-US" ? productMeta[product].labelEn : productMeta[product].label} · {productMeta[product].accountType}</option>)}</select><ChevronDown size={14} /></label><span>{page ? `${entries.length}${page.hasMore ? "+" : ""} ${text("条", "entries")}` : "—"}</span></div>
    <UiCard className="ledger-table-card">
      {loading && <UiLoadingState label={text("正在同步资金流水…", "Syncing funding ledger…")} />}
      {!session ? <UiEmptyState icon={<FileText size={20} />} title={text("登录后查看资金流水", "Log in to view funding ledger")} /> : error ? <UiAlert tone="error">{error}</UiAlert> : entries.length === 0 && !loading ? <UiEmptyState icon={<FileText size={20} />} title={text("暂无资金流水", "No funding ledger entries")} /> : <div className="funding-ledger-table"><div className="funding-ledger-row funding-ledger-head"><span>{text("时间", "Time")}</span><span>{text("账户", "Account")}</span><span>{text("资产", "Asset")}</span><span>{text("变化", "Change")}</span><span>{text("余额", "Balance")}</span><span>{text("原因", "Reason")}</span></div>{entries.map((entry) => <LedgerRow entry={entry} language={language} productMeta={productMeta} key={entry.entryId} />)}</div>}
      {page?.hasMore && <div className="ledger-load-more"><UiButton variant="secondary" busy={loading} type="button" onClick={loadMore}>{text("加载更多", "Load more")}</UiButton></div>}
    </UiCard>
  </section>;
}

function LedgerRow({ entry, language, productMeta }: { entry: AccountLedgerEntry; language: LanguageMode; productMeta: ProductAssetMeta }) {
  const accountType = "accountType" in entry ? String((entry as AccountLedgerEntry & { accountType?: ProductAccountType }).accountType) : "SPOT";
  const product = (Object.keys(productMeta) as ProductMode[]).find((mode) => productMeta[mode].accountType === accountType);
  const reason = language === "en-US" ? (entry.reason || entry.referenceType).replaceAll("充值", "Deposit").replaceAll("提现", "Withdrawal").replaceAll("划转", "Transfer") : entry.reason || entry.referenceType;
  return <div className="funding-ledger-row"><span>{formatLedgerTime(entry.createdAt, language)}</span><span>{product ? (language === "en-US" ? productMeta[product].shortLabelEn : productMeta[product].shortLabel) : accountType}</span><span className="ledger-asset"><AssetIcon symbol={entry.asset} />{entry.asset}</span><strong className={entry.amountUnits >= 0 ? "up" : "down"}>{entry.amountUnits >= 0 ? "+" : ""}{displayUnits(entry.amountUnits, 8)}</strong><span>{displayUnits(entry.balanceAfterUnits, 8)}</span><span title={entry.referenceId}>{reason || "—"}</span></div>;
}
