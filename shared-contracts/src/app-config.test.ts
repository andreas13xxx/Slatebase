import { describe, expect, it } from 'vitest'
import {
  APP_CONFIG_DEFAULTS,
  APP_CONFIG_KEYS,
  APP_CONFIG_KEY_NAMES,
  appConfigValueProblem,
  describeAppConfigDeviations,
  mergeAppConfig,
} from './app-config.js'

describe('app-config table', () => {
  it('has a default that satisfies its own spec for every key', () => {
    for (const key of APP_CONFIG_KEY_NAMES) {
      expect(appConfigValueProblem(key, APP_CONFIG_DEFAULTS[key]), key).toBeNull()
    }
  })

  it('matches the defaults proven by a real Obsidian file', () => {
    // The file contained alwaysUpdateLinks: true, readableLineLength: false, showLineNumber: true;
    // Obsidian writes only values that differ from its default.
    expect(APP_CONFIG_KEYS.alwaysUpdateLinks.default).toBe(false)
    expect(APP_CONFIG_KEYS.readableLineLength.default).toBe(true)
    expect(APP_CONFIG_KEYS.showLineNumber.default).toBe(false)
  })

  it('validates each kind', () => {
    expect(appConfigValueProblem('useTab', 'yes')).toMatch(/boolean/)
    expect(appConfigValueProblem('tabSize', 0)).toMatch(/from 1 to 16/)
    expect(appConfigValueProblem('tabSize', 2)).toBeNull()
    expect(appConfigValueProblem('newLinkFormat', 'foo')).toMatch(/shortest\|relative\|absolute/)
    expect(appConfigValueProblem('attachmentFolderPath', 'x'.repeat(1025))).toMatch(/longer/)
    expect(appConfigValueProblem('userIgnoreFilters', ['Meta/'])).toBeNull()
    expect(appConfigValueProblem('userIgnoreFilters', ['a', 3])).toMatch(/not a string/)
    expect(appConfigValueProblem('userIgnoreFilters', 'Meta/')).toMatch(/list/)
  })
})

describe('describeAppConfigDeviations', () => {
  it('accepts the real Obsidian file without a single deviation', () => {
    expect(describeAppConfigDeviations({
      attachmentFolderPath: '11 Anhänge',
      alwaysUpdateLinks: true,
      readableLineLength: false,
      mobilePullAction: 'graph:open',
      showLineNumber: true,
    })).toEqual([])
  })

  it('reports unknown keys, wrong types and enum values', () => {
    const found = describeAppConfigDeviations({ fancy: 1, spellcheck: 'on', newFileLocation: 'elsewhere' })
    expect(found.map((d) => d.key)).toEqual(['fancy', 'spellcheck', 'newFileLocation'])
    expect(found[2]?.reason).toContain('"elsewhere"')
  })

  it('shortens long values', () => {
    const [deviation] = describeAppConfigDeviations({ newLinkFormat: 'x'.repeat(200) })
    expect(deviation?.reason.length).toBeLessThan(200)
  })
})

describe('mergeAppConfig', () => {
  it('falls back to the default for invalid values and keeps unknown keys', () => {
    const merged = mergeAppConfig({ spellcheck: 'maybe', tabSize: 8, extra: { a: 1 } })
    expect(merged.spellcheck).toBe(true)
    expect(merged.tabSize).toBe(8)
    expect(merged.extra).toEqual({ a: 1 })
    expect(merged.alwaysUpdateLinks).toBe(false)
  })
})
