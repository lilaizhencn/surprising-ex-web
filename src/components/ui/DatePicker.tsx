import { DayPicker } from "@daypicker/react"
import { arSA, de, enUS, es, fr, hi, ja, ko, ptBR, ru, zhCN, zhTW } from "@daypicker/react/locale"
import { CalendarDays } from "lucide-react"
import { type CSSProperties, useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { t, useLocale } from "../../i18n"
import { contentLocale } from "../../i18n/locales"
import { DropdownSelect } from "./DropdownSelect"
import "@daypicker/react/style.css"
import "./DatePicker.css"

const calendarLocales = {
  en: enUS,
  zh: zhCN,
  "zh-TW": zhTW,
  es,
  fr,
  de,
  pt: ptBR,
  ru,
  ar: arSA,
  ja,
  ko,
  hi,
}

const parse = (value: string) => new Date(`${value}T12:00:00`)
const format = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

/** Floating calendar overlays nearby fields without changing the form layout. */
export function DatePicker({
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
  const calendar = useRef<HTMLFieldSetElement>(null)
  const id = useId()
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" })
  const first = parse(min)
  const last = max ? parse(max) : new Date(first.getFullYear() + 30, 11, 31)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const box = trigger.current?.getBoundingClientRect()
      if (!box) return
      const above = Math.max(0, box.top - 8)
      const below = Math.max(0, window.innerHeight - box.bottom - 8)
      const showAbove = above > below
      const width = Math.min(340, window.innerWidth - 16)
      setPosition({
        position: "fixed",
        top: showAbove ? undefined : box.bottom + 8,
        bottom: showAbove ? window.innerHeight - box.top + 8 : undefined,
        left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.max(120, Math.min(420, (showAbove ? above : below) - 8)),
        overflowY: "auto",
        boxSizing: "border-box",
      })
    }
    const closeOutside = (event: PointerEvent) => {
      if ((event.target as Element).closest?.(".dropdown-select-menu")) return
      if (
        !trigger.current?.contains(event.target as Node) &&
        !calendar.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    document.addEventListener("pointerdown", closeOutside)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      document.removeEventListener("pointerdown", closeOutside)
    }
  }, [open])

  return (
    <div className="date-picker">
      <button
        ref={trigger}
        type="button"
        className="dropdown-select"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setMonth(parse(value || max || min))
          setOpen((current) => !current)
        }}
      >
        <span>{value || t("Select a date")}</span>
        <CalendarDays size={17} />
      </button>
      {open
        ? createPortal(
            <fieldset
              ref={calendar}
              id={id}
              aria-label={label}
              className="date-picker-calendar"
              style={position}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false)
                  trigger.current?.focus()
                }
              }}
            >
              <div className="date-picker-navigation">
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
                      {new Intl.DateTimeFormat(contentLocale(locale), {
                        month: "long",
                      }).format(new Date(2026, index, 1))}
                    </option>
                  ))}
                </DropdownSelect>
              </div>
              <DayPicker
                mode="single"
                locale={calendarLocales[locale]}
                dir={locale === "ar" ? "rtl" : "ltr"}
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
            </fieldset>,
            document.body,
          )
        : null}
    </div>
  )
}
