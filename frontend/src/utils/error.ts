/**
 * Shared error message extraction utility.
 * Replaces repetitive inline error-handling patterns across the codebase.
 */

/**
 * Extracts a user-friendly error message from an unknown error value.
 * Handles the `{ code, message }` shape thrown by ApiClient as well as
 * standard Error instances and arbitrary objects with a `message` property.
 *
 * @param err - The caught error (unknown type from catch blocks)
 * @param fallback - Fallback message if no message can be extracted
 * @returns The extracted error message string
 */
export function extractErrorMessage(err: unknown, fallback = 'Ein unerwarteter Fehler ist aufgetreten'): string {
  if (
    err !== null &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}
