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
  ['--font-sans', '--font-interface'],
  ['--font-mono', '--font-monospace'],
]

/** Pairs whose light default is not byte-identical to Slatebase's (cosmetic only). */
const LIGHT_DEFAULT_DIFFERS = new Set(['--bg-overlay'])

describe('theme bridge', () => {
  const bridged = declarations(ruleBody(bridge, ':root[data-obsidian-theme] body'))
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
      expect(selector.startsWith(':root[data-obsidian-theme]'), selector).toBe(true)
    }
  })

  it('does not declare the bridged tokens on :root (cycle-free by element)', () => {
    for (const [token] of BRIDGE) {
      expect(bridge).not.toMatch(new RegExp(`:root\\[data-obsidian-theme\\]\\s*\\{[^}]*${token}:`))
    }
  })

  it('keeps the compat defaults equal to Slatebase\'s light values (so a theme that sets nothing changes nothing)', () => {
    for (const [token, obsidianVar] of BRIDGE) {
      if (LIGHT_DEFAULT_DIFFERS.has(token)) continue
      if (token === '--font-sans' || token === '--font-mono') continue // compat aliases these back
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
})
