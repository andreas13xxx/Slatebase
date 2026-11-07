import { describe, it, expect } from 'vitest'
import { findHelpVault, helpVaultLanguage } from './helpVault'

describe('helpVaultLanguage', () => {
  it('recognizes the default welcome-vault names and their deduplicated variants', () => {
    expect(helpVaultLanguage('Willkommen')).toBe('de')
    expect(helpVaultLanguage('Welcome')).toBe('en')
    expect(helpVaultLanguage('Welcome (2)')).toBe('en')
  })

  it('rejects other vault names', () => {
    expect(helpVaultLanguage('Notes')).toBeNull()
    expect(helpVaultLanguage('Welcome back')).toBeNull()
    expect(helpVaultLanguage('Welcome (x)')).toBeNull()
  })
})

describe('findHelpVault', () => {
  const vaults = [
    { id: 'a', name: 'Notes' },
    { id: 'b', name: 'Welcome' },
    { id: 'c', name: 'Willkommen (2)' },
  ]

  it('prefers a welcome vault in the requested language', () => {
    expect(findHelpVault(vaults, 'de')).toEqual({ vault: vaults[2], language: 'de' })
    expect(findHelpVault(vaults, 'en')).toEqual({ vault: vaults[1], language: 'en' })
  })

  it('falls back to a welcome vault in another language', () => {
    expect(findHelpVault([vaults[0]!, vaults[1]!], 'de')).toEqual({ vault: vaults[1], language: 'en' })
  })

  it('returns null when the user has no welcome vault', () => {
    expect(findHelpVault([vaults[0]!], 'de')).toBeNull()
  })
})
