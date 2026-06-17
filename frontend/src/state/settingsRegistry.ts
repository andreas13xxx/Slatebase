/**
 * Settings registry providing static section definitions and query methods.
 * Manages the mapping of categories to sections with role-based filtering.
 */

import type { SettingsCategory, SettingsSection } from './settingsState'

/** Static definition of a settings section for navigation and search. */
export interface ISettingsSectionDef {
  /** Unique section identifier. */
  id: SettingsSection
  /** i18n key for the section label. */
  labelKey: string
  /** Category this section belongs to. */
  category: SettingsCategory
  /** Whether this section requires admin role to be visible. */
  requiresAdmin: boolean
  /** Whether this section is only interactive when a vault is selected. */
  requiresVault: boolean
}

/** Registry of all available settings sections. */
export interface ISettingsRegistry {
  /** Returns visible categories based on admin role. */
  getCategories(isAdmin: boolean): SettingsCategory[]
  /** Returns sections for a given category, filtered by admin role. */
  getSections(category: SettingsCategory, isAdmin: boolean): ISettingsSectionDef[]
  /** Returns all sections across all visible categories for the given admin level. */
  getAllSections(isAdmin: boolean): ISettingsSectionDef[]
  /** Finds a section by ID across all sections (ignores admin filter). */
  findSection(id: SettingsSection): ISettingsSectionDef | undefined
}

/** All settings section definitions in display order. */
export const SETTINGS_SECTIONS: ISettingsSectionDef[] = [
  // Konto
  { id: 'profile', labelKey: 'settings.sections.profile', category: 'account', requiresAdmin: false, requiresVault: false },
  { id: 'password', labelKey: 'settings.sections.password', category: 'account', requiresAdmin: false, requiresVault: false },
  { id: 'sessions', labelKey: 'settings.sections.sessions', category: 'account', requiresAdmin: false, requiresVault: false },
  { id: 'mcp-tokens', labelKey: 'settings.sections.mcpTokens', category: 'account', requiresAdmin: false, requiresVault: false },
  { id: 'delete-account', labelKey: 'settings.sections.deleteAccount', category: 'account', requiresAdmin: false, requiresVault: false },
  // Vault
  { id: 'sync', labelKey: 'settings.sections.sync', category: 'vault', requiresAdmin: false, requiresVault: true },
  { id: 'plugins', labelKey: 'settings.sections.plugins', category: 'vault', requiresAdmin: false, requiresVault: true },
  // Administration
  { id: 'server-config', labelKey: 'settings.sections.serverConfig', category: 'administration', requiresAdmin: true, requiresVault: false },
  { id: 'user-management', labelKey: 'settings.sections.userManagement', category: 'administration', requiresAdmin: true, requiresVault: false },
  { id: 'vault-management', labelKey: 'settings.sections.vaultManagement', category: 'administration', requiresAdmin: true, requiresVault: false },
  { id: 'feature-toggles', labelKey: 'settings.sections.featureToggles', category: 'administration', requiresAdmin: true, requiresVault: false },
  { id: 'server-restart', labelKey: 'settings.sections.serverRestart', category: 'administration', requiresAdmin: true, requiresVault: false },
]

/**
 * Creates a settings registry instance that provides query methods
 * over the static section definitions.
 *
 * @returns An ISettingsRegistry implementation.
 */
export function createSettingsRegistry(): ISettingsRegistry {
  return {
    getCategories(isAdmin: boolean): SettingsCategory[] {
      const categories: SettingsCategory[] = ['account', 'vault']
      if (isAdmin) {
        categories.push('administration')
      }
      return categories
    },

    getSections(category: SettingsCategory, isAdmin: boolean): ISettingsSectionDef[] {
      return SETTINGS_SECTIONS.filter((section) => {
        if (section.category !== category) return false
        if (section.requiresAdmin && !isAdmin) return false
        return true
      })
    },

    getAllSections(isAdmin: boolean): ISettingsSectionDef[] {
      const categories = this.getCategories(isAdmin)
      return SETTINGS_SECTIONS.filter((section) => {
        if (!categories.includes(section.category)) return false
        if (section.requiresAdmin && !isAdmin) return false
        return true
      })
    },

    findSection(id: SettingsSection): ISettingsSectionDef | undefined {
      return SETTINGS_SECTIONS.find((section) => section.id === id)
    },
  }
}
