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
        <a href="/notifications">{t("Announcements")}</a>
        <a href="/help">{t("Help center")}</a>
      </div>
    </footer>
  )
}
