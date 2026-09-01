import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readPersonalWords,
  addPersonalWord,
  removePersonalWord,
  ignoreWordForSession,
  isIgnoredForSession,
  clearSessionIgnored,
} from './personal-dictionary'

const STORAGE_KEY = 'slatebase:spellcheck-personal'

describe('personal dictionary', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSessionIgnored()
  })

  describe('readPersonalWords', () => {
    it('returns an empty list when nothing was ever saved', () => {
      expect(readPersonalWords()).toEqual([])
    })

    it('reads back saved words', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['Slatebase', 'Zettelkasten']))
      expect(readPersonalWords()).toEqual(['Slatebase', 'Zettelkasten'])
    })

    it('returns an empty list for invalid JSON instead of throwing', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json{{{')
      expect(readPersonalWords()).toEqual([])
    })

    it('ignores non-string entries', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['gut', 42, null, '', 'auch gut']))
      expect(readPersonalWords()).toEqual(['gut', 'auch gut'])
    })

    it('returns an empty list when the stored value is not an array', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ words: ['x'] }))
      expect(readPersonalWords()).toEqual([])
    })
  })

  describe('addPersonalWord', () => {
    it('persists a new word and reports the change', () => {
      expect(addPersonalWord('Slatebase')).toBe(true)
      expect(readPersonalWords()).toEqual(['Slatebase'])
    })

    it('reports no change for a duplicate', () => {
      addPersonalWord('Slatebase')
      expect(addPersonalWord('Slatebase')).toBe(false)
      expect(readPersonalWords()).toEqual(['Slatebase'])
    })

    it('trims surrounding whitespace', () => {
      addPersonalWord('  Slatebase  ')
      expect(readPersonalWords()).toEqual(['Slatebase'])
    })

    it('rejects a blank word', () => {
      expect(addPersonalWord('   ')).toBe(false)
      expect(readPersonalWords()).toEqual([])
    })

    it('silently ignores localStorage write errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      expect(() => addPersonalWord('Slatebase')).not.toThrow()
      spy.mockRestore()
    })
  })

  describe('removePersonalWord', () => {
    it('removes a known word', () => {
      addPersonalWord('Slatebase')
      expect(removePersonalWord('Slatebase')).toBe(true)
      expect(readPersonalWords()).toEqual([])
    })

    it('reports no change for an unknown word', () => {
      expect(removePersonalWord('Unbekannt')).toBe(false)
    })
  })

  describe('session ignore list', () => {
    it('remembers an ignored word without persisting it', () => {
      ignoreWordForSession('Trotzdem')
      expect(isIgnoredForSession('Trotzdem')).toBe(true)
      expect(readPersonalWords()).toEqual([])
    })

    it('does not treat other words as ignored', () => {
      ignoreWordForSession('Trotzdem')
      expect(isIgnoredForSession('Anderes')).toBe(false)
    })
  })
})
