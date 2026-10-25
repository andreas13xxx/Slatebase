import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_OBSIDIAN_THEME_ID } from '../builtin-themes'

// `?raw` imports are empty in jsdom, so the stylesheet is read from the package root.
const css = readFileSync(resolve(process.cwd(), 'src/plugins/appearance/builtin/obsidian.css'), 'utf-8')
const GATE = `:root[data-obsidian-theme="${BUILTIN_OBSIDIAN_THEME_ID}"]`

/** Selectors of every style rule (at any @-rule depth), one entry per comma-separated selector. */
function styleSelectors(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  let prelude = ''
  for (const char of stripped) {
    if (char === '{') {
      const text = prelude.trim()
      if (text !== '' && !text.startsWith('@')) selectors.push(...text.split(',').map((part) => part.trim()))
      prelude = ''
    } else if (char === '}' || char === ';') {
      prelude = ''
    } else {
      prelude += char
    }
  }
  return selectors
}

describe('built-in Obsidian theme stylesheet', () => {
  it('gates every rule on the theme marker, so nothing applies without the theme', () => {
    const ungated = styleSelectors(css).filter((selector) => !selector.includes(GATE))
    expect(ungated).toEqual([])
  })

  it('never binds Obsidian marker classes of the editor (they are for themes and plugins only)', () => {
    expect(css).not.toMatch(/\.(mod-cm6|is-live-preview|HyperMD-[\w-]+|cm-s-obsidian)\b/)
  })
})
