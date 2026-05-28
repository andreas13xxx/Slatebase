// ─── Sync Error Classes ───────────────────────────────────────────────────────

/**
 * Thrown when a sync operation is attempted but no sync configuration exists for the vault.
 */
export class SyncNotConfiguredError extends Error {
  public readonly code = 'SYNC_NOT_CONFIGURED'

  constructor(message = 'Sync is not configured for this vault') {
    super(message)
    this.name = 'SyncNotConfiguredError'
  }
}

/**
 * Thrown when attempting to create a sync configuration that already exists for the vault.
 */
export class SyncAlreadyConfiguredError extends Error {
  public readonly code = 'SYNC_ALREADY_CONFIGURED'

  constructor(message = 'Sync is already configured for this vault') {
    super(message)
    this.name = 'SyncAlreadyConfiguredError'
  }
}

/**
 * Thrown when a sync operation is attempted while another sync is already in progress for the vault.
 */
export class SyncInProgressError extends Error {
  public readonly code = 'SYNC_IN_PROGRESS'

  constructor(message = 'A sync operation is already in progress for this vault') {
    super(message)
    this.name = 'SyncInProgressError'
  }
}

/**
 * Thrown when a connection test to the CouchDB instance fails.
 */
export class ConnectionTestFailedError extends Error {
  public readonly code = 'CONNECTION_TEST_FAILED'

  constructor(message = 'Connection test to the CouchDB instance failed') {
    super(message)
    this.name = 'ConnectionTestFailedError'
  }
}

/**
 * Thrown when a provided setup URI is malformed or cannot be parsed.
 */
export class InvalidSetupUriError extends Error {
  public readonly code = 'INVALID_SETUP_URI'

  constructor(message = 'The provided setup URI is invalid') {
    super(message)
    this.name = 'InvalidSetupUriError'
  }
}

/**
 * Thrown when a provided sync interval value is outside the allowed range [5, 1440].
 */
export class InvalidSyncIntervalError extends Error {
  public readonly code = 'INVALID_SYNC_INTERVAL'

  constructor(message = 'Sync interval must be between 5 and 1440 minutes') {
    super(message)
    this.name = 'InvalidSyncIntervalError'
  }
}

/**
 * Thrown when a provided E2E encryption passphrase does not meet the length requirements [8, 256].
 */
export class InvalidPassphraseError extends Error {
  public readonly code = 'INVALID_PASSPHRASE'

  constructor(message = 'Passphrase must be between 8 and 256 characters') {
    super(message)
    this.name = 'InvalidPassphraseError'
  }
}

/**
 * Thrown when a conflict resolution operation fails or is invalid.
 */
export class ConflictResolutionError extends Error {
  public readonly code = 'CONFLICT_RESOLUTION_ERROR'

  constructor(message = 'Conflict resolution failed') {
    super(message)
    this.name = 'ConflictResolutionError'
  }
}
