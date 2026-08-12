---
name: Surprising EX
colors:
  surface: '#fbf9fb'
  surface-dim: '#dbd9dc'
  surface-bright: '#fbf9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f6'
  surface-container: '#efedf0'
  surface-container-high: '#e9e7ea'
  surface-container-highest: '#e3e2e5'
  on-surface: '#1b1c1e'
  on-surface-variant: '#434656'
  inverse-surface: '#303033'
  inverse-on-surface: '#f2f0f3'
  outline: '#737688'
  outline-variant: '#c3c5d9'
  surface-tint: '#004ced'
  primary: '#003ec7'
  on-primary: '#ffffff'
  primary-container: '#0052ff'
  on-primary-container: '#dfe3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#006d3f'
  on-secondary: '#ffffff'
  secondary-container: '#75fcad'
  on-secondary-container: '#007443'
  tertiary: '#9e0d22'
  on-tertiary: '#ffffff'
  tertiary-container: '#c02c37'
  on-tertiary-container: '#ffdddb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001452'
  on-primary-fixed-variant: '#0038b6'
  secondary-fixed: '#75fcad'
  secondary-fixed-dim: '#56df93'
  on-secondary-fixed: '#00210f'
  on-secondary-fixed-variant: '#00522e'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b0'
  on-tertiary-fixed: '#410007'
  on-tertiary-fixed-variant: '#92001b'
  background: '#fbf9fb'
  on-background: '#1b1c1e'
  surface-variant: '#e3e2e5'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is engineered for a professional digital asset exchange where credibility and clarity are paramount. The brand personality is **authoritative, transparent, and high-performance**.

The visual style is **Corporate Modern**, leaning heavily into functional minimalism. It avoids decorative flourishes in favor of information density and precision. The aesthetic borrows from institutional finance but utilizes modern web affordances—such as subtle layering and generous whitespace—to reduce the cognitive load associated with complex trading data. The goal is to evoke a sense of absolute security and technical "correctness."

## Colors

The palette is anchored by a high-trust **Primary Blue (#0052FF)**, chosen for its association with established financial technology.

- **Success & Danger:** We utilize a restrained Emerald Green for "Buy/Long" actions and a Coral Red for "Sell/Short" actions. These are calibrated to be accessible yet distinct against both light and dark backgrounds.
- **Neutrals:** In Light Mode, we use "Cold Grays" (blue-tinted) to maintain a sterile, professional atmosphere. In Dark Mode, we shift to "Deep Graphite," avoiding pure black to reduce eye strain during long trading sessions and to maintain depth through subtle value shifts.

## Typography

The typography system prioritizes legibility and data alignment. **Hanken Grotesk** serves as the primary typeface, offering a sharp, contemporary feel that remains legible at small sizes.

For all financial figures, price tickers, and order book entries, the system switches to **JetBrains Mono**. This ensures that numbers are tabular (equal width), preventing "jumping" or "shimmering" layouts when prices update rapidly.

- Use `data-mono` for all numerical values in tables and dashboards.
- Use `label-caps` for table headers and section overviews to create clear visual hierarchy.
- Ensure `headline-lg-mobile` is triggered at the 768px breakpoint to prevent overflow.

## Layout & Spacing

This design system utilizes an **8px hard grid** with a **4px base unit** for micro-adjustments (like icon padding or small labels).

- **Desktop Layout:** A 12-column fluid grid for marketing pages, but a **fixed-panel "Dashboard" layout** for the trading interface. Trading panels should use "Resizable Splitters" to allow users to customize their workspace.
- **Gaps:** Use `md (16px)` for standard element spacing and `lg (24px)` for section separation.
- **Breakpoints:**
  - Mobile: < 768px (Single column, stacked widgets)
  - Tablet: 768px - 1280px (2-column layout, sidebar collapsed)
  - Desktop: > 1280px (Full 3 or 4-column trading view)

## Elevation & Depth

To maintain a "Professional/Restrained" feel, depth is communicated through **Tonal Layering** and **Low-Contrast Outlines** rather than heavy shadows.

- **Level 0 (Background):** The base canvas color.
- **Level 1 (Surface):** Used for cards and widgets. In Light Mode, these have a 1px border (#ECEFF3). In Dark Mode, these use a slightly lighter graphite (#1E2329).
- **Level 2 (Popovers/Modals):** These use a very soft, diffused ambient shadow (0px 8px 24px rgba(0,0,0,0.08)) to indicate they sit above the interface.
- **Active State:** Elements being dragged or interacted with should use a 2px Primary Blue border rather than a shadow to indicate focus.

## Shapes

The design system uses **Soft (0.25rem / 4px)** roundedness. This small radius maintains a crisp, "engineered" look while removing the harshness of 0px corners.

- **Small elements (Buttons, Inputs, Tooltips):** 4px radius.
- **Medium elements (Cards, Modals):** 8px radius (`rounded-lg`).
- **Large elements (Outer Dashboard Container):** 12px radius (`rounded-xl`).
- **Icons:** Use a consistent 2px stroke weight with slightly rounded joins to match the UI.

## Components

- **Buttons:**
  - *Primary:* Solid Primary Blue, white text. No gradient.
  - *Success/Danger:* Solid Emerald/Coral for "Buy/Sell" actions.
  - *Ghost:* 1px border of the current text color, used for secondary navigation.
- **Input Fields:**
  - Use a 1px border. On focus, the border thickens to 2px Primary Blue.
  - Labels should be `body-sm` and sit above the input, never floating inside.
- **Data Tables:**
  - Use `data-mono` for cell content.
  - Row height should be exactly 40px or 48px to align with the 8px grid.
  - Zebra striping is discouraged; use subtle 1px dividers instead.
- **Chips / Tags:**
  - Use for asset categories (e.g., "DeFi", "Layer 1").
  - These should have a subtle background tint of the text color (e.g., 10% opacity Blue background with 100% Blue text).
- **Trading Chart:**
  - The chart area must utilize the full background color of the panel it sits in.
  - Crosshair labels should use the `label-caps` style for maximum clarity.