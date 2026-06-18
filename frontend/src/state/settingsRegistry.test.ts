import { describe, it, expect, beforeEach } from 'vitest'
import { createSettingsRegistry, SETTINGS_SECTIONS } from './settingsRegistry'
import type { ISettingsRegistry } from './settingsRegistry'

describe('settingsRegistry', () => {
  let registry: ISettingsRegistry

  beforeEach(() => {
    registry = createSettingsRegistry()
  })

  describe('SETTINGS_SECTIONS', () => {
    it('contains exactly 14 section definitions', () => {
      expect(SETTINGS_SECTIONS).toHaveLength(14)
    })

    it('has unique ids across all sections', () => {
      const ids = SETTINGS_SECTIONS.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('getCategories', () => {
    it('returns account and vault for non-admin', () => {
      const categories = registry.getCategories(false)
      expect(categories).toEqual(['account', 'vault'])
    })

    it('returns account, vault, and administration for admin', () => {
      const categories = registry.getCategories(true)
      expect(categories).toEqual(['account', 'vault', 'administration'])
    })

    it('preserves order: account first, vault second, administration last', () => {
      const categories = registry.getCategories(true)
      expect(categories[0]).toBe('account')
      expect(categories[1]).toBe('vault')
      expect(categories[2]).toBe('administration')
    })

    it('does not include administration for non-admin', () => {
      const categories = registry.getCategories(false)
      expect(categories).not.toContain('administration')
    })
  })

  describe('getSections', () => {
    it('returns 6 account sections', () => {
      const sections = registry.getSections('account', false)
      expect(sections).toHaveLength(6)
      expect(sections.map((s) => s.id)).toEqual([
        'profile', 'password', 'sessions', 'mcp-tokens', 'keybindings', 'delete-account',
      ])
    })

    it('returns 3 vault sections', () => {
      const sections = registry.getSections('vault', false)
      expect(sections).toHaveLength(3)
      expect(sections.map((s) => s.id)).toEqual(['vault-config', 'sync', 'plugins'])
    })

    it('returns 5 administration sections for admin', () => {
      const sections = registry.getSections('administration', true)
      expect(sections).toHaveLength(5)
      expect(sections.map((s) => s.id)).toEqual([
        'server-config', 'user-management', 'vault-management', 'feature-toggles', 'server-restart',
      ])
    })

    it('returns empty array for administration when not admin', () => {
      const sections = registry.getSections('administration', false)
      expect(sections).toEqual([])
    })

    it('account sections do not require admin', () => {
      const sections = registry.getSections('account', false)
      expect(sections.every((s) => !s.requiresAdmin)).toBe(true)
    })

    it('vault sections have requiresVault set to true', () => {
      const sections = registry.getSections('vault', false)
      expect(sections.every((s) => s.requiresVault)).toBe(true)
    })

    it('administration sections all require admin', () => {
      const sections = registry.getSections('administration', true)
      expect(sections.every((s) => s.requiresAdmin)).toBe(true)
    })
  })

  describe('getAllSections', () => {
    it('returns 9 sections for non-admin (account + vault)', () => {
      const sections = registry.getAllSections(false)
      expect(sections).toHaveLength(9)
    })

    it('returns all 14 sections for admin', () => {
      const sections = registry.getAllSections(true)
      expect(sections).toHaveLength(14)
    })

    it('does not include admin sections for non-admin', () => {
      const sections = registry.getAllSections(false)
      const adminSections = sections.filter((s) => s.requiresAdmin)
      expect(adminSections).toHaveLength(0)
    })
  })

  describe('findSection', () => {
    it('finds existing section by id', () => {
      const section = registry.findSection('profile')
      expect(section).toBeDefined()
      expect(section?.id).toBe('profile')
      expect(section?.category).toBe('account')
      expect(section?.labelKey).toBe('settings.sections.profile')
    })

    it('finds admin section regardless of role (internal use)', () => {
      const section = registry.findSection('server-config')
      expect(section).toBeDefined()
      expect(section?.id).toBe('server-config')
      expect(section?.requiresAdmin).toBe(true)
    })

    it('returns undefined for non-existent id', () => {
      const section = registry.findSection('nonexistent' as never)
      expect(section).toBeUndefined()
    })

    it('returns correct labelKey for each section', () => {
      expect(registry.findSection('sync')?.labelKey).toBe('settings.sections.sync')
      expect(registry.findSection('plugins')?.labelKey).toBe('settings.sections.plugins')
      expect(registry.findSection('mcp-tokens')?.labelKey).toBe('settings.sections.mcpTokens')
      expect(registry.findSection('feature-toggles')?.labelKey).toBe('settings.sections.featureToggles')
    })
  })
})
