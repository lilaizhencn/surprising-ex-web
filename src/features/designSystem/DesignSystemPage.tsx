import { useEffect, useState } from "react"
import tokens from "../../../design-tokens/design-tokens.json"
import "./DesignSystemPage.css"

export function DesignSystemPage() {
  const [tick, setTick] = useState(91420.5)
  const [cnDirection, setCnDirection] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((prev) => Number((prev + (Math.random() - 0.48) * 1.4).toFixed(2)))
    }, 800)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (cnDirection) {
      root.setAttribute("data-market-direction", "cn")
    } else {
      root.removeAttribute("data-market-direction")
    }
    return () => root.removeAttribute("data-market-direction")
  }, [cnDirection])

  return (
    <main className="ds-page">
      <div className="ds-container">
        <header className="ds-header">
          <div>
            <span className="ds-eyebrow">AETERN Design System · Phase 1 SSOT</span>
            <h1 className="ds-title">Deep Space · Aurora · Precision HUD</h1>
            <p className="ds-subtitle">
              Single source of truth from <code>design-tokens.json</code> → Web{" "}
              <code>tokens.css</code> (oklch) &amp; Flutter <code>tokens.dart</code>.
            </p>
          </div>
          <button
            type="button"
            className="ds-swatch"
            onClick={() => setCnDirection((v) => !v)}
            aria-pressed={cnDirection}
          >
            <span className="ds-eyebrow">Semantic Direction</span>
            <span>{cnDirection ? "CN (红涨绿跌)" : "Global (绿涨红跌)"}</span>
          </button>
        </header>

        <section className="ds-section">
          <h2 className="ds-section-title">1. Deep-Space Elevations (5 Levels)</h2>
          <div className="ds-grid">
            {Object.entries(tokens.color.background).map(([name, val]) => (
              <div className="ds-swatch" key={name}>
                <div className="ds-swatch-chip" style={{ background: val.oklch }} />
                <div className="ds-swatch-meta">
                  <strong>bg-{name}</strong>
                  <span className="ds-mono muted">{val.hex}</span>
                </div>
                <span className="ds-mono subtle" style={{ fontSize: 11 }}>
                  {val.oklch}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section">
          <h2 className="ds-section-title">
            2. Aurora Primary Spectrum &amp; 3 Standard Gradients
          </h2>
          <div className="ds-grid">
            {Object.entries(tokens.color.aurora).map(([name, val]) => (
              <div className="ds-swatch" key={name}>
                <div className="ds-swatch-chip" style={{ background: val.oklch }} />
                <div className="ds-swatch-meta">
                  <strong>aurora-{name}</strong>
                  <span className="ds-mono muted">{val.hex}</span>
                </div>
              </div>
            ))}
            <div className="ds-swatch">
              <div
                className="ds-swatch-chip"
                style={{ background: "var(--gradient-aurora-primary)" }}
              />
              <div className="ds-swatch-meta">
                <strong>aurora-primary</strong>
                <span className="ds-mono muted">Cyan→Violet→Magenta</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div
                className="ds-swatch-chip"
                style={{ background: "var(--gradient-aurora-warm)" }}
              />
              <div className="ds-swatch-meta">
                <strong>aurora-warm</strong>
                <span className="ds-mono muted">Corona→Magenta→Violet</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div
                className="ds-swatch-chip"
                style={{ background: "var(--gradient-aurora-cool)" }}
              />
              <div className="ds-swatch-meta">
                <strong>aurora-cool</strong>
                <span className="ds-mono muted">Cyan→Violet→Acid</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ds-section">
          <h2 className="ds-section-title">3. Semantic Market States &amp; Text Contrast</h2>
          <div className="ds-grid">
            <div className="ds-swatch" style={{ background: "var(--up-soft-bg)" }}>
              <strong style={{ color: "var(--up-base)" }}>▲ UP / LONG (+4.82%)</strong>
              <span className="ds-mono" style={{ color: "var(--up-base)", fontSize: 20 }}>
                {tick.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="ds-swatch" style={{ background: "var(--down-soft-bg)" }}>
              <strong style={{ color: "var(--down-base)" }}>▼ DOWN / SHORT (-2.14%)</strong>
              <span className="ds-mono" style={{ color: "var(--down-base)", fontSize: 20 }}>
                {(tick - 120.45).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {Object.entries(tokens.color.text).map(([name, val]) => (
              <div className="ds-swatch" key={name}>
                <strong style={{ color: val.oklch }}>text-{name}</strong>
                <div className="ds-swatch-meta">
                  <span className="ds-mono muted">{val.hex}</span>
                  <span className="ds-mono">Contrast {val.contrastOnVoid}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section">
          <h2 className="ds-section-title">4. Glass Layers (Static Only) &amp; Glow Quota (0–3)</h2>
          <div className="ds-grid">
            <div className="ds-glass-card ds-glass-1">
              <strong>glass-1 · Nav / Rail</strong>
              <span className="muted">12px blur · 0.72 alpha</span>
            </div>
            <div className="ds-glass-card ds-glass-2">
              <strong>glass-2 · Popover / Drawer</strong>
              <span className="muted">20px blur · 0.80 alpha</span>
            </div>
            <div className="ds-glass-card ds-glass-3">
              <strong>glass-3 · Dialog / Modal</strong>
              <span className="muted">28px blur · 0.88 alpha</span>
            </div>
            {[0, 1, 2, 3].map((lvl) => (
              <div className={`ds-glow-card ds-glow-${lvl}`} key={lvl}>
                <strong>
                  {lvl === 2 && <span className="ds-live-dot" style={{ marginRight: 8 }} />}
                  glow-{lvl}
                </strong>
                <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                  {lvl <= 1
                    ? "Ambient / resting surface"
                    : lvl === 2
                      ? "Primary CTA / active tab / live dot"
                      : "Hero peak emphasis (max 3 per screen)"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section">
          <h2 className="ds-section-title">5. Typography Scale &amp; Tabular Numerals</h2>
          {tokens.typography.scale.map((step) => (
            <div className="ds-type-row" key={step.name}>
              <span
                style={{
                  fontSize: `var(--text-${step.name})`,
                  lineHeight: `var(--leading-${step.name})`,
                  letterSpacing: `var(--tracking-${step.name})`,
                  fontWeight: step.sizePx >= 20 ? 700 : 500,
                }}
              >
                {step.name.toUpperCase()} · BTC-USDT 91,420.50
              </span>
              <span className="ds-mono muted" style={{ fontSize: 12 }}>
                {step.sizePx}px / lh {step.lineHeight} / ls {step.letterSpacingEm}em
              </span>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
