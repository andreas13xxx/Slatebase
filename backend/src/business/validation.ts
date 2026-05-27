// Vault Name & Content Name Validation Module

// --- Error Classes ---

/**
 * Thrown when a rename target name contains invalid characters.
 */
export class InvalidNameError extends Error {
  constructor(
    public readonly invalidName: string,
    public readonly reason: string,
  ) {
    super(`Invalid name '${invalidName}': ${reason}`)
    this.name = 'InvalidNameError'
  }
}

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

/**
 * Validates a content name (file or folder name) against the following rules:
 * - Must not be empty or whitespace-only
 * - Must not contain path separators (`/` or `\`)
 * - Must not contain null bytes (`\0`)
 * - Must not exceed maxLength characters (default: 255)
 *
 * Throws InvalidNameError with a descriptive reason on failure.
 */
export function validateContentName(name: string, maxLength: number = 255): void {
  if (name.length === 0) {
    throw new InvalidNameError(name, 'Name must not be empty')
  }

  if (name.trim().length === 0) {
    throw new InvalidNameError(name, 'Name must contain at least one non-whitespace character')
  }

  if (name.includes('/') || name.includes('\\')) {
    throw new InvalidNameError(name, 'Name must not contain path separators (/ or \\)')
  }

  if (name.includes('\0')) {
    throw new InvalidNameError(name, 'Name must not contain null bytes')
  }

  if (name.length > maxLength) {
    throw new InvalidNameError(name, `Name must not exceed ${maxLength} characters`)
  }
}
