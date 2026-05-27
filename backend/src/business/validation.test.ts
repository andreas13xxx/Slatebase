import { describe, it, expect } from 'vitest'
import { validateVaultName, validateContentName, InvalidNameError } from './validation'

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

describe('validateContentName', () => {
  describe('valid names', () => {
    it('accepts a simple name', () => {
      expect(() => validateContentName('hello.md')).not.toThrow()
    })

    it('accepts a name with spaces', () => {
      expect(() => validateContentName('my file.md')).not.toThrow()
    })

    it('accepts a name at the 255-character limit', () => {
      const name = 'x'.repeat(255)
      expect(() => validateContentName(name)).not.toThrow()
    })

    it('accepts a name with a custom maxLength', () => {
      const name = 'x'.repeat(128)
      expect(() => validateContentName(name, 128)).not.toThrow()
    })
  })

  describe('rejects empty or whitespace-only names', () => {
    it('throws for an empty string', () => {
      expect(() => validateContentName('')).toThrow(InvalidNameError)
      expect(() => validateContentName('')).toThrow('Name must not be empty')
    })

    it('throws for whitespace-only string', () => {
      expect(() => validateContentName('   ')).toThrow(InvalidNameError)
      expect(() => validateContentName('   ')).toThrow('Name must contain at least one non-whitespace character')
    })

    it('throws for tabs and newlines only', () => {
      expect(() => validateContentName('\t\n')).toThrow(InvalidNameError)
    })
  })

  describe('rejects path separators', () => {
    it('throws for forward slash', () => {
      expect(() => validateContentName('path/file.md')).toThrow(InvalidNameError)
      expect(() => validateContentName('path/file.md')).toThrow('path separators')
    })

    it('throws for backslash', () => {
      expect(() => validateContentName('path\\file.md')).toThrow(InvalidNameError)
      expect(() => validateContentName('path\\file.md')).toThrow('path separators')
    })
  })

  describe('rejects null bytes', () => {
    it('throws for a name containing a null byte', () => {
      expect(() => validateContentName('file\0.md')).toThrow(InvalidNameError)
      expect(() => validateContentName('file\0.md')).toThrow('null bytes')
    })
  })

  describe('rejects names exceeding maxLength', () => {
    it('throws for a name exceeding default 255 characters', () => {
      const name = 'a'.repeat(256)
      expect(() => validateContentName(name)).toThrow(InvalidNameError)
      expect(() => validateContentName(name)).toThrow('must not exceed 255 characters')
    })

    it('throws for a name exceeding custom maxLength', () => {
      const name = 'a'.repeat(129)
      expect(() => validateContentName(name, 128)).toThrow(InvalidNameError)
      expect(() => validateContentName(name, 128)).toThrow('must not exceed 128 characters')
    })
  })

  describe('InvalidNameError properties', () => {
    it('includes the invalid name and reason', () => {
      try {
        validateContentName('bad/name')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidNameError)
        const nameError = error as InvalidNameError
        expect(nameError.invalidName).toBe('bad/name')
        expect(nameError.reason).toBe('Name must not contain path separators (/ or \\)')
        expect(nameError.name).toBe('InvalidNameError')
      }
    })
  })
})
