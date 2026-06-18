import { describe, it, expect } from 'vitest'
import {
  createSettingsReducer,
  initialSettingsState,
  SETTINGS_NAV_KEY,
  type SettingsNavState,
} from './settingsState'

describe('settingsState', () => {
  describe('initialSettingsState', () => {
    it('defaults to account category with profile section', () => {
      expect(initialSettingsState.category).toBe('account')
      expect(initialSettingsState.section).toBe('profile')
    })

    it('has no vault selected', () => {
      expect(initialSettingsState.selectedVaultId).toBeNull()
    })

    it('has empty search query', () => {
      expect(initialSettingsState.searchQuery).toBe('')
    })

    it('has mobile nav closed', () => {
      expect(initialSettingsState.mobileNavOpen).toBe(false)
    })
  })

  describe('SETTINGS_NAV_KEY', () => {
    it('equals expected storage key', () => {
      expect(SETTINGS_NAV_KEY).toBe('slatebase-settings-nav')
    })
  })

  describe('settingsReducer — NAVIGATE', () => {
    const reducer = createSettingsReducer(false)
    const adminReducer = createSettingsReducer(true)

    it('navigates to a valid category and section', () => {
      const result = reducer(initialSettingsState, {
        type: 'NAVIGATE',
        payload: { category: 'vault', section: 'sync' },
      })
      expect(result.category).toBe('vault')
      expect(result.section).toBe('sync')
    })

    it('navigates to admin section when user is admin', () => {
      const result = adminReducer(initialSettingsState, {
        type: 'NAVIGATE',
        payload: { category: 'administration', section: 'user-management' },
      })
      expect(result.category).toBe('administration')
      expect(result.section).toBe('user-management')
    })

    it('falls back to account/profile when non-admin navigates to admin section', () => {
      const result = reducer(initialSettingsState, {
        type: 'NAVIGATE',
        payload: { category: 'administration', section: 'server-config' },
      })
      expect(result.category).toBe('account')
      expect(result.section).toBe('profile')
    })

    it('falls back to first section when section does not belong to category', () => {
      const result = reducer(initialSettingsState, {
        type: 'NAVIGATE',
        payload: { category: 'account', section: 'sync' },
      })
      expect(result.category).toBe('account')
      expect(result.section).toBe('profile')
    })

    it('falls back to first admin section when admin section is mismatched', () => {
      const result = adminReducer(initialSettingsState, {
        type: 'NAVIGATE',
        payload: { category: 'administration', section: 'profile' },
      })
      expect(result.category).toBe('administration')
      expect(result.section).toBe('server-config')
    })

    it('auto-closes mobile nav on navigation', () => {
      const state: SettingsNavState = { ...initialSettingsState, mobileNavOpen: true }
      const result = reducer(state, {
        type: 'NAVIGATE',
        payload: { category: 'account', section: 'sessions' },
      })
      expect(result.mobileNavOpen).toBe(false)
    })

    it('preserves searchQuery on navigation', () => {
      const state: SettingsNavState = { ...initialSettingsState, searchQuery: 'profil' }
      const result = reducer(state, {
        type: 'NAVIGATE',
        payload: { category: 'account', section: 'sessions' },
      })
      expect(result.searchQuery).toBe('profil')
    })

    it('preserves selectedVaultId on navigation', () => {
      const state: SettingsNavState = { ...initialSettingsState, selectedVaultId: 'abc123' }
      const result = reducer(state, {
        type: 'NAVIGATE',
        payload: { category: 'vault', section: 'plugins' },
      })
      expect(result.selectedVaultId).toBe('abc123')
    })
  })

  describe('settingsReducer — SELECT_VAULT', () => {
    const reducer = createSettingsReducer(false)

    it('sets selectedVaultId', () => {
      const result = reducer(initialSettingsState, {
        type: 'SELECT_VAULT',
        payload: { vaultId: 'vault-123' },
      })
      expect(result.selectedVaultId).toBe('vault-123')
    })

    it('clears selectedVaultId when null', () => {
      const state: SettingsNavState = { ...initialSettingsState, selectedVaultId: 'vault-123' }
      const result = reducer(state, {
        type: 'SELECT_VAULT',
        payload: { vaultId: null },
      })
      expect(result.selectedVaultId).toBeNull()
    })

    it('does not affect other state fields', () => {
      const state: SettingsNavState = {
        ...initialSettingsState,
        category: 'vault',
        section: 'sync',
        searchQuery: 'test',
        mobileNavOpen: true,
      }
      const result = reducer(state, {
        type: 'SELECT_VAULT',
        payload: { vaultId: 'new-vault' },
      })
      expect(result.category).toBe('vault')
      expect(result.section).toBe('sync')
      expect(result.searchQuery).toBe('test')
      expect(result.mobileNavOpen).toBe(true)
    })
  })

  describe('settingsReducer — SET_SEARCH', () => {
    const reducer = createSettingsReducer(false)

    it('updates searchQuery', () => {
      const result = reducer(initialSettingsState, {
        type: 'SET_SEARCH',
        payload: { query: 'password' },
      })
      expect(result.searchQuery).toBe('password')
    })

    it('clears searchQuery with empty string', () => {
      const state: SettingsNavState = { ...initialSettingsState, searchQuery: 'old query' }
      const result = reducer(state, {
        type: 'SET_SEARCH',
        payload: { query: '' },
      })
      expect(result.searchQuery).toBe('')
    })

    it('does not affect navigation state', () => {
      const state: SettingsNavState = {
        ...initialSettingsState,
        category: 'vault',
        section: 'plugins',
      }
      const result = reducer(state, {
        type: 'SET_SEARCH',
        payload: { query: 'sync' },
      })
      expect(result.category).toBe('vault')
      expect(result.section).toBe('plugins')
    })
  })

  describe('settingsReducer — TOGGLE_MOBILE_NAV', () => {
    const reducer = createSettingsReducer(false)

    it('toggles mobileNavOpen from false to true', () => {
      const result = reducer(initialSettingsState, { type: 'TOGGLE_MOBILE_NAV' })
      expect(result.mobileNavOpen).toBe(true)
    })

    it('toggles mobileNavOpen from true to false', () => {
      const state: SettingsNavState = { ...initialSettingsState, mobileNavOpen: true }
      const result = reducer(state, { type: 'TOGGLE_MOBILE_NAV' })
      expect(result.mobileNavOpen).toBe(false)
    })
  })

  describe('settingsReducer — CLOSE_MOBILE_NAV', () => {
    const reducer = createSettingsReducer(false)

    it('sets mobileNavOpen to false when open', () => {
      const state: SettingsNavState = { ...initialSettingsState, mobileNavOpen: true }
      const result = reducer(state, { type: 'CLOSE_MOBILE_NAV' })
      expect(result.mobileNavOpen).toBe(false)
    })

    it('keeps mobileNavOpen false when already closed', () => {
      const result = reducer(initialSettingsState, { type: 'CLOSE_MOBILE_NAV' })
      expect(result.mobileNavOpen).toBe(false)
    })
  })

  describe('settingsReducer — RESTORE_STATE', () => {
    const reducer = createSettingsReducer(false)

    it('replaces entire state with payload', () => {
      const payload: SettingsNavState = {
        category: 'administration',
        section: 'feature-toggles',
        selectedVaultId: 'restored-vault',
        searchQuery: 'restored',
        mobileNavOpen: true,
      }
      const result = reducer(initialSettingsState, {
        type: 'RESTORE_STATE',
        payload,
      })
      expect(result).toEqual(payload)
    })

    it('produces a new object reference', () => {
      const payload: SettingsNavState = { ...initialSettingsState }
      const result = reducer(initialSettingsState, {
        type: 'RESTORE_STATE',
        payload,
      })
      expect(result).not.toBe(payload)
      expect(result).toEqual(payload)
    })
  })

  describe('settingsReducer — admin guard edge cases', () => {
    const nonAdminReducer = createSettingsReducer(false)
    const adminReducer = createSettingsReducer(true)

    it('rejects all admin sections for non-admin', () => {
      const adminSections = ['server-config', 'user-management', 'vault-management', 'feature-toggles'] as const
      for (const section of adminSections) {
        const result = nonAdminReducer(initialSettingsState, {
          type: 'NAVIGATE',
          payload: { category: 'administration', section },
        })
        expect(result.category).toBe('account')
        expect(result.section).toBe('profile')
      }
    })

    it('allows all admin sections for admin', () => {
      const adminSections = ['server-config', 'user-management', 'vault-management', 'feature-toggles'] as const
      for (const section of adminSections) {
        const result = adminReducer(initialSettingsState, {
          type: 'NAVIGATE',
          payload: { category: 'administration', section },
        })
        expect(result.category).toBe('administration')
        expect(result.section).toBe(section)
      }
    })

    it('non-admin navigation to admin category sets mobileNavOpen false', () => {
      const state: SettingsNavState = { ...initialSettingsState, mobileNavOpen: true }
      const result = nonAdminReducer(state, {
        type: 'NAVIGATE',
        payload: { category: 'administration', section: 'server-config' },
      })
      expect(result.mobileNavOpen).toBe(false)
    })
  })
})
