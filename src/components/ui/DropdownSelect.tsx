import { ChevronDown } from "lucide-react"
import {
  Children,
  isValidElement,
  type OptionHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

type Option = { value: string; label: string; disabled: boolean }

type Props = Readonly<{
  value: string | number
  onChange: (event: { target: { value: string } }) => void
  children: ReactNode
  "aria-label"?: string
}>

/** A controlled select whose menu stays inside the page and above scroll containers. */
export function DropdownSelect({ value, onChange, children, "aria-label": ariaLabel }: Props) {
  const options: Option[] = Children.toArray(children)
    .filter(isValidElement<OptionHTMLAttributes<HTMLOptionElement>>)
    .map((option) => ({
      value: String(option.props.value ?? option.props.children ?? ""),
      label: String(option.props.children ?? ""),
      disabled: Boolean(option.props.disabled),
    }))
  const selected = options.find((option) => option.value === String(value))
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 240 })

  useEffect(() => {
    if (!open) return
    const place = () => {
      const box = trigger.current?.getBoundingClientRect()
      if (!box) return
      const below = window.innerHeight - box.bottom - 8
      const above = box.top - 8
      const showAbove = below < 180 && above > below
      const maxHeight = Math.max(100, Math.min(240, showAbove ? above : below))
      setPosition({
        top: showAbove ? box.top - maxHeight - 4 : box.bottom + 4,
        left: Math.max(8, Math.min(box.left, window.innerWidth - box.width - 8)),
        width: box.width,
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
  }, [open])

  const choose = (option: Option) => {
    if (option.disabled) return
    onChange({ target: { value: option.value } })
    setOpen(false)
    trigger.current?.focus()
  }
  const move = (direction: number) => {
    if (options.length === 0) return
    let next = active
    for (let index = 0; index < options.length; index++) {
      next = (next + direction + options.length) % options.length
      if (!options[next]?.disabled) break
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
            const option = options[active]
            if (option) choose(option)
          }
        }}
      >
        <span>{selected?.label ?? options[0]?.label ?? "Select"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            className="dropdown-select-menu"
            role="listbox"
            aria-label={ariaLabel}
            style={position}
          >
            {options.map((option, index) => (
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
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
