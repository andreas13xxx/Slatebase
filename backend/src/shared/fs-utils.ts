// Shared filesystem-related helpers

/**
 * Type guard for Node.js filesystem errors that carry an error `code`
 * (e.g. 'ENOENT', 'EEXIST', 'EPERM').
 */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && typeof (error as NodeJS.ErrnoException).code === 'string'
}
