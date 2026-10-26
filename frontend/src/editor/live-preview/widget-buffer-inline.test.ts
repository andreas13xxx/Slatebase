import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CodeMirror's `.cm-widgetBuffer` elements are <img>s. A theme rule on `.markdown-source-view.mod-cm6 img`
 * (Blue Topaz: `display: block`, specificity 0,4,2) would otherwise break every line holding an inline widget
 * into one line per element. The stylesheet carries a higher-specificity guard; jsdom does not resolve the cascade
 * across specificity, so the test pins the selector's shape instead.
 */
const css = readFileSync(resolve(process.cwd(), 'src/editor/live-preview/live-preview.css'), 'utf-8')

/** Specificity (ids, classes, elements) of a selector made of class, element and `:not(.class)` parts. */
function specificity(selector: string): [number, number, number] {
  const classes = (selector.match(/\.[\w-]+/g) ?? []).length
  const elements = (selector.replace(/\.[\w-]+/g, '').match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length
  return [0, classes, elements]
}

describe('widget buffers in ordinary lines', () => {
  const selector = '.cm-editor .cm-content .cm-line:not(.cm-lp-tight-block-line) img.cm-widgetBuffer'

  it('are forced back to inline by a guard rule', () => {
    expect(css).toContain(`${selector} {\n  display: inline;\n}`)
  })

  it('outranks Blue Topaz\'s img rule (0,4,2) without !important', () => {
    const [, classes, elements] = specificity(selector)
    expect(classes * 100 + elements).toBeGreaterThan(4 * 100 + 2)
    expect(css).not.toMatch(/img\.cm-widgetBuffer\s*\{[^}]*!important/)
  })

  it('leaves tight block lines alone, they set display: block on purpose', () => {
    expect(selector).toContain(':not(.cm-lp-tight-block-line)')
    expect(css).toMatch(/\.cm-lp-tight-block-line \.cm-widgetBuffer\s*\{[^}]*display: block/)
  })
})
