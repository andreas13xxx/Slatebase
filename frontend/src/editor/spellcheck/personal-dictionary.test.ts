import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readPersonalWords,
  addPersonalWord,
  removePersonalWord,
  ignoreWordForSession,
  isIgnoredForSession,
  initializePersonalDictionary,
  setActivePersonalDictionaryVault,
  subscribeToPersonalWords,
  resetPersonalDictionary,
} from './personal-dictionary'

vi.mock('../../components/ToastNotification', () => ({ showToast: vi.fn() }))
import { showToast } from '../../components/ToastNotification'

const LEGACY_KEY = 'slatebase:spellcheck-personal'
const cacheKey = (vaultId: string): string => `slatebase:spellcheck-personal:${vaultId}`

function createMockApi(initial: string[] = []) {
  let list = [...initial]
  return {
    getSpellcheckWords: vi.fn(async () => ({ words: [...list] })),
    addSpellcheckWords: vi.fn(async (_vaultId: string, words: string[]) => {
      list = [...new Set([...list, ...words])].sort()
      return { words: [...list] }
    }),
    removeSpellcheckWord: vi.fn(async (_vaultId: string, word: string) => {
      list = list.filter((entry) => entry !== word)
      return { words: [...list] }
    }),
  }
}

describe('personal dictionary', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPersonalDictionary()
    vi.mocked(showToast).mockClear()
  })

  describe('loading a vault', () => {
    it('is empty while no vault is active', () => {
      expect(readPersonalWords()).toEqual([])
    })

    it('takes the words from the server', async () => {
      initializePersonalDictionary(createMockApi(['Slatebase', 'Zettelkasten']))
      await setActivePersonalDictionaryVault('v1')
      expect(readPersonalWords()).toEqual(['Slatebase', 'Zettelkasten'])
    })

    it('treats an empty server answer as authoritative over the cache', async () => {
      localStorage.setItem(cacheKey('v1'), JSON.stringify(['Veraltet']))
      initializePersonalDictionary(createMockApi([]))
      await setActivePersonalDictionaryVault('v1')
      expect(readPersonalWords()).toEqual([])
    })

    it('shows the cached words before the server answers and keeps them if it fails', async () => {
      localStorage.setItem(cacheKey('v1'), JSON.stringify(['Zwischengespeichert']))
      const api = createMockApi()
      api.getSpellcheckWords.mockRejectedValueOnce(new Error('offline'))
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(readPersonalWords()).toEqual(['Zwischengespeichert'])
    })

    it('keeps vaults apart and notifies listeners on a switch', async () => {
      const listener = vi.fn()
      initializePersonalDictionary(createMockApi(['Eins']))
      subscribeToPersonalWords(listener)
      await setActivePersonalDictionaryVault('v1')
      listener.mockClear()
      await setActivePersonalDictionaryVault(null)
      expect(readPersonalWords()).toEqual([])
      expect(listener).toHaveBeenLastCalledWith([])
    })

    it('ignores corrupted cache content', async () => {
      localStorage.setItem(cacheKey('v1'), '{not json')
      await setActivePersonalDictionaryVault('v1')
      expect(readPersonalWords()).toEqual([])
    })

    it('drops a response for a vault that is no longer active', async () => {
      const api = createMockApi(['Alt'])
      let release: (value: { words: string[] }) => void = () => {}
      api.getSpellcheckWords.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      initializePersonalDictionary(api)
      const first = setActivePersonalDictionaryVault('v1')
      await setActivePersonalDictionaryVault('v2')
      release({ words: ['VonV1'] })
      await first
      expect(readPersonalWords()).toEqual(['Alt'])
    })
  })

  describe('addPersonalWord', () => {
    it('adds a word, caches it and writes it to the server', async () => {
      const api = createMockApi()
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(addPersonalWord('Slatebase')).toBe(true)
      expect(readPersonalWords()).toEqual(['Slatebase'])
      expect(api.addSpellcheckWords).toHaveBeenCalledWith('v1', ['Slatebase'])
      expect(JSON.parse(localStorage.getItem(cacheKey('v1')) ?? '[]')).toEqual(['Slatebase'])
    })

    it('does not add a duplicate', async () => {
      initializePersonalDictionary(createMockApi(['Slatebase']))
      await setActivePersonalDictionaryVault('v1')
      expect(addPersonalWord('Slatebase')).toBe(false)
    })

    it('trims and rejects blank words', async () => {
      initializePersonalDictionary(createMockApi())
      await setActivePersonalDictionaryVault('v1')
      expect(addPersonalWord('  Slatebase  ')).toBe(true)
      expect(readPersonalWords()).toEqual(['Slatebase'])
      expect(addPersonalWord('   ')).toBe(false)
    })

    it('adds nothing while no vault is active', () => {
      expect(addPersonalWord('Slatebase')).toBe(false)
    })

    it('rolls the word back and says so when the server write fails', async () => {
      const api = createMockApi()
      api.addSpellcheckWords.mockRejectedValueOnce(new Error('403'))
      const listener = vi.fn()
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      subscribeToPersonalWords(listener)
      expect(addPersonalWord('Slatebase')).toBe(true)
      await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)))
      expect(readPersonalWords()).toEqual([])
      expect(JSON.parse(localStorage.getItem(cacheKey('v1')) ?? 'null')).toEqual([])
      expect(listener).toHaveBeenCalledWith([])
    })

    it('rejects words the server would reject', async () => {
      const api = createMockApi()
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(addPersonalWord('zwei Wörter')).toBe(false)
      expect(addPersonalWord('x'.repeat(101))).toBe(false)
      expect(addPersonalWord('a\tb')).toBe(false)
      expect(api.addSpellcheckWords).not.toHaveBeenCalled()
    })

    it('keeps a word added while the server list is still loading', async () => {
      const api = createMockApi(['Schon'])
      let release: (value: { words: string[] }) => void = () => {}
      api.getSpellcheckWords.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      initializePersonalDictionary(api)
      const loading = setActivePersonalDictionaryVault('v1')
      addPersonalWord('Neu')
      release({ words: ['Schon'] })
      await loading
      expect(readPersonalWords().sort()).toEqual(['Neu', 'Schon'])
      expect(JSON.parse(localStorage.getItem(cacheKey('v1')) ?? '[]').sort()).toEqual(['Neu', 'Schon'])
    })

    it('keeps a removal made while the server list is still loading', async () => {
      localStorage.setItem(cacheKey('v1'), JSON.stringify(['Weg']))
      const api = createMockApi(['Weg', 'Bleibt'])
      let release: (value: { words: string[] }) => void = () => {}
      api.getSpellcheckWords.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      initializePersonalDictionary(api)
      const loading = setActivePersonalDictionaryVault('v1')
      removePersonalWord('Weg')
      release({ words: ['Weg', 'Bleibt'] })
      await loading
      expect(readPersonalWords()).toEqual(['Bleibt'])
    })
  })

  describe('removePersonalWord', () => {
    it('removes a word locally and on the server', async () => {
      const api = createMockApi(['Slatebase'])
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(removePersonalWord('Slatebase')).toBe(true)
      expect(readPersonalWords()).toEqual([])
      expect(api.removeSpellcheckWord).toHaveBeenCalledWith('v1', 'Slatebase')
    })

    it('puts the word back when the server write fails', async () => {
      const api = createMockApi(['Slatebase'])
      api.removeSpellcheckWord.mockRejectedValueOnce(new Error('500'))
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      removePersonalWord('Slatebase')
      await vi.waitFor(() => expect(readPersonalWords()).toEqual(['Slatebase']))
      expect(showToast).toHaveBeenCalled()
    })

    it('returns false for an unknown word', async () => {
      initializePersonalDictionary(createMockApi())
      await setActivePersonalDictionaryVault('v1')
      expect(removePersonalWord('Unbekannt')).toBe(false)
    })
  })

  describe('migration of the old device-wide list', () => {
    it('uploads it into the first vault opened and deletes the old key', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(['Alt', 'Wort']))
      const api = createMockApi(['Schon'])
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(api.addSpellcheckWords).toHaveBeenCalledWith('v1', ['Alt', 'Wort'])
      expect(readPersonalWords()).toEqual(['Alt', 'Schon', 'Wort'])
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('keeps the old key when the upload fails', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(['Alt']))
      const api = createMockApi(['Schon'])
      api.addSpellcheckWords.mockRejectedValueOnce(new Error('403'))
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(readPersonalWords()).toEqual(['Schon'])
      expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull()
    })

    it('leaves out entries the server would reject, so the rest still arrives', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(['Gut', 'zwei Wörter', 'Gut', 'x'.repeat(101)]))
      const api = createMockApi()
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(api.addSpellcheckWords).toHaveBeenCalledWith('v1', ['Gut'])
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('tries the upload once per session, not on every vault switch', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(['Alt']))
      const api = createMockApi()
      api.addSpellcheckWords.mockRejectedValue(new Error('403'))
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      await setActivePersonalDictionaryVault('v2')
      await setActivePersonalDictionaryVault('v3')
      expect(api.addSpellcheckWords).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull()
    })

    it('does not migrate when the server could not be reached', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(['Alt']))
      const api = createMockApi()
      api.getSpellcheckWords.mockRejectedValueOnce(new Error('offline'))
      initializePersonalDictionary(api)
      await setActivePersonalDictionaryVault('v1')
      expect(api.addSpellcheckWords).not.toHaveBeenCalled()
      expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull()
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
