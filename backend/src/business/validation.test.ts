import { describe, it, expect } from 'vitest'
import { validateVaultName } from './validation'

describe('validateVaultName', () => {
  describe('valid names', () => {
    it('accepts a simple name', () => {
      const result = validateVaultName('My Vault', [])
      expect(result).toEqual({ valid: true })
    })

    it('accepts a single character name', () => {
      const result = validateVaultName('a', [])
      expect(result).toEqual({ valid: true })
    })

    it('accepts a name at the 128-character limit', () => {
      const name = 'x'.repeat(128)
      const result = validateVaultName(name, [])
      expect(result).toEqual({ valid: true })
    })

    it('accepts a name with leading/trailing whitespace if it has non-whitespace', () => {
      const result = validateVaultName('  hello  ', [])
      expect(result).toEqual({ valid: true })
    })

    it('accepts a name that differs from existing by case', () => {
      const result = validateVaultName('My Vault', ['my vault', 'MY VAULT'])
      expect(result).toEqual({ valid: true })
    })
  })

  describe('VALIDATION_ERROR - empty name', () => {
    it('rejects an empty string', () => {
      const result = validateVaultName('', [])
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.code).toBe('VALIDATION_ERROR')
        expect(result.message).toBe('Vault name must not be empty')
      }
    })
  })

  describe('VALIDATION_ERROR - whitespace only', () => {
    it('rejects a name with only spaces', () => {
      const result = validateVaultName('   ', [])
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.code).toBe('VALIDATION_ERROR')
        expect(result.message).toBe('Vault name must contain at least one non-whitespace character')
      }
    })

    it('rejects a name with only tabs and newlines', () => {
      const result = validateVaultName('\t\n\r', [])
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.code).toBe('VALIDATION_ERROR')
      }
    })
  })

  describe('VALIDATION_ERROR - too long', () => {
    it('rejects a name exceeding 128 characters', () => {
      const name = 'a'.repeat(129)
      const result = validateVaultName(name, [])
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.code).toBe('VALIDATION_ERROR')
        expect(result.message).toBe('Vault name must be at most 128 characters')
      }
    })
  })

  describe('VAULT_NAME_CONFLICT - duplicate name', () => {
    it('rejects a name that matches an existing name exactly', () => {
      const result = validateVaultName('Research', ['Research', 'Notes'])
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.code).toBe('VAULT_NAME_CONFLICT')
        expect(result.message).toBe("A vault with name 'Research' already exists")
      }
    })

    it('uses case-sensitive comparison', () => {
      // "research" should NOT conflict with "Research"
      const result = validateVaultName('research', ['Research'])
      expect(result).toEqual({ valid: true })
    })
  })
})
