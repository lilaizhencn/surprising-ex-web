import { DayPicker } from "@daypicker/react"
import { enUS, zhCN } from "@daypicker/react/locale"
import { CalendarDays } from "lucide-react"
import { useId, useRef, useState } from "react"
import { DropdownSelect } from "../../components/ui/DropdownSelect"
import { t, useLocale } from "../../i18n"
import "@daypicker/react/style.css"

const parse = (value: string) => new Date(`${value}T12:00:00`)
const format = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

/** Inline calendar keeps the date field visible and avoids clipped popovers on mobile. */
export function KycDatePicker({
  value,
  onChange,
  min,
  max,
  label,
}: Readonly<{
  value: string
  onChange: (value: string) => void
  min: string
  max?: string
  label: string
}>) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => parse(value || max || min))
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const first = parse(min)
  const last = max ? parse(max) : new Date(first.getFullYear() + 30, 11, 31)
  return (
    <div className="kyc-date-picker">
      <button
        ref={trigger}
        type="button"
        className="dropdown-select"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setMonth(parse(value || max || min))
          setOpen(!open)
        }}
      >
        <span>{value || t("Select a date")}</span>
        <CalendarDays size={17} />
      </button>
      {open ? (
        <fieldset
          id={id}
          aria-label={label}
          className="kyc-calendar"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false)
              trigger.current?.focus()
            }
          }}
        >
          <div className="kyc-calendar-navigation">
            <DropdownSelect
              aria-label={t("Year")}
              value={month.getFullYear()}
              onChange={(event) =>
                setMonth(new Date(Number(event.target.value), month.getMonth(), 1))
              }
            >
              {Array.from(
                { length: last.getFullYear() - first.getFullYear() + 1 },
                (_, index) => first.getFullYear() + index,
              ).map((year) => (
                <option key={year} value={year}>
                  {String(year)}
                </option>
              ))}
            </DropdownSelect>
            <DropdownSelect
              aria-label={t("Month")}
              value={month.getMonth()}
              onChange={(event) =>
                setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))
              }
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index}>
                  {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
                    month: "long",
                  }).format(new Date(2026, index, 1))}
                </option>
              ))}
            </DropdownSelect>
          </div>
          <DayPicker
            mode="single"
            locale={locale === "zh" ? zhCN : enUS}
            selected={value ? parse(value) : undefined}
            month={month}
            onMonthChange={setMonth}
            startMonth={first}
            endMonth={last}
            hideNavigation
            disabled={[{ before: first }, ...(max ? [{ after: last }] : [])]}
            onSelect={(date) => {
              if (date) {
                onChange(format(date))
                setOpen(false)
                trigger.current?.focus()
              }
            }}
          />
        </fieldset>
      ) : null}
    </div>
  )
}
