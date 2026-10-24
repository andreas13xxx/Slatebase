import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// `?raw` yields an empty string for CSS under Vitest, and `import.meta.url` is not a file URL in jsdom;
// tests run with the package root as cwd.
const css = readFileSync(resolve(process.cwd(), 'src/plugins/compat/obsidian-compat.css'), 'utf8')

/** Returns the declarations of the first rule whose selector is exactly `body`. */
function bodyBlock(): string {
  const match = /(^|\n)body\s*\{([^}]*)\}/.exec(css)
  expect(match).not.toBeNull()
  return match?.[2] ?? ''
}

describe('obsidian-compat derived aliases', () => {
  const block = bodyBlock()

  it.each([
    '--color-accent-hsl',
    '--text-highlight-bg-rgb',
    '--nav-parent-item-color',
    '--nav-parent-item-color-active',
    '--nav-parent-item-weight',
    '--nav-collapse-icon-color-hover',
    '--bases-table-border-color',
    '--bases-table-header-color',
    '--bases-table-header-background',
    '--bases-table-header-background-hover',
    '--bases-table-header-weight',
    '--bases-table-text-size',
    '--dropdown-background',
    '--dropdown-background-hover',
    '--h1-color',
    '--h2-color',
    '--h3-color',
    '--h4-color',
    '--h5-color',
    '--h6-color',
  ])('declares %s on body', (name) => {
    expect(block).toContain(`${name}:`)
  })

  it('only aliases variables that are defined elsewhere in the file', () => {
    const referenced = [...block.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1] as string)
    expect(referenced.length).toBeGreaterThan(0)
    for (const name of referenced) {
      expect(css, `${name} is not defined`).toMatch(new RegExp(`\\n\\s*${name}:`))
    }
  })
})
