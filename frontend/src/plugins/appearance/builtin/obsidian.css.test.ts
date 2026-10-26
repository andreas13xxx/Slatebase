import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_OBSIDIAN_THEME_ID } from '../builtin-themes'

// `?raw` imports are empty in jsdom, so the stylesheet is read from the package root.
const css = readFileSync(resolve(process.cwd(), 'src/plugins/appearance/builtin/obsidian.css'), 'utf-8')
const GATE = `:root[data-obsidian-theme="${BUILTIN_OBSIDIAN_THEME_ID}"]`

/** Splits a selector list at its top-level commas (the commas inside `:is(...)` and `:not(...)` stay). */
function splitSelectorList(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current.trim())
  return parts.filter((part) => part !== '')
}

/** Selectors of every style rule (at any @-rule depth), one entry per comma-separated selector. */
function styleSelectors(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  let prelude = ''
  for (const char of stripped) {
    if (char === '{') {
      const text = prelude.trim()
      if (text !== '' && !text.startsWith('@')) selectors.push(...splitSelectorList(text))
      prelude = ''
    } else if (char === '}' || char === ';') {
      prelude = ''
    } else {
      prelude += char
    }
  }
  return selectors
}

/** Declarations of the rule whose selector is exactly `selector` (top level), merged across repeated rules. */
function declarationsOf(selector: string): Map<string, string> {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const declarations = new Map<string, string>()
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  for (const match of stripped.matchAll(rulePattern)) {
    if ((match[1] ?? '').trim() !== selector) continue
    for (const declaration of (match[2] ?? '').split(';')) {
      const colon = declaration.indexOf(':')
      if (colon > 0) declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim())
    }
  }
  return declarations
}

const LIGHT = declarationsOf(`${GATE} body`)
const DARK = declarationsOf(`${GATE} body.theme-dark`)

describe('built-in Obsidian theme stylesheet', () => {
  it('gates every rule on the theme marker, so nothing applies without the theme', () => {
    const ungated = styleSelectors(css).filter((selector) => !selector.includes(GATE))
    expect(ungated).toEqual([])
  })

  it('never binds Obsidian marker classes of the editor (they are for themes and plugins only)', () => {
    expect(css).not.toMatch(/\.(mod-cm6|is-live-preview|HyperMD-[\w-]+|cm-s-obsidian)\b/)
  })

  describe('measured values (Obsidian 1.14.5)', () => {
    it('uses the default accent and derives its shades per mode', () => {
      expect(LIGHT.get('--accent-h')).toBe('258')
      expect(LIGHT.get('--accent-s')).toBe('88%')
      expect(LIGHT.get('--accent-l')).toBe('66%')
      // Light: controls use the first shade, text the plain accent. Dark: the other way round, one shade up.
      expect(LIGHT.get('--interactive-accent')).toBe('var(--color-accent-1)')
      expect(LIGHT.get('--text-accent')).toBe('var(--color-accent)')
      expect(DARK.get('--interactive-accent')).toBe('var(--color-accent)')
      expect(DARK.get('--text-accent')).toBe('var(--color-accent-1)')
      expect(DARK.get('--color-accent-1')).toContain('calc(var(--accent-h) - 3)')
      expect(DARK.get('--color-accent-2')).toContain('calc(var(--accent-h) - 5)')
    })

    it('has the extended colors of both modes', () => {
      expect([LIGHT.get('--color-red'), DARK.get('--color-red')]).toEqual(['#e93147', '#fb464c'])
      expect([LIGHT.get('--color-blue'), DARK.get('--color-blue')]).toEqual(['#086ddd', '#027aff'])
      expect([LIGHT.get('--color-purple'), DARK.get('--color-purple')]).toEqual(['#7852ee', '#a882ff'])
      expect([LIGHT.get('--mono-100'), DARK.get('--mono-100')]).toEqual(['black', 'white'])
    })

    it('mixes hover and selection fills from --mono-100 so one rule serves both modes', () => {
      expect(LIGHT.get('--background-modifier-hover')).toBe('color-mix(in oklch, var(--mono-100) 6.7%, transparent)')
      expect(DARK.has('--background-modifier-hover')).toBe(false)
      expect(LIGHT.get('--nav-item-background-active')).toBe('var(--background-modifier-hover)')
    })

    it('uses the system font stack, not Inter first', () => {
      expect(LIGHT.get('--font-default')?.startsWith('ui-sans-serif, -apple-system')).toBe(true)
      expect(LIGHT.get('--font-interface')).toBe('var(--font-default)')
      expect(LIGHT.get('--font-text')).toBe('var(--font-default)')
      expect(LIGHT.get('--font-monospace-default')?.startsWith('ui-monospace')).toBe(true)
    })

    it('has the radii, sizes and chrome dimensions of the reference', () => {
      expect([LIGHT.get('--radius-s'), LIGHT.get('--radius-m'), LIGHT.get('--radius-l'), LIGHT.get('--radius-xl')])
        .toEqual(['4px', '8px', '12px', '24px'])
      expect(LIGHT.get('--ribbon-width')).toBe('44px')
      expect(LIGHT.get('--header-height')).toBe('40px')
      expect(LIGHT.get('--tab-radius-active')).toBe('10px 10px 0 0')
      expect(LIGHT.get('--status-bar-radius')).toBe('8px 0 0 0')
      expect(LIGHT.get('--prompt-width')).toBe('700px')
      expect(LIGHT.get('--file-line-width')).toBe('700px')
    })

    it('only sets dark shadows and blend modes in the dark block', () => {
      expect(DARK.get('--callout-blend-mode')).toBe('lighten')
      expect(LIGHT.get('--callout-blend-mode')).toBe('darken')
      expect(DARK.get('--shadow-s')).toContain('rgba(0, 0, 0, 0.3)')
      expect(DARK.get('--text-selection')).toContain('33%')
    })
  })

  describe('content (Phase 3)', () => {
    it('has the measured heading scale', () => {
      const sizes = ['--h1-size', '--h2-size', '--h3-size', '--h4-size', '--h5-size', '--h6-size'].map((name) => LIGHT.get(name))
      expect(sizes).toEqual(['1.618em', '1.462em', '1.318em', '1.188em', '1.076em', '1em'])
      const weights = ['--h1-weight', '--h2-weight', '--h3-weight', '--h4-weight', '--h5-weight', '--h6-weight'].map((name) => LIGHT.get(name))
      expect(weights).toEqual(['700', '680', '660', '640', '620', '600'])
      expect(LIGHT.get('--h1-letter-spacing')).toBe('-0.015em')
      expect(LIGHT.get('--h3-line-height')).toBe('1.3')
    })

    it('styles the reading view headings and the Live Preview headings with the same variables', () => {
      expect(css).toContain('.view-mode h1 { font-size: var(--h1-size)')
      expect(css).toContain('.cm-lp-h1 { letter-spacing: var(--h1-letter-spacing); }')
    })

    it('colors every Slatebase callout type in both views', () => {
      const types = ['note', 'info', 'tip', 'warning', 'danger', 'bug', 'example', 'quote', 'success', 'question', 'failure', 'abstract', 'todo']
      for (const type of types) {
        expect(css).toContain(`.view-mode-callout--${type}, .cm-lp-callout-${type}`)
      }
    })
  })

  describe('chrome (Phase 4)', () => {
    it('floats the status bar bottom right like Obsidian', () => {
      expect(css).toMatch(/\.status-bar \{[^}]*position: var\(--status-bar-position\)/)
      expect(LIGHT.get('--status-bar-position')).toBe('fixed')
      expect(LIGHT.get('--status-bar-radius')).toBe('8px 0 0 0')
    })

    it('rounds controls as squircles only where corner-shape is supported', () => {
      const unguarded = css.replace(/@supports[^{]*\{[\s\S]*?\n\}\n/g, '')
      expect(unguarded).not.toMatch(/(?<!-)corner-shape:/)
      expect(css).toContain('@supports (corner-shape: superellipse(1.33))')
      // Every variable the guarded rules read must exist, or `corner-shape: var(--x)` silently does nothing.
      for (const name of css.match(/corner-shape: var\((--[\w-]+)\)/g) ?? []) {
        expect(LIGHT.has(name.replace('corner-shape: var(', '').replace(')', ''))).toBe(true)
      }
    })

    it('does not select Obsidian workspace classes (they have no effect in Slatebase)', () => {
      expect(css).not.toMatch(/\.(workspace-[\w-]+|view-header|nav-file-title|side-dock-[\w-]+)\b/)
    })
  })
})
