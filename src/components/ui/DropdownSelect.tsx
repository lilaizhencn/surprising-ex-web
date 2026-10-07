import { ChevronDown } from "lucide-react"
import {
  Children,
  type CSSProperties,
  isValidElement,
  type OptionHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

type Option = { value: string; label: string; disabled: boolean; searchText: string }

type Props = Readonly<{
  value: string | number
  onChange: (event: { target: { value: string } }) => void
  children: ReactNode
  "aria-label"?: string
  searchable?: boolean
  searchPlaceholder?: string
  noResultsLabel?: string
  maxMenuWidth?: number
}>

/** A controlled select whose menu stays inside the page and above scroll containers. */
export function DropdownSelect({
  value,
  onChange,
  children,
  "aria-label": ariaLabel,
  searchable = false,
  searchPlaceholder = "Search",
  noResultsLabel = "No matches",
  maxMenuWidth = 320,
}: Props) {
  const options: Option[] = Children.toArray(children)
    .filter(isValidElement<OptionHTMLAttributes<HTMLOptionElement>>)
    .map((option) => ({
      value: String(option.props.value ?? option.props.children ?? ""),
      label: String(option.props.children ?? ""),
      disabled: Boolean(option.props.disabled),
      searchText:
        `${String(option.props.children ?? "")} ${(option.props as OptionHTMLAttributes<HTMLOptionElement> & { "data-search"?: string })["data-search"] ?? ""}`.toLocaleLowerCase(),
    }))
  const selected = options.find((option) => option.value === String(value))
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState("")
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" })

  useEffect(() => {
    if (!open) return
    if (searchable) requestAnimationFrame(() => searchInput.current?.focus())
    const place = () => {
      const box = trigger.current?.getBoundingClientRect()
      if (!box) return
      const below = window.innerHeight - box.bottom - 8
      const above = box.top - 8
      const showAbove = below < 180 && above > below
      const maxHeight = Math.max(0, Math.min(240, showAbove ? above - 4 : below - 4))
      const width = Math.min(box.width, maxMenuWidth, window.innerWidth - 16)
      setPosition({
        top: showAbove ? undefined : box.bottom + 4,
        bottom: showAbove ? window.innerHeight - box.top + 4 : undefined,
        boxSizing: "border-box",
        left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
        width,
        maxHeight,
      })
    }
    const closeOutside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
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
  }, [maxMenuWidth, open, searchable])

  const filteredOptions = options.filter(
    (option) => !query.trim() || option.searchText.includes(query.trim().toLocaleLowerCase()),
  )

  const choose = (option: Option) => {
    if (option.disabled || trigger.current?.matches(":disabled")) return
    onChange({ target: { value: option.value } })
    setOpen(false)
    setQuery("")
    trigger.current?.focus()
  }
  const move = (direction: number) => {
    if (filteredOptions.length === 0) return
    let next = active
    for (let index = 0; index < filteredOptions.length; index++) {
      next = (next + direction + filteredOptions.length) % filteredOptions.length
      if (!filteredOptions[next]?.disabled) break
    }
    setActive(next)
    menu.current
      ?.querySelectorAll<HTMLButtonElement>("[role=option]")
      [next]?.scrollIntoView({ block: "nearest" })
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="dropdown-select"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="listbox"
        onClick={() => {
          setActive(
            Math.max(
              0,
              options.findIndex((option) => option.value === String(value)),
            ),
          )
          setQuery("")
          setOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            return
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            move(event.key === "ArrowDown" ? 1 : -1)
          }
          if (open && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault()
            const option = filteredOptions[active]
            if (option) choose(option)
          }
        }}
      >
        <span>{selected?.label ?? options[0]?.label ?? "Select"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div ref={menu} className="dropdown-select-menu" style={position}>
            {searchable ? (
              <input
                className="dropdown-select-search"
                type="search"
                aria-label={`${searchPlaceholder} ${ariaLabel ?? "options"}`}
                placeholder={searchPlaceholder}
                ref={searchInput}
                value={query}
                autoComplete="off"
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setOpen(false)
                    setQuery("")
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    menu.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus()
                  }
                  if (event.key === "Enter" && filteredOptions[active]) {
                    event.preventDefault()
                    choose(filteredOptions[active])
                  }
                }}
              />
            ) : null}
            <div id={menuId} role="listbox" aria-label={ariaLabel}>
              {filteredOptions.length ? (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === String(value)}
                    className={index === active ? "active" : ""}
                    disabled={option.disabled}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <p className="dropdown-select-empty">{noResultsLabel}</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
