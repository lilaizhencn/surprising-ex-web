import { setLocale, t, useLocale } from "../../i18n"
import { DropdownSelect } from "../ui/DropdownSelect"

export function LanguagePicker() {
  const locale = useLocale()
  return (
    <div className="language-picker">
      <DropdownSelect
        renderOption={(option) => (
          <>
            <span className="language-label-full">{option.label}</span>
            <span className="language-label-compact" aria-hidden="true">
              {option.value === "zh" ? "中文" : "EN"}
            </span>
          </>
        )}
        value={locale}
        aria-label={t("Language")}
        onChange={(event) => setLocale(event.target.value === "zh" ? "zh" : "en")}
      >
        <option value="en">🇺🇸 English</option>
        <option value="zh">🇨🇳 简体中文</option>
      </DropdownSelect>
    </div>
  )
}
