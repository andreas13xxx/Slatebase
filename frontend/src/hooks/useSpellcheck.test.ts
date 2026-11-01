import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dictionaryForCode, getSpellcheckLanguage, setSpellcheckLanguage, vaultSpellcheckLanguage } from './useSpellcheck'
import { _reset, initialize, setActiveVault } from '../state/vaultAppConfigStore'
import type { IApiClient } from '../api'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

async function withFile(file: Record<string, unknown>) {
  _reset()
  const state = { file: { ...file } }
  const client = {
    getAppConfig: vi.fn(async () => ({ ...state.file })),
    patchAppConfig: vi.fn(async (_v: string, patch: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete state.file[key]
        else state.file[key] = value
      }
      return { ...state.file }
    }),
  }
  initialize(client as unknown as IApiClient)
  await setActiveVault('v1')
  return client
}

describe('dictionaryForCode', () => {
  it('takes the language before the region, in any spelling', () => {
    expect(dictionaryForCode('en-US')).toBe('en')
    expect(dictionaryForCode('de_DE')).toBe('de')
    expect(dictionaryForCode(' DE ')).toBe('de')
  })

  it('knows no dictionary for other languages', () => {
    expect(dictionaryForCode('fr')).toBeNull()
    expect(dictionaryForCode('')).toBeNull()
  })
})

describe('vaultSpellcheckLanguage', () => {
  it('uses the first entry Slatebase has a dictionary for', () => {
    expect(vaultSpellcheckLanguage(['fr', 'en-GB', 'de'])).toBe('en')
    expect(vaultSpellcheckLanguage(['fr'])).toBeNull()
    expect(vaultSpellcheckLanguage([])).toBeNull()
  })
})

describe('the dictionary in use', () => {
  beforeEach(() => { localStorage.clear() })

  it('is the vault file\'s when it names one, else the personal choice', async () => {
    await withFile({ spellcheckLanguages: ['en-US'] })
    expect(getSpellcheckLanguage()).toBe('en')

    await withFile({ spellcheckLanguages: ['fr'] })
    expect(getSpellcheckLanguage()).toBe('de') // the personal default
  })

  it('switching writes into the file and keeps the other entries, when the file names a dictionary', async () => {
    const client = await withFile({ spellcheckLanguages: ['fr', 'de-DE'] })

    setSpellcheckLanguage('en')

    await vi.waitFor(() => expect(client.patchAppConfig).toHaveBeenCalledWith('v1', { spellcheckLanguages: ['fr', 'en'] }))
  })

  it('writes nothing when the file already has that language', async () => {
    const client = await withFile({ spellcheckLanguages: ['en-US'] })
    setSpellcheckLanguage('en')
    expect(client.patchAppConfig).not.toHaveBeenCalled()
  })

  it('is the personal choice when the file names none', async () => {
    const client = await withFile({})
    setSpellcheckLanguage('en')
    expect(client.patchAppConfig).not.toHaveBeenCalled()
  })
})
