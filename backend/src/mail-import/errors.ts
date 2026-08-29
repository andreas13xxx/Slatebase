// Mail-Import Errors

export class MailImportConfigNotFoundError extends Error {
  public readonly code = 'MAIL_IMPORT_CONFIG_NOT_FOUND'

  constructor(vaultId: string, configId: string) {
    super(`Mail-import config "${configId}" not found for vault "${vaultId}"`)
    this.name = 'MailImportConfigNotFoundError'
  }
}

export class MailImportConfigLimitExceededError extends Error {
  public readonly code = 'MAIL_IMPORT_CONFIG_LIMIT_EXCEEDED'

  constructor(vaultId: string, max: number) {
    super(`Vault "${vaultId}" has reached the maximum of ${max} mail-import configs`)
    this.name = 'MailImportConfigLimitExceededError'
  }
}

/** Thrown when connecting to or authenticating against the IMAP server fails. */
export class ImapConnectionError extends Error {
  public readonly code = 'IMAP_CONNECTION_FAILED'

  constructor(message: string) {
    super(message)
    this.name = 'ImapConnectionError'
  }
}
