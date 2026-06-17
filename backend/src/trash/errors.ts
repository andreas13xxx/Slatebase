// ─── Trash Error Classes ──────────────────────────────────────────────────────

/**
 * Thrown when a trash entry cannot be found by ID.
 */
export class TrashNotFoundError extends Error {
  public readonly code = 'TRASH_NOT_FOUND'

  constructor(public readonly entryId: string) {
    super(`Trash entry not found: ${entryId}`)
    this.name = 'TrashNotFoundError'
  }
}

/**
 * Thrown when a trash restore operation fails (e.g., filesystem error during restore).
 */
export class TrashRestoreError extends Error {
  public readonly code = 'TRASH_RESTORE_FAILED'

  constructor(public readonly entryId: string, public readonly reason: string) {
    super(`Failed to restore trash entry ${entryId}: ${reason}`)
    this.name = 'TrashRestoreError'
  }
}
