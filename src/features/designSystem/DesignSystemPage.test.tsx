import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { DesignSystemPage } from "./DesignSystemPage"

describe("DesignSystemPage (Phase 1 SSOT)", () => {
  it("renders deep-space elevations, aurora gradients, glass layers, glow levels, and type scale", () => {
    const html = renderToStaticMarkup(<DesignSystemPage />)
    expect(html).toContain("Deep-Space Elevations")
    expect(html).toContain("Aurora Primary Spectrum")
    expect(html).toContain("Glass Layers")
    expect(html).toContain("Typography Scale")
    expect(html).toContain("aurora-primary")
    expect(html).toContain("glow-3")
  })
})
