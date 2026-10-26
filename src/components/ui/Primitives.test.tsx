import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Button, IconButton } from "./Primitives"

describe("shared action controls", () => {
  it("keeps a loading action disabled and labelled even with disabled=false", () => {
    const html = renderToStaticMarkup(
      <Button loading disabled={false}>
        Submit order
      </Button>,
    )
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain("Submit order")
  })

  it("keeps button styles when a caller supplies a layout class", () => {
    const html = renderToStaticMarkup(
      <Button tone="outline" className="full-width" type="submit">
        Continue
      </Button>,
    )
    expect(html).toContain('class="button button-outline full-width"')
    expect(html).toContain('type="submit"')
  })

  it("keeps icon button styles and its accessible name with a custom class", () => {
    const html = renderToStaticMarkup(
      <IconButton label="Open navigation" className="mobile-nav-toggle">
        Menu
      </IconButton>,
    )
    expect(html).toContain('class="icon-button mobile-nav-toggle"')
    expect(html).toContain('aria-label="Open navigation"')
  })
})
