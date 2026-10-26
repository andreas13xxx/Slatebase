import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_OBSIDIAN_THEME_ID, BUILTIN_THEMES, isBuiltinThemeId } from './builtin-themes'

describe('built-in themes', () => {
  it('recognises only the ids it lists', () => {
    expect(isBuiltinThemeId(BUILTIN_OBSIDIAN_THEME_ID)).toBe(true)
    expect(isBuiltinThemeId('Things')).toBe(false)
    expect(isBuiltinThemeId('')).toBe(false)
    expect(isBuiltinThemeId(null)).toBe(false)
  })

  it('lists each id once and never as a possible theme folder name', () => {
    const ids = BUILTIN_THEMES.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Installed theme ids start alphanumeric and have no colon (backend isValidThemeId), so the two can never collide.
    for (const id of ids) expect(id).toMatch(/^builtin:[a-z0-9-]+$/)
  })

  // The backend accepts exactly the ids in its own list; if the two packages drift apart, selecting a theme fails with a 400
  // or stores an id the frontend cannot show. They are separate packages without shared code, so the source is compared.
  it('lists the same ids as the backend allowlist', () => {
    const source = readFileSync(resolve(process.cwd(), '../backend/src/themes/validation.ts'), 'utf-8')
    const constant = /BUILTIN_OBSIDIAN_THEME_ID = '([^']+)'/.exec(source)?.[1]
    const list = /BUILTIN_THEME_IDS: readonly string\[\] = \[([^\]]*)\]/.exec(source)?.[1]
    expect(constant).toBe(BUILTIN_OBSIDIAN_THEME_ID)
    expect(list?.split(',').map((entry) => entry.trim()).filter((entry) => entry !== ''))
      .toEqual(['BUILTIN_OBSIDIAN_THEME_ID'])
    expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual([constant])
  })
})
