import { useEffect, useState } from "react"
import {
  evaluateMyVip,
  loadMyVipStatus,
  loadVipLevels,
  type UserVipStatus,
  type VipTierDefinition,
} from "../../api/endpoints"
import { useSession } from "../../state/session"
import { t } from "../../i18n"
import "./VipTierPage.css"

export function VipTierPage() {
  const session = useSession()
  const [levels, setLevels] = useState<readonly VipTierDefinition[]>([])
  const [myStatus, setMyStatus] = useState<UserVipStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [levelsData, statusData] = await Promise.all([
        loadVipLevels().catch(() => []),
        session ? loadMyVipStatus().catch(() => null) : Promise.resolve(null),
      ])
      setLevels(levelsData)
      setMyStatus(statusData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [session?.user.userId])

  const handleEvaluate = async () => {
    if (!session) return
    setEvaluating(true)
    setNotice(null)
    try {
      const updated = await evaluateMyVip()
      setMyStatus(updated)
      setNotice(t("VIP tier evaluated and updated successfully!"))
    } catch {
      setNotice(t("Failed to evaluate VIP tier."))
    } finally {
      setEvaluating(false)
    }
  }

  const formatFeeRate = (ppm: number) => {
    const pct = (ppm / 10000).toFixed(4)
    if (ppm < 0) return `${pct}% (${t("Rebate")})`
    return `${pct}%`
  }

  const formatUsd = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="container vip-page-container">
      <div className="vip-header-card">
        <div className="vip-header-content">
          <span className="vip-eyebrow">{t("Surprising EX VIP Program")}</span>
          <h1 className="vip-title">{t("VIP Tier & Trading Fee Benefits")}</h1>
          <p className="vip-subtitle">
            {t(
              "Enjoy dynamic fee discounts and market maker rebates based on your 30-day rolling trading volume.",
            )}
          </p>
        </div>

        {session && myStatus && (
          <div className="my-vip-card">
            <div className="my-vip-badge-row">
              <span className="current-level-badge">{myStatus.currentTierCode}</span>
              <button
                type="button"
                className="evaluate-btn"
                disabled={evaluating}
                onClick={() => void handleEvaluate()}
              >
                {evaluating ? t("Evaluating...") : t("Refresh Tier")}
              </button>
            </div>

            <div className="my-rates-grid">
              <div className="rate-item">
                <span className="rate-label">{t("Maker Fee")}</span>
                <span className="rate-value highlight">
                  {formatFeeRate(myStatus.makerFeeRatePpm)}
                </span>
              </div>
              <div className="rate-item">
                <span className="rate-label">{t("Taker Fee")}</span>
                <span className="rate-value">{formatFeeRate(myStatus.takerFeeRatePpm)}</span>
              </div>
            </div>

            <div className="vip-progress-section">
              <div className="progress-labels">
                <span>
                  {t("30D Volume")}: {formatUsd(myStatus.rolling30DayVolumeUsd)}
                </span>
                <span>
                  {myStatus.nextTierMinVolumeUsd > 0
                    ? `${t("Next Tier")}: ${formatUsd(myStatus.nextTierMinVolumeUsd)}`
                    : t("Max Tier Reached")}
                </span>
              </div>
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${
                      myStatus.nextTierMinVolumeUsd > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (myStatus.rolling30DayVolumeUsd / myStatus.nextTierMinVolumeUsd) *
                                100,
                            ),
                          )
                        : 100
                    }%`,
                  }}
                />
              </div>
              {myStatus.volumeNeededForNextTier > 0 && (
                <div className="progress-hint">
                  {t("Trade another")} {formatUsd(myStatus.volumeNeededForNextTier)}{" "}
                  {t("in the next 30 days to level up.")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {notice && <div className="vip-notice-banner">{notice}</div>}

      <div className="vip-table-card">
        <h2 className="table-title">{t("VIP Tier Schedule")}</h2>
        <div className="vip-table-wrapper">
          <table className="vip-table">
            <thead>
              <tr>
                <th>{t("Tier")}</th>
                <th>{t("30-Day Volume (USD)")}</th>
                <th>{t("Maker Fee")}</th>
                <th>{t("Taker Fee")}</th>
                <th>{t("Privileges")}</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((lvl) => {
                const isCurrent = myStatus?.currentTierLevel === lvl.tierLevel
                return (
                  <tr key={lvl.tierLevel} className={isCurrent ? "current-tier-row" : ""}>
                    <td className="tier-code-cell">
                      <span className="tier-tag">{lvl.tierCode}</span>
                      {isCurrent && <span className="current-indicator">{t("Current")}</span>}
                    </td>
                    <td>≥ {formatUsd(lvl.min30DayVolumeUsd)}</td>
                    <td className={lvl.makerFeeRatePpm < 0 ? "negative-fee" : ""}>
                      {formatFeeRate(lvl.makerFeeRatePpm)}
                    </td>
                    <td>{formatFeeRate(lvl.takerFeeRatePpm)}</td>
                    <td>
                      {lvl.makerFeeRatePpm < 0
                        ? t("Market Maker Negative Fee Rebate (-50 ppm)")
                        : lvl.tierLevel >= 5
                          ? t("Priority WebSocket Channels & Institutional Colocation")
                          : t("Standard API & Realtime Streaming")}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
