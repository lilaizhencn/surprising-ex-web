import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import {
  AdlEnergyBar,
  LeverageSlider,
  SciFiEmptyState,
  SegmentedControl,
  Skeleton,
  ToastBanner,
} from "./SciFiPrimitives"

describe("SciFiPrimitives (Phase 2 Component Matrix)", () => {
  it("renders SegmentedControl, LeverageSlider, AdlEnergyBar, Skeleton, SciFiEmptyState, and ToastBanner", () => {
    const html = renderToStaticMarkup(
      <div>
        <SegmentedControl
          ariaLabel="Order side"
          value="limit"
          options={[
            { value: "limit", label: "Limit" },
            { value: "market", label: "Market" },
          ]}
          onChange={vi.fn()}
        />
        <LeverageSlider value={25} onChange={vi.fn()} />
        <AdlEnergyBar level={4} />
        <Skeleton height={20} label="Loading book" />
        <SciFiEmptyState title="No open positions" description="Place an order to begin" />
        <ToastBanner id="toast-1" message="Order submitted" onDismiss={vi.fn()} />
      </div>,
    )
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('type="range"')
    expect(html).toContain("ADL risk level 4 of 5")
    expect(html).toContain('data-tier="high"')
    expect(html).toContain("No open positions")
    expect(html).toContain('popover="manual"')
  })
})
