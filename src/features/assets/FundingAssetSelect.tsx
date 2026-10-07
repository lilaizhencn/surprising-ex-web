import { ChevronDown } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type { FundingAsset } from "../../api/funding"
import { t } from "../../i18n"
import { assetLogos } from "../../lib/assetLogos"
import "./DepositPage.css"

export function FundingAssetSelect({
  assets,
  value,
  onChange,
}: {
  readonly assets: readonly FundingAsset[]
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  const selected = assets.find((row) => row.asset === value)
  const options = assets.filter((row) =>
    `${row.asset} ${row.displayName}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const outside = (event: PointerEvent | FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("focusin", outside)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("focusin", outside)
    }
  }, [open])
  const choose = (asset: string) => {
    onChange(asset)
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="funding-asset-select" ref={root}>
      <button
        type="button"
        ref={trigger}
        className="dropdown-select"
        role="combobox"
        aria-label={t("Asset")}
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setQuery("")
          setActive(0)
          setOpen(!open)
        }}
      >
        <span className="funding-asset-label">
          {selected ? (
            <>
              <FundingAssetIcon asset={selected} />
              {selected.asset}
              <small>{selected.displayName}</small>
            </>
          ) : (
            t("Select asset")
          )}
        </span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="funding-asset-menu">
          <input
            ref={search}
            type="search"
            aria-label={t("Search assets")}
            placeholder={t("Search assets")}
            value={query}
            aria-controls={id}
            aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                setOpen(false)
                trigger.current?.focus()
              }
              if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault()
                const next = options.length
                  ? (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
                    options.length
                  : 0
                setActive(next)
                document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: "nearest" })
              }
              if (event.key === "Enter") {
                event.preventDefault()
                const row = options[active]
                if (row) choose(row.asset)
              }
            }}
          />
          <div id={id} role="listbox" aria-label={t("Asset")} className="funding-asset-options">
            {options.map((row, index) => (
              <button
                key={row.asset}
                id={`${id}-${index}`}
                type="button"
                role="option"
                aria-selected={row.asset === value}
                className={index === active ? "active" : ""}
                onClick={() => choose(row.asset)}
              >
                <FundingAssetIcon asset={row} />
                <strong>{row.asset}</strong>
                <span>{row.displayName}</span>
              </button>
            ))}
          </div>
          {!options.length ? <p role="status">{t("No matching assets")}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
function FundingAssetIcon({ asset }: { readonly asset: FundingAsset }) {
  const url = asset.logoUrl || assetLogos[asset.asset]
  const [failed, setFailed] = useState("")
  return url && failed !== url ? (
    <img className="funding-asset-icon" src={url} alt="" onError={() => setFailed(url)} />
  ) : (
    <span className="funding-asset-icon funding-asset-initial" aria-hidden="true">
      {asset.asset.slice(0, 2)}
    </span>
  )
}
