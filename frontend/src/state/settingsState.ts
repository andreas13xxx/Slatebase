/**
 * Settings state management for unified settings panel navigation.
 * Manages category/section navigation, vault selection, search, and mobile nav.
 */

/** Kategorien im Settings-Panel (feste Reihenfolge). */
export type SettingsCategory = 'account' | 'vault' | 'administration'

/** Sektions-Kennungen pro Kategorie. */
export type AccountSection = 'profile' | 'password' | 'sessions' | 'mcp-tokens' | 'delete-account' | 'keybindings'
export type VaultSection = 'sync' | 'plugins' | 'vault-config'
export type AdminSection = 'server-config' | 'user-management' | 'vault-management' | 'feature-toggles' | 'server-restart'
export type SettingsSection = AccountSection | VaultSection | AdminSection

/** Navigationsstand im Settings-Panel. */
export interface SettingsNavState {
  category: SettingsCategory
  section: SettingsSection
  /** Vault-ID for vault-specific sections (null = no vault selected). */
  selectedVaultId: string | null
  /** Search query in the search field (empty = no search active). */
  searchQuery: string
  /** Whether the navigation menu is expanded in responsive mode. */
  mobileNavOpen: boolean
}

/** Actions for the settings reducer. */
export type SettingsAction =
  | { type: 'NAVIGATE'; payload: { category: SettingsCategory; section: SettingsSection } }
  | { type: 'SELECT_VAULT'; payload: { vaultId: string | null } }
  | { type: 'SET_SEARCH'; payload: { query: string } }
  | { type: 'TOGGLE_MOBILE_NAV' }
  | { type: 'CLOSE_MOBILE_NAV' }
  | { type: 'RESTORE_STATE'; payload: SettingsNavState }

/** sessionStorage key for navigation state persistence. */
export const SETTINGS_NAV_KEY = 'slatebase-settings-nav'

/** Initial settings state — account/profile with no vault selected. */
export const initialSettingsState: SettingsNavState = {
  category: 'account',
  section: 'profile',
  selectedVaultId: null,
  searchQuery: '',
  mobileNavOpen: false,
}

/** Valid sections per category for validation. */
const CATEGORY_SECTIONS: Record<SettingsCategory, SettingsSection[]> = {
  account: ['profile', 'password', 'sessions', 'mcp-tokens', 'keybindings', 'delete-account'],
  vault: ['sync', 'plugins', 'vault-config'],
  administration: ['server-config', 'user-management', 'vault-management', 'feature-toggles', 'server-restart'],
}

/** Admin-only sections that require admin role. */
const ADMIN_SECTIONS: SettingsSection[] = ['server-config', 'user-management', 'vault-management', 'feature-toggles', 'server-restart']

/**
 * Checks if a section belongs to a given category.
 */
function isSectionInCategory(section: SettingsSection, category: SettingsCategory): boolean {
  return CATEGORY_SECTIONS[category].includes(section)
}

/**
 * Pure reducer handling all settings state transitions.
 *
 * - NAVIGATE: validates category-section pair and admin access, closes mobile nav
 * - SELECT_VAULT: updates selectedVaultId
 * - SET_SEARCH: updates searchQuery
 * - TOGGLE_MOBILE_NAV: toggles mobileNavOpen
 * - CLOSE_MOBILE_NAV: sets mobileNavOpen to false
 * - RESTORE_STATE: replaces entire state (used for sessionStorage restore)
 *
 * @param isAdmin - Whether the current user has admin role (passed via closure or context)
 */
export function createSettingsReducer(isAdmin: boolean) {
  return function settingsReducer(state: SettingsNavState, action: SettingsAction): SettingsNavState {
    switch (action.type) {
      case 'NAVIGATE': {
        const { category, section } = action.payload

        // Guard: admin sections require admin role
        if (ADMIN_SECTIONS.includes(section) && !isAdmin) {
          return {
            ...state,
            category: 'account',
            section: 'profile',
            mobileNavOpen: false,
          }
        }

        // Guard: administration category requires admin role
        if (category === 'administration' && !isAdmin) {
          return {
            ...state,
            category: 'account',
            section: 'profile',
            mobileNavOpen: false,
          }
        }

        // Validate section belongs to category
        if (!isSectionInCategory(section, category)) {
          const firstSection = CATEGORY_SECTIONS[category][0]
          if (firstSection === undefined) {
            return { ...state, mobileNavOpen: false }
          }
          return {
            ...state,
            category,
            section: firstSection,
            mobileNavOpen: false,
          }
        }

        return {
          ...state,
          category,
          section,
          mobileNavOpen: false,
        }
      }

      case 'SELECT_VAULT':
        return {
          ...state,
          selectedVaultId: action.payload.vaultId,
        }

      case 'SET_SEARCH':
        return {
          ...state,
          searchQuery: action.payload.query,
        }

      case 'TOGGLE_MOBILE_NAV':
        return {
          ...state,
          mobileNavOpen: !state.mobileNavOpen,
        }

      case 'CLOSE_MOBILE_NAV':
        return {
          ...state,
          mobileNavOpen: false,
        }

      case 'RESTORE_STATE':
        return {
          ...action.payload,
        }
    }
  }
}
