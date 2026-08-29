// Mail-Import Types

export interface MailImportConfig {
  id: string
  vaultId: string
  name: string
  host: string
  port: number
  secure: boolean
  username: string
  /** IMAP folder to poll, e.g. "INBOX". */
  mailbox: string
  /** Vault-relative folder notes are written into. Empty string = vault root. */
  targetFolder: string
  intervalMinutes: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type MailImportResult = 'success' | 'error'

export interface MailImportRunStatus {
  configId: string
  lastRunAt: string | null
  lastResult: MailImportResult | null
  lastError: string | null
  /** Unread messages found in the mailbox on the last run (before any per-message failures). */
  lastFoundCount: number
  lastImportedCount: number
}

export type MailImportStatusMap = Record<string, MailImportRunStatus>
