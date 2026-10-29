import { Check, Palette, X } from "lucide-react"
import { useRef } from "react"
import { t } from "../../i18n"
import { setTheme, themes, useTheme } from "../../state/theme"
import { IconButton } from "../ui/Primitives"
import "./ThemePicker.css"

export function ThemePicker() {
  const dialog = useRef<HTMLDialogElement>(null)
  const selected = useTheme()
  return (
    <>
      <IconButton label={t("Appearance")} onClick={() => dialog.current?.showModal()}>
        <Palette size={20} />
      </IconButton>
      <dialog ref={dialog} className="theme-dialog" aria-labelledby="theme-dialog-title">
        <div className="theme-dialog-heading">
          <div>
            <h2 id="theme-dialog-title">{t("Make it yours")}</h2>
            <p>{t("Choose a palette for your trading workspace.")}</p>
          </div>
          <IconButton label={t("Close")} onClick={() => dialog.current?.close()}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="theme-options">
          {themes.map((theme) => (
            <button
              type="button"
              key={theme.id}
              className="theme-option"
              aria-pressed={selected === theme.id}
              onClick={() => {
                setTheme(theme.id)
                dialog.current?.close()
              }}
            >
              <span className="theme-preview" data-preview-theme={theme.id} aria-hidden="true">
                <span className="theme-preview-nav">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-preview-workspace">
                  <span className="theme-preview-chart">
                    <svg viewBox="0 0 160 56" focusable="false" aria-hidden="true">
                      <path d="M0 44L18 36L34 40L50 20L67 27L82 14L100 26L118 10L134 17L160 2" />
                    </svg>
                  </span>
                  <span className="theme-preview-order">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="theme-preview-palette">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <span className="theme-option-name">
                {t(theme.name)}
                {selected === theme.id && <Check size={17} aria-label={t("Selected")} />}
              </span>
              <span className="theme-option-description">{t(theme.description)}</span>
            </button>
          ))}
        </div>
        <p className="theme-dialog-note">
          {t("Saved on this device. Market gains and losses keep their meaning.")}
        </p>
      </dialog>
    </>
  )
}
