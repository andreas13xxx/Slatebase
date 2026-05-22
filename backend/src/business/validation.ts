// Vault Name Validation Module

// --- Types ---

export type ValidationErrorCode = 'VALIDATION_ERROR' | 'VAULT_NAME_CONFLICT'

export interface ValidationSuccess {
  valid: true
}

export interface ValidationFailure {
  valid: false
  code: ValidationErrorCode
  message: string
}

export type ValidationResult = ValidationSuccess | ValidationFailure

// --- Implementation ---

/**
 * Validates a vault name against the following rules:
 * - Must be between 1 and 128 characters (inclusive)
 * - Must contain at least one non-whitespace character
 * - Must not conflict with any existing vault name (case-sensitive)
 *
 * Returns a ValidationResult indicating success or failure with a specific error code.
 */
export function validateVaultName(name: string, existingNames: string[]): ValidationResult {
  // Check empty string
  if (name.length === 0) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      message: 'Vault name must not be empty',
    }
  }

  // Check exceeds max length
  if (name.length > 128) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      message: 'Vault name must be at most 128 characters',
    }
  }

  // Check whitespace-only
  if (name.trim().length === 0) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      message: 'Vault name must contain at least one non-whitespace character',
    }
  }

  // Check uniqueness (case-sensitive)
  if (existingNames.includes(name)) {
    return {
      valid: false,
      code: 'VAULT_NAME_CONFLICT',
      message: `A vault with name '${name}' already exists`,
    }
  }

  return { valid: true }
}
