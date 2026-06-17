/**
 * Settings navigation state persistence via sessionStorage.
 * Handles serialization, deserialization, and validation of the settings nav state.
 * Gracefully degrades when sessionStorage is unavailable (Private Browsing, QuotaExceeded).
 */

import {
  SETTINGS_NAV_KEY,
  type SettingsCategory,
  type SettingsNavState,
  type SettingsSection,
  initialSettingsState,
} from './settingsState'

/** Persisted format — only navigation-relevant fields, no ephemeral UI state. */
interface PersistedSettingsNav {
  category: SettingsCategory
  section: SettingsSection
  selectedVaultId: string | null
}

/** Valid categories for validation. */
const VALID_CATEGORIES: SettingsCategory[] = ['account', 'vault', 'administration']

/** Valid sections per category for validation. */
const CATEGORY_SECTIONS: Record<SettingsCategory, SettingsSection[]> = {
  account: ['profile', 'password', 'sessions', 'mcp-tokens', 'delete-account'],
  vault: ['sync', 'plugins'],
  administration: ['server-config', 'user-management', 'vault-management', 'feature-toggles'],
}

/**
 * Persists the current settings navigation state to sessionStorage.
 * Only persists category, section, and selectedVaultId (ephemeral fields like
 * searchQuery and mobileNavOpen are excluded).
 *
 * Silently no-ops on any sessionStorage error (QuotaExceeded, Private Browsing, etc.).
 */
export function persistSettingsNav(state: SettingsNavState): void {
  try {
    const persisted: PersistedSettingsNav = {
      category: state.category,
      section: state.section,
      selectedVaultId: state.selectedVaultId,
    }
    sessionStorage.setItem(SETTINGS_NAV_KEY, JSON.stringify(persisted))
  } catch {
    // Graceful degradation: silently ignore storage errors
  }
}

/**
 * Restores the settings navigation state from sessionStorage.
 * Validates the persisted data against the current user context (admin role, vault list).
 *
 * Returns a full SettingsNavState if the persisted data is valid, or null if:
 * - No data is stored
 * - Data is invalid JSON
 * - Category is not a valid SettingsCategory
 * - Section does not belong to the stored category
 * - Category is 'administration' but user is not admin
 * - sessionStorage is unavailable or throws
 *
 * If selectedVaultId is stored but not in the provided vaultIds array, it is set to null.
 *
 * @param isAdmin - Whether the current user has admin role
 * @param vaultIds - Array of vault IDs the user currently owns
 * @returns Restored SettingsNavState or null (signals caller to use defaults)
 */
export function restoreSettingsNav(isAdmin: boolean, vaultIds: string[]): SettingsNavState | null {
  try {
    const raw = sessionStorage.getItem(SETTINGS_NAV_KEY)
    if (raw === null) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)

    // Must be a non-null object
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }

    const data = parsed as Record<string, unknown>

    // Validate category
    const category = data['category']
    if (typeof category !== 'string' || !isValidCategory(category)) {
      return null
    }

    // Admin check: administration category requires admin role
    if (category === 'administration' && !isAdmin) {
      return null
    }

    // Validate section belongs to category
    const section = data['section']
    if (typeof section !== 'string' || !isValidSectionForCategory(section, category)) {
      return null
    }

    // Validate selectedVaultId — set to null if not in vaultIds
    const selectedVaultId = data['selectedVaultId']
    let resolvedVaultId: string | null = null
    if (typeof selectedVaultId === 'string' && vaultIds.includes(selectedVaultId)) {
      resolvedVaultId = selectedVaultId
    }

    return {
      category,
      section,
      selectedVaultId: resolvedVaultId,
      searchQuery: initialSettingsState.searchQuery,
      mobileNavOpen: initialSettingsState.mobileNavOpen,
    }
  } catch {
    // Graceful degradation: any error (invalid JSON, storage unavailable) → null
    return null
  }
}

/**
 * Checks if a value is a valid SettingsCategory.
 */
function isValidCategory(value: string): value is SettingsCategory {
  return (VALID_CATEGORIES as string[]).includes(value)
}

/**
 * Checks if a section belongs to a specific category.
 */
function isValidSectionForCategory(section: string, category: SettingsCategory): section is SettingsSection {
  return (CATEGORY_SECTIONS[category] as string[]).includes(section)
}
