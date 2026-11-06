import { t } from "../../i18n"
import "./Footer.css"

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-main-grid">
          {/* 品牌与技术愿景 */}
          <div className="footer-brand-column">
            <a href="/" className="footer-brand-header">
              <span className="footer-brand-logo">S</span>
              <span className="footer-brand-title">Surprising EX</span>
            </a>
            <p className="footer-brand-tagline">
              {t("Next-generation high-performance derivatives and digital assets trading platform.")}
            </p>
            <div className="footer-status-badge">
              <span className="footer-status-indicator" aria-hidden="true">
                <span className="footer-status-ping" />
                <span className="footer-status-dot" />
              </span>
              <span>{t("All Systems Operational")}</span>
              <span className="footer-latency-badge">&lt; 50μs</span>
            </div>
          </div>

          {/* 产品与交易 */}
          <div className="footer-links-column">
            <div className="footer-column-heading">{t("Products")}</div>
            <ul className="footer-nav-list">
              <li className="footer-nav-item">
                <a href="/markets">{t("Markets")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/trade/spot">{t("Spot Trading")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/trade/usd-perpetual">{t("USDT Perpetual")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/c2c">{t("C2C Trading")}</a>
              </li>
            </ul>
          </div>

          {/* 服务与生态 */}
          <div className="footer-links-column">
            <div className="footer-column-heading">{t("Support")}</div>
            <ul className="footer-nav-list">
              <li className="footer-nav-item">
                <a href="/announcements">{t("Announcements")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/help">{t("Help center")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/affiliate">{t("Affiliate Program")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/notifications">{t("Notifications")}</a>
              </li>
            </ul>
          </div>

          {/* 账户与资产 */}
          <div className="footer-links-column">
            <div className="footer-column-heading">{t("Account")}</div>
            <ul className="footer-nav-list">
              <li className="footer-nav-item">
                <a href="/assets">{t("Portfolio")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/assets/deposit">{t("Deposit & Withdraw")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/assets/ledger">{t("Financial Records")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/security">{t("Security Center")}</a>
              </li>
            </ul>
          </div>

          {/* 合规与开发 */}
          <div className="footer-links-column">
            <div className="footer-column-heading">{t("Legal")}</div>
            <ul className="footer-nav-list">
              <li className="footer-nav-item">
                <a href="/legal/user-agreement">{t("User Agreement")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/legal/privacy-policy">{t("Privacy Policy")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/legal/trading-risk">{t("Risk disclosures")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/compliance">{t("Compliance")}</a>
              </li>
              <li className="footer-nav-item">
                <a href="/developers">{t("API Docs")}</a>
              </li>
            </ul>
          </div>
        </div>

        {/* 底部版权与协议小字 */}
        <div className="footer-bottom-bar">
          <p className="footer-copyright">
            {t("© 2026 Surprising EX. All rights reserved.")}
          </p>
          <div className="footer-bottom-links">
            <span className="footer-engine-tag">Aeron Engine</span>
            <a href="/legal/user-agreement">{t("Terms")}</a>
            <a href="/legal/privacy-policy">{t("Privacy")}</a>
            <a href="/help">{t("Status")}</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
