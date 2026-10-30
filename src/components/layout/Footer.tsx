import { t } from "../../i18n"
export function Footer() {
  return (
    <footer className="footer">
      <div>
        <strong>Surprising EX</strong>
        <p>{t("© 2026 Surprising EX. All rights reserved.")}</p>
      </div>
      <div>
        <strong>{t("Products")}</strong>
        <a href="/markets">{t("Markets")}</a>
        <a href="/trade/spot">{t("Trade")}</a>
      </div>
      <div>
        <strong>{t("Support")}</strong>
        <a href="/announcements">{t("Announcements")}</a>
        <a href="/help">{t("Help center")}</a>
      </div>
      <div>
        <strong>{t("Legal")}</strong>
        <a href="/legal/user-agreement">{t("User Agreement")}</a>
        <a href="/legal/privacy-policy">{t("Privacy Policy")}</a>
        <a href="/legal/trading-risk">{t("Risk disclosures")}</a>
        <a href="/legal">{t("Legal center")}</a>
      </div>
    </footer>
  )
}
