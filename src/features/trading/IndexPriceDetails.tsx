import { Info, X } from "lucide-react"
import { useId } from "react"
import { t } from "../../i18n"
import { formatPrice } from "../../lib/format"
import { record, rows } from "../../realtime"

export function IndexPriceDetails({
  index,
  precision,
}: {
  readonly index: Readonly<Record<string, unknown>> | null
  readonly precision: number
}) {
  const id = useId()
  const components = rows(index?.["components"])
  return (
    <>
      <button
        type="button"
        className="index-info-trigger"
        popoverTarget={id}
        aria-label={t("How the index price is calculated")}
        aria-haspopup="dialog"
      >
        <Info size={13} />
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        className="index-price-popover"
      >
        <div className="index-price-popover-heading">
          <h3 id={`${id}-title`}>{t("How the index price is calculated")}</h3>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label={t("Close")}
          >
            <X size={16} />
          </button>
        </div>
        <p>
          {t(
            "The index combines spot quotes from configured sources. It is not the latest trade price of this contract.",
          )}
        </p>
        <ol>
          <li>{t("Discard expired or unavailable quotes.")}</li>
          <li>
            {t("Compare quotes with the median and exclude those outside the allowed deviation.")}
          </li>
          <li>
            {t(
              "Normalize the weights of valid sources, then sum each price multiplied by its effective weight.",
            )}
          </li>
        </ol>
        <p className="index-price-formula">
          {t("Index price = Σ (valid source price × effective weight)")}
        </p>
        <p>
          {t(
            "If too few sources remain, the index is unavailable; it is not replaced by an old quote.",
          )}
        </p>
        <div className="index-price-components">
          <table>
            <thead>
              <tr>
                <th>{t("Source")}</th>
                <th>{t("Price")}</th>
                <th>{t("Weight")}</th>
                <th>{t("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component, i) => {
                const value = record(component)
                return (
                  <tr key={`${String(value["source"])}-${i}`}>
                    <td>{String(value["source"] ?? "—")}</td>
                    <td className="mono">
                      {value["price"] == null
                        ? "—"
                        : formatPrice(Number(value["price"]), precision)}
                    </td>
                    <td className="mono">
                      {value["effectiveWeight"] == null
                        ? "—"
                        : `${(Number(value["effectiveWeight"]) * 100).toFixed(2)}%`}
                    </td>
                    <td title={String(value["reason"] ?? "")}>
                      {t(String(value["status"] ?? "Unavailable"))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {components.length === 0 && <p>{t("Index components are currently unavailable.")}</p>}
        <small>
          {t("Updated")}:{" "}
          {index?.["eventTime"] ? new Date(String(index["eventTime"])).toLocaleTimeString() : "—"}
        </small>
      </div>
    </>
  )
}
