# Surprising EX Design System

## 0. Research Log

- Stitch reference set: 19 exported screens and 19 screenshots inspected; the export is the visual contract.
- Reference pick: Stitch's own `surprising_ex/DESIGN.md`, carried forward as the source of the blue-led institutional exchange language.
- Existing-surface audit: the deprecated `surprising-ex-web` was read only for protocol and deployment behavior; its dark orbital surface is not copied into this rebuild.
- Skipped lanes: live-site and image-generation research — a concrete Stitch reference already exists and must remain authoritative.

## 1. Atmosphere & Identity

Surprising EX is a precise, credible exchange interface: cold mineral surfaces, deep blue action states, narrow borders, tabular numbers, and restrained green/red semantics. Its signature is the blue exchange mark and the contrast between an airy public market surface and a dense, almost instrument-panel trading workspace. The UI should feel engineered and calm under pressure.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|---|---|---:|---:|---|
| Canvas | `--color-canvas` | `#fbf9fb` | `#111318` | Page background |
| Surface | `--color-surface` | `#ffffff` | `#191c23` | Cards and panels |
| Surface muted | `--color-surface-muted` | `#f5f3f6` | `#222630` | Inputs, table headers |
| Surface active | `--color-surface-active` | `#e3e8fb` | `#24345d` | Selected navigation |
| Ink | `--color-ink` | `#1b1c1e` | `#f2f0f3` | Primary text |
| Ink muted | `--color-ink-muted` | `#434656` | `#aeb4c2` | Secondary text |
| Ink subtle | `--color-ink-subtle` | `#737688` | `#7f8798` | Metadata and disabled text |
| Border | `--color-border` | `#c3c5d9` | `#343a49` | Structural dividers |
| Border soft | `--color-border-soft` | `#e9e7ea` | `#292e39` | Low-contrast panel edges |
| Primary | `--color-primary` | `#003ec7` | `#5d82ff` | Links, CTA, focus |
| Primary strong | `--color-primary-strong` | `#0052ff` | `#75a0ff` | Primary button fill |
| Positive | `--color-positive` | `#006d3f` | `#55df9a` | Buy/long/positive, always paired with `+`/up |
| Negative | `--color-negative` | `#9e0d22` | `#ff7d86` | Sell/short/negative, always paired with `-`/down |
| Warning | `--color-warning` | `#9a5b00` | `#f6bd63` | Risk and attention |
| Login blue | `--color-login-blue` | `#0052ff` | `#0052ff` | Auth artwork and CTA |

Accent colors are semantic, never decorative. Financial direction is expressed with sign, text, and color together. Pure black is reserved for the Stitch auth artwork only.

## 3. Typography

- **Primary:** Hanken Grotesk, `Arial`, sans-serif. Use for headings, navigation, labels, and body copy.
- **Data:** JetBrains Mono, `ui-monospace`, monospace. Use for prices, quantities, balances, IDs, timestamps, and table values.
- **CSS tokens:** `--font-family-sans`, `--font-family-mono`, and the `--font-*` scale in `src/styles/tokens.css` are the only runtime font-family and font-size sources; component styles must reference these aliases.
- **Display:** 48px / 56px, 700, `-0.02em`.
- **H1:** 32px / 40px, 600.
- **H2:** 24px / 32px, 600.
- **H3:** 20px / 28px, 600.
- **Body:** 16px / 24px, 400.
- **Body small:** 14px / 20px, 400.
- **Label:** 12px / 16px, 700, `0.05em`.
- Body copy never falls below 14px. Financial values use `font-variant-numeric: tabular-nums`.

## 4. Spacing & Layout

- Base unit: 4px. Shared spacing is 4, 8, 12, 16, 24, 32, 48, 64px.
- Public max width: 1400px with 32px desktop / 16px mobile gutters.
- App shell: 72px top navigation, optional 260px account rail, content min width 0.
- Trading shell: fixed top navigation plus a 3-column workspace on desktop; `min-width: 0` on every pane and horizontal scrolling only for dense data tables.
- Breakpoints: 640px, 768px, 1024px, 1280px, 1440px.
- Mobile: single-column content, 44px minimum touch targets, no primary-content horizontal overflow.

## 5. Components

### App shell

- **Structure:** top navigation, optional account sidebar, main content, footer where the Stitch screen includes one.
- **Variants:** public, authenticated, trading, auth.
- **States:** navigation active, disconnected, reconnecting, stale, loading.
- **Accessibility:** semantic landmarks, keyboard-reachable navigation, visible focus ring.

### Button / Icon Button

- **Variants:** primary, outline, ghost, positive, negative, compact icon-only.
- **States:** default, hover, active, focus, disabled, loading, success, error.
- **Motion:** 140ms color/opacity transition; active state translates `transform` by 1px.
- **Accessibility:** icon-only controls have an accessible label; 44px mobile target.

### Data Table

- **Structure:** caption/toolbar, table header, rows, empty/error/loading state.
- **Variants:** markets, balances, orders, history.
- **States:** loading skeleton, empty, error, stale data, hover, selected.
- **Layout:** 40–48px rows, JetBrains Mono values, no zebra striping.

### Panel / Card

- **Variants:** surface, outlined, elevated, dense trading pane.
- **States:** default, hover only when actionable, focus-within, loading, empty, error, success.
- **Depth:** tonal layering plus low-contrast 1px borders; modal/popover may use one soft shadow.

### Form Field

- **Variants:** text, password, number, select, search, verification code.
- **States:** default, hover, focus, disabled, loading, error, success.
- **Accessibility:** label above control, error below, `aria-describedby` for help/error text.

### Price / Status Display

- **Variants:** price, percent, balance, order status, risk indicator.
- **States:** positive, negative, neutral, stale, unavailable, hidden.
- **Accessibility:** include visible sign or status word; never color-only.

### Modal / Drawer / Toast

- **States:** closed, opening, open, closing, error, success.
- **Motion:** opacity and transform only; reduced-motion users get an opacity-only transition.
- **Accessibility:** focus return, Escape close, labelled dialog, body scroll lock for drawers.

## 6. Motion & Interaction

- Micro: 140ms ease-out. Standard: 200ms ease-in-out. Emphasis: 400ms cubic-bezier(0.16, 1, 0.3, 1).
- Animate only `transform`, `opacity`, and `filter`.
- Theme toggle is an immediate token swap with a short opacity transition; no decorative animation.
- Loading uses shape-matched skeletons. Errors remain visible until dismissed or retried.
- `prefers-reduced-motion: reduce` removes non-essential transforms and continuous chart motion.

## 7. Depth & Surface

The default strategy is **mixed but restrained**: structural 1px borders and tonal surface shifts, with `0 8px 24px rgba(27, 28, 30, 0.08)` only for popovers and dialogs. Trading panes do not float above one another; they read as a connected instrument workspace.

## 8. Accessibility Constraints & Accepted Debt

- WCAG 2.2 AA target; body contrast at least 4.5:1, large text 3:1.
- Full keyboard navigation and visible focus for every interactive control.
- Screen-reader status text for loading, stale, error, and success states.
- Reduced motion respected.

| Item | Location | Why accepted | Exit |
|---|---|---|---|
| Real chart library integration | trading panes | Stitch chart shape is implemented first with a typed SVG adapter; real candle adapter remains API-dependent | Add Lightweight Charts after candle contract is verified |
| Live notification content | notification center | backend user notification endpoint was not found | Enable after Gateway endpoint exists |

## 9. Never Ship

- No copied exchange brand names, logos, or claims.
- No fake order/withdrawal success, fake balances, fake volume, or fake compliance claims.
- No raw color values outside this document and the token stylesheet.
- No `any`, silent mock fallback, color-only trading state, or unlabelled icon control.
- No giant rounded dashboard cards, neon glows, decorative particles, or unbounded horizontal overflow.
