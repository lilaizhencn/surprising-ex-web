import { t } from "../../i18n"
export function pageProductLine() {
  const key = window.location.pathname.replace(/^\/trade\//, "")
  return (
    (
      {
        spot: "SPOT",
        "usd-perpetual": "LINEAR_PERPETUAL",
        "usd-m-perpetuals": "LINEAR_PERPETUAL",
        "coin-perpetual": "INVERSE_PERPETUAL",
        "coin-m-perpetuals": "INVERSE_PERPETUAL",
        "delivery-futures": "LINEAR_DELIVERY",
        "coin-m-delivery": "INVERSE_DELIVERY",
        options: "OPTION",
      } as Record<string, string>
    )[key] ?? "ALL"
  )
}
export function announcementCategory(value: string) {
  return (
    (
      {
        GENERAL: "General",
        PRODUCT: "Product update",
        MAINTENANCE: "Maintenance",
        SECURITY: "Security",
        RISK: "Risk notice",
      } as Record<string, string>
    )[value] ?? "Announcement"
  )
}
export function announcementDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value
}
export function contentError(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : t("Announcement service unavailable. Please retry later.")
}
