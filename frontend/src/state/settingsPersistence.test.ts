import { describe, it, expect, beforeEach, vi } from 'vitest'
import { persistSettingsNav, restoreSettingsNav } from './settingsPersistence'
import { SETTINGS_NAV_KEY, type SettingsNavState } from './settingsState'

describe('settingsPersistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  describe('persistSettingsNav', () => {
    it('writes category, section, and selectedVaultId to sessionStorage', () => {
      const state: SettingsNavState = {
        category: 'account',
        section: 'profile',
        selectedVaultId: null,
        searchQuery: '',
        mobileNavOpen: false,
      }

      persistSettingsNav(state)

      const stored = sessionStorage.getItem(SETTINGS_NAV_KEY)
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed).toEqual({
        category: 'account',
        section: 'profile',
        selectedVaultId: null,
      })
    })

    it('does NOT persist searchQuery or mobileNavOpen (ephemeral fields)', () => {
      const state: SettingsNavState = {
        category: 'vault',
        section: 'sync',
        selectedVaultId: 'vault-123',
        searchQuery: 'test query',
        mobileNavOpen: true,
      }

      persistSettingsNav(state)

      const stored = sessionStorage.getItem(SETTINGS_NAV_KEY)
      const parsed = JSON.parse(stored!)
      expect(parsed).not.toHaveProperty('searchQuery')
      expect(parsed).not.toHaveProperty('mobileNavOpen')
    })

    it('persists selectedVaultId when set', () => {
      const state: SettingsNavState = {
        category: 'vault',
        section: 'plugins',
        selectedVaultId: 'abc123',
        searchQuery: '',
        mobileNavOpen: false,
      }

      persistSettingsNav(state)

      const parsed = JSON.parse(sessionStorage.getItem(SETTINGS_NAV_KEY)!)
      expect(parsed.selectedVaultId).toBe('abc123')
    })

    it('gracefully handles sessionStorage errors (no throw)', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })

      const state: SettingsNavState = {
        category: 'account',
        section: 'profile',
        selectedVaultId: null,
        searchQuery: '',
        mobileNavOpen: false,
      }

      expect(() => persistSettingsNav(state)).not.toThrow()

      setItemSpy.mockRestore()
    })
  })

  describe('restoreSettingsNav', () => {
    it('returns a valid SettingsNavState for valid persisted data', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'account',
        section: 'sessions',
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(false, [])
      expect(result).toEqual({
        category: 'account',
        section: 'sessions',
        selectedVaultId: null,
        searchQuery: '',
        mobileNavOpen: false,
      })
    })

    it('round-trip: persist → restore produces equivalent state', () => {
      const state: SettingsNavState = {
        category: 'vault',
        section: 'sync',
        selectedVaultId: 'vault-1',
        searchQuery: 'ignored',
        mobileNavOpen: true,
      }

      persistSettingsNav(state)
      const result = restoreSettingsNav(false, ['vault-1'])

      expect(result).not.toBeNull()
      expect(result!.category).toBe('vault')
      expect(result!.section).toBe('sync')
      expect(result!.selectedVaultId).toBe('vault-1')
      // Ephemeral fields reset to defaults
      expect(result!.searchQuery).toBe('')
      expect(result!.mobileNavOpen).toBe(false)
    })

    it('returns null when no data is stored', () => {
      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, 'not-valid-json{{{')

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('returns null for invalid category', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'unknown-category',
        section: 'profile',
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(true, [])
      expect(result).toBeNull()
    })

    it('returns null for section that does not belong to category', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'account',
        section: 'sync', // sync belongs to vault, not account
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(true, [])
      expect(result).toBeNull()
    })

    it('returns null for administration category when isAdmin is false', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'administration',
        section: 'server-config',
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('allows administration category when isAdmin is true', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'administration',
        section: 'user-management',
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(true, [])
      expect(result).not.toBeNull()
      expect(result!.category).toBe('administration')
      expect(result!.section).toBe('user-management')
    })

    it('sets selectedVaultId to null when not in vaultIds', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'vault',
        section: 'plugins',
        selectedVaultId: 'deleted-vault',
      }))

      const result = restoreSettingsNav(false, ['vault-a', 'vault-b'])
      expect(result).not.toBeNull()
      expect(result!.selectedVaultId).toBeNull()
    })

    it('preserves selectedVaultId when present in vaultIds', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'vault',
        section: 'sync',
        selectedVaultId: 'vault-b',
      }))

      const result = restoreSettingsNav(false, ['vault-a', 'vault-b'])
      expect(result).not.toBeNull()
      expect(result!.selectedVaultId).toBe('vault-b')
    })

    it('gracefully handles sessionStorage getItem error', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError')
      })

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()

      getItemSpy.mockRestore()
    })

    it('returns null for non-object persisted data (array)', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify(['account', 'profile']))

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('returns null for non-object persisted data (string)', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify('account'))

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('returns null for non-object persisted data (null)', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, 'null')

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('returns null when section is not a string', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: 'account',
        section: 123,
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })

    it('returns null when category is not a string', () => {
      sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify({
        category: true,
        section: 'profile',
        selectedVaultId: null,
      }))

      const result = restoreSettingsNav(false, [])
      expect(result).toBeNull()
    })
  })
})
