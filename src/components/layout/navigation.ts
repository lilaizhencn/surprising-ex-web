import type { ProductLine } from "../../types/domain"

export const publicNavigation = [
  { label: "Markets", href: "/markets" },
  { label: "Spot", href: "/trade/spot" },
  {
    label: "Perpetuals",
    href: "/trade/usd-perpetual",
    menu: [
      { label: "USD-M", href: "/trade/usd-perpetual" },
      { label: "Coin-M", href: "/trade/coin-perpetual" },
    ],
  },
  {
    label: "Futures",
    href: "/trade/delivery-futures",
    menu: [
      { label: "USD-M", href: "/trade/delivery-futures" },
      { label: "Coin-M", href: "/trade/coin-m-delivery" },
    ],
  },
  { label: "Options", href: "/trade/options" },
  { label: "Assets", href: "/assets" },
] as const

export const assetNavigation = [
  { label: "Spot", href: "/assets?account=spot" },
  { label: "USD-M Perpetual", href: "/assets?account=usd-perpetual" },
  { label: "Coin-M Perpetual", href: "/assets?account=coin-perpetual" },
  { label: "USD-M Delivery", href: "/assets?account=usd-delivery" },
  { label: "Coin-M Delivery", href: "/assets?account=coin-delivery" },
  { label: "Options", href: "/assets?account=options" },
  { label: "Ledger", href: "/assets/ledger" },
  { label: "Orders", href: "/orders" },
] as const

export const securityNavigation = [
  { label: "Account security", href: "/security/account" },
  { label: "Device management", href: "/security/devices" },
] as const

export const productLineLabels: Readonly<Record<ProductLine, string>> = {
  SPOT: "Spot",
  LINEAR_PERPETUAL: "USD-M Perpetual",
  INVERSE_PERPETUAL: "Coin-M Perpetual",
  LINEAR_DELIVERY: "USD-M Delivery",
  INVERSE_DELIVERY: "Coin-M Delivery",
  OPTION: "Options",
}
