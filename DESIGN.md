# Surprising Exchange Web Design System

## 0. Research Log

- Embedded references: selected a high-craft soft-surface direction and an institutional crypto-finance reference from the local frontend corpus; retained its trust-first hierarchy without copying any brand assets or copy.
- Existing-surface audit: the current app already uses dark/light CSS variables, compact trading density, and `lucide-react`; those patterns remain the compatibility baseline while the auth and account surfaces migrate to shared primitives.
- Product direction: orbital control room. Ink-black and mineral-white foundations carry a restrained electric-cyan action ramp, while amber is reserved for risk and attention. The memorable moment is a focused “flight deck” transition from identity into the live market shell.

## 1. Personas and product principles

- Active trader: needs low-latency information hierarchy, stable keyboard focus, and explicit account/product-line context.
- New user: needs a calm, linear auth flow with plain-language validation and no hidden username concept.
- Safety-conscious user: needs visible verification state, session controls, and confirmation before money movement.

Principles: identity before access, state before decoration, one primary action per surface, readable numbers, and no motion that hides financial state.

## 2. Tokens

```css
--sx-ink-950: #080b10;
--sx-ink-900: #0d121a;
--sx-ink-800: #151c27;
--sx-mineral-050: #f7f9fb;
--sx-mineral-100: #edf1f5;
--sx-cyan-500: #49d7e8;
--sx-cyan-700: #1599ad;
--sx-amber-500: #f0b95a;
--sx-positive-500: #43d39e;
--sx-negative-500: #f06e78;
--sx-text-primary: #eff5fb;
--sx-text-secondary: #9eabbc;
--sx-border-subtle: rgba(170, 194, 214, 0.16);
--sx-radius-control: 12px;
--sx-radius-panel: 20px;
--sx-radius-pill: 999px;
--sx-space-1: 4px;
--sx-space-2: 8px;
--sx-space-3: 12px;
--sx-space-4: 16px;
--sx-space-5: 20px;
--sx-space-6: 24px;
--sx-space-8: 32px;
--sx-space-10: 40px;
--sx-size-asset-transfer-dialog: 520px;
--sx-size-asset-transfer-touch: 44px;
--sx-size-asset-support: 42px;
--sx-space-asset-support-right: 24px;
--sx-space-asset-support-bottom: 22px;
--sx-asset-disabled: #d9d9d9;
--sx-asset-disabled-text: #8a8a8a;
--sx-asset-disabled-border: #c5c5c5;
--sx-shadow-asset-dialog: 0 24px 60px rgba(17, 17, 17, .18);
--sx-focus-outline-asset: 2px solid var(--sx-asset-positive);
--sx-focus-outline-offset: 2px;
--sx-size-asset-tab-indicator: 3px;
```

Typography uses the system UI sans stack for dense trading surfaces, a slightly expanded display weight for auth headings, and tabular numerals for prices, quantities, balances, and risk values.

## 3. Materials and elevation

- App canvas: layered ink gradient with a fixed, pointer-transparent radial cyan glow; no scrolling blur.
- Panel: `--sx-ink-900` plus a 1px `--sx-border-subtle` rim and a restrained inset highlight.
- Elevated panel: nested outer shell (`--sx-ink-800`) and inner core (`--sx-ink-900`) with a 0 16px 48px rgba(0,0,0,.24) shadow.
- Light mode: mineral canvas, white core, ink text, and the same semantic action ramp; do not invert risk colors.

## 4. Layout and responsive behavior

- Trading shell owns vertical scrolling; nested panes use `min-height: 0` and never trap the page scroll.
- Desktop: fixed navigation rail, market header, split chart/order-book/order-entry workspace.
- Tablet: collapsible rail and stacked account panels.
- Mobile: single-column flow, sticky primary action, minimum 44px touch targets, `100dvh` instead of `100vh`.
- Auth: centered panel on desktop, full-width content with 16px gutters below 768px.

## 5. Reusable primitives and states

- `Surface`: `base`, `raised`, `focus`, `disabled`.
- `Field`: `idle`, `focused`, `invalid`, `verified`, `disabled` with label and message slots.
- `ActionButton`: `primary`, `secondary`, `quiet`, `danger`; every state includes keyboard focus and pending state.
- `StatusBadge`: `positive`, `warning`, `negative`, `neutral`.
- `ProductContext`: always displays the active product line and account context.
- `VerificationStep`: destination masking, code input, resend cooldown, expired, invalid, success.

Primitive showcase coverage is required at 375, 768, and 1280 CSS pixels before auth screens are considered visually complete.

## 6. Motion and interaction

- Use only `transform`, `opacity`, and `filter` for transitions.
- Auth panel enters with a 420ms opacity/translate transition; verification success uses a short check-state morph.
- Pending actions show an inline progress state and keep the button width stable.
- Respect `prefers-reduced-motion`; replace transitions with instant state changes.

## 7. Accessibility and content

- Every field has a persistent visible label; errors are associated with `aria-describedby` and announced through a live region.
- Never use color alone for balance or risk. Use sign, label, and icon.
- Keyboard order matches visual order; focus rings remain visible on dark and light themes.
- Auth copy states the required identity explicitly: “邮箱地址” or “手机号（暂未开放）”, never “用户名”.

## 8. Accepted debt and handoff

- Existing trading screens contain local legacy styles and mock fallback paths; they are compatibility debt until real backend adapters cover each product line. New auth/account surfaces must use these tokens and primitives.
- Visual QA must capture auth, verification, password reset, and trading shell at 375/768/1280, including invalid and pending states.
