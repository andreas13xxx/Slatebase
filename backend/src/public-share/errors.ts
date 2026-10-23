// ─── Public Share Links — Errors ─────────────────────────────────────────────

/**
 * The link does not exist, has expired, was revoked, or its note is gone.
 * All of these are deliberately indistinguishable to the public reader.
 */
export class PublicShareNotFoundError extends Error {
  constructor() {
    super('Public share not found')
    this.name = 'PublicShareNotFoundError'
  }
}

/** The link is password protected and no valid password was supplied. */
export class PublicSharePasswordRequiredError extends Error {
  constructor() {
    super('Password required')
    this.name = 'PublicSharePasswordRequiredError'
  }
}

/** The note already has an active link. Its token cannot be shown again; revoke it to issue a new one. */
export class PublicShareConflictError extends Error {
  constructor() {
    super('Note already has an active public link')
    this.name = 'PublicShareConflictError'
  }
}

/** Input for creating or updating a link is invalid. */
export class PublicShareValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicShareValidationError'
  }
}
