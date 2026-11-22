import { describe, it, expect } from 'vitest'
import { SETTINGS_SEARCH_KEYS, sectionContentMatches } from './settingsSearchIndex'
import { SETTINGS_SECTIONS } from './settingsRegistry'
import { translateNow } from '../i18n'

describe('settings search index', () => {
  it('covers every registered section', () => {
    for (const def of SETTINGS_SECTIONS) {
      expect(SETTINGS_SEARCH_KEYS[def.id].length).toBeGreaterThan(0)
    }
  })

  it('only lists keys that resolve to a translation', () => {
    for (const keys of Object.values(SETTINGS_SEARCH_KEYS)) {
      for (const key of keys) expect(translateNow(key)).not.toBe(key)
    }
  })

  it('finds a single setting inside its section', () => {
    expect(sectionContentMatches('editor-files', 'zeilennummern')).toBe(true)
    expect(sectionContentMatches('password', 'zeilennummern')).toBe(false)
  })
})
