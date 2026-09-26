import { setLocale, t, useLocale } from "../../i18n"
import { DropdownSelect } from "../ui/DropdownSelect"

export function LanguagePicker() {
  const locale = useLocale()
  return (
    <div className="language-picker">
      <DropdownSelect
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
