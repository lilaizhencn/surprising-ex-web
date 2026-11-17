import { languageMeta, setLocale, t, useLanguageLoad, useLocale } from "../../i18n"
import { LOCALES, normalizeLocale } from "../../i18n/locales"
import { DropdownSelect } from "../ui/DropdownSelect"

export function LanguagePicker() {
  const locale = useLocale(),
    loading = useLanguageLoad()
  return (
    <div className="language-picker">
      <DropdownSelect
        value={locale}
        disabled={loading?.status === "loading"}
        minMenuWidth={156}
        maxMenuWidth={200}
        aria-label={t("Language")}
        renderOption={(option) => {
          const meta = languageMeta(normalizeLocale(option.value))
          return (
            <span className="language-option-inner">
              <span className="language-flag" aria-hidden="true">
                {meta.flag}
              </span>
              <span className="language-label-full">{option.label}</span>
              <span className="language-label-compact" aria-hidden="true">
                {meta.compact}
              </span>
            </span>
          )
        }}
        onChange={(event) => {
          void setLocale(normalizeLocale(event.target.value)).catch(() => {})
        }}
      >
        {LOCALES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </DropdownSelect>
      {loading?.status === "loading" && (
        <span className="sr-only" role="status">
          {t("Loading…")}
        </span>
      )}
      {loading?.status === "error" && (
        <div className="language-load-error" role="alert">
          <span>
            {languageMeta(loading.target).label}: {t("Please retry.")}
          </span>
          <button
            type="button"
            onClick={() => {
              void setLocale(loading.target).catch(() => {})
            }}
          >
            {t("Retry")}
          </button>
        </div>
      )}
    </div>
  )
}
