import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// `?raw` yields an empty string for CSS under Vitest, and `import.meta.url` is not a file URL in jsdom;
// tests run with the package root as cwd.
const read = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8')

const bridge = read('src/plugins/appearance/theme-bridge.css')
const compat = read('src/plugins/compat/obsidian-compat.css')
const tokens = read('src/index.css')

/** Returns the declaration body of the first rule whose selector starts with `selector`. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `selector not found: ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1] as string, (m[2] as string).trim())
  }
  return map
}

/** Slatebase token → Obsidian variable it follows while a theme is active. */
const BRIDGE: ReadonlyArray<readonly [string, string]> = [
  ['--bg-base', '--background-primary'],
  ['--bg-surface', '--background-secondary'],
  ['--bg-elevated', '--background-secondary-alt'],
  ['--bg-overlay', '--background-modifier-cover'],
  ['--text-primary', '--text-normal'],
  ['--text-secondary', '--text-muted'],
  ['--text-subtle', '--text-faint'],
  ['--border-subtle', '--divider-color'],
  ['--border-default', '--background-modifier-border'],
  ['--border-strong', '--background-modifier-border-hover'],
  ['--accent', '--interactive-accent'],
  ['--accent-hover', '--interactive-accent-hover'],
  ['--accent-text', '--text-accent'],
  ['--sidebar-bg', '--background-secondary'],
  ['--sidebar-text', '--text-muted'],
  ['--sidebar-text-active', '--text-normal'],
  ['--sidebar-border', '--background-modifier-border'],
  ['--right-panel-bg', '--background-secondary'],
  ['--right-panel-border', '--background-modifier-border'],
  ['--right-panel-text', '--text-normal'],
  ['--right-panel-text-muted', '--text-muted'],
  ['--status-bar-bg', '--background-secondary'],
  ['--status-bar-border', '--background-modifier-border'],
  ['--status-bar-text', '--text-muted'],
  ['--font-sans', '--font-interface'],
  ['--font-mono', '--font-monospace'],
]

/** Pairs whose light default is not byte-identical to Slatebase's (cosmetic only). */
const LIGHT_DEFAULT_DIFFERS = new Set(['--bg-overlay'])

describe('theme bridge', () => {
  const bridged = declarations(ruleBody(bridge, '\n:root[data-obsidian-theme] body {'))
  const compatLight = declarations(ruleBody(compat, '\n:root {'))
  const slatebaseLight = declarations(ruleBody(tokens, '\n:root {'))

  it.each(BRIDGE)('%s follows %s', (token, obsidianVar) => {
    expect(bridged.get(token)).toBe(`var(${obsidianVar})`)
  })

  it('derives --accent-light from the accent so a theme tint flows through', () => {
    expect(bridged.get('--accent-light')).toContain('var(--interactive-accent)')
  })

  it('references only Obsidian variables that the compat layer defines', () => {
    for (const [, obsidianVar] of BRIDGE) {
      expect(compat, `${obsidianVar} missing in obsidian-compat.css`).toMatch(
        new RegExp(`\\n\\s*${obsidianVar}:`),
      )
    }
  })

  it('is gated on the theme marker (no ungated rule can change the default look)', () => {
    const selectors = [...bridge.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((m) =>
      (m[1] as string).trim(),
    )
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(
        selector.startsWith(':root[data-obsidian-theme]') || selector.startsWith(':where(:root[data-obsidian-theme]'),
        selector,
      ).toBe(true)
    }
  })

  it('does not declare the bridged tokens on :root (cycle-free by element)', () => {
    for (const [token] of BRIDGE) {
      expect(bridge).not.toMatch(new RegExp(`:root\\[data-obsidian-theme\\]\\s*\\{[^}]*${token}:`))
    }
  })

  it('moves the editor surface to the primary background while a theme is active', () => {
    expect(ruleBody(bridge, ':root[data-obsidian-theme] .cm-editor {')).toContain('var(--background-primary)')
  })

  it('keeps the compat defaults equal to Slatebase\'s light values (so a theme that sets nothing changes nothing)', () => {
    for (const [token, obsidianVar] of BRIDGE) {
      if (LIGHT_DEFAULT_DIFFERS.has(token)) continue
      if (token === '--font-sans' || token === '--font-mono') continue // compat aliases these back
      if (/^--(sidebar|right-panel|status-bar)-/.test(token)) continue // panel tokens are not part of the default-parity contract
      expect(compatLight.get(obsidianVar), `${obsidianVar} vs ${token}`).toBe(slatebaseLight.get(token))
    }
  })

  it('binds heading typography to the Obsidian heading variables', () => {
    for (let level = 1; level <= 6; level += 1) {
      const body = ruleBody(bridge, `:root[data-obsidian-theme] .cm-lp-h${level} `)
      expect(body).toContain(`var(--h${level}-size)`)
      expect(body).toContain(`var(--h${level}-color)`)
      for (const suffix of ['size', 'color', 'weight', 'line-height', 'font']) {
        expect(compat, `--h${level}-${suffix}`).toMatch(new RegExp(`\\n\\s*--h${level}-${suffix}:`))
      }
    }
  })

  describe('base scale and semantic derivation (themes that only set --color-base-*)', () => {
    /** Obsidian's documented defaults: docs → CSS variables → Foundations → Colors. */
    const DOCS_LIGHT: Record<string, string> = {
      '00': '#ffffff', '05': '#fcfcfc', '10': '#fafafa', '20': '#f6f6f6', '25': '#efefef', '30': '#e4e4e4',
      '35': '#dadada', '40': '#bdbdbd', '50': '#ababab', '60': '#707070', '70': '#5c5c5c', '100': '#222222',
    }
    const DOCS_DARK: Record<string, string> = {
      '00': '#1c1c1c', '05': '#212121', '10': '#232323', '20': '#282828', '25': '#2e2e2e', '30': '#333333',
      '35': '#3f3f3f', '40': '#555555', '50': '#666666', '60': '#999999', '70': '#b3b3b3', '100': '#dadada',
    }

    it.each([
      [':where(:root[data-obsidian-theme] body) {', DOCS_LIGHT],
      [':where(:root[data-obsidian-theme] body.theme-dark) {', DOCS_DARK],
    ] as const)('%s uses the documented Obsidian base colors', (selector, expected) => {
      const found = declarations(ruleBody(bridge, selector))
      for (const [step, value] of Object.entries(expected)) {
        expect(found.get(`--color-base-${step}`), `--color-base-${step}`).toBe(value)
      }
    })

    it('derives the semantic surface, text and accent variables from the base scale', () => {
      const derived = declarations(ruleBody(bridge, ':where(:root[data-obsidian-theme] body) {\n  --background-primary'))
      expect(Object.fromEntries(derived)).toMatchObject({
        '--background-primary': 'var(--color-base-00)',
        '--background-primary-alt': 'var(--color-base-10)',
        '--background-secondary': 'var(--color-base-20)',
        '--background-modifier-border': 'var(--color-base-30)',
        '--text-normal': 'var(--color-base-100)',
        '--text-muted': 'var(--color-base-70)',
        '--text-faint': 'var(--color-base-50)',
        '--text-accent': 'var(--color-accent)',
        '--interactive-accent': 'var(--color-accent)',
      })
    })

    it('keeps specificity at zero so any theme rule for body/.theme-* wins', () => {
      const defaults = bridge.match(/(^|\n)(:where\(:root\[data-obsidian-theme\][^{]*)\{/g) ?? []
      expect(defaults.length).toBeGreaterThanOrEqual(3)
      for (const rule of defaults) {
        expect(rule.trim().startsWith(':where(') && rule.trim().endsWith(') {'), rule).toBe(true)
      }
    })
  })
})
