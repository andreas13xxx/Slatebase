// Mail-Import module barrel export

export type { MailImportConfig, MailImportResult, MailImportRunStatus, MailImportStatusMap } from './types.js'

export { MailImportConfigNotFoundError, MailImportConfigLimitExceededError, ImapConnectionError } from './errors.js'

export {
  createMailImportConfigSchema,
  updateMailImportConfigSchema,
  mailImportVaultIdParamSchema,
  mailImportConfigIdParamSchema,
} from './validation.js'
export type { CreateMailImportConfigInput, UpdateMailImportConfigInput } from './validation.js'

export { MailImportConfigStore, MAX_CONFIGS_PER_VAULT } from './config-store.js'
export type { IMailImportConfigStore } from './config-store.js'

export { MailImportStatusStore } from './status-store.js'
export type { IMailImportStatusStore } from './status-store.js'

export { ImapClient } from './imap-client.js'
export type { IImapClient, IImapConnection, ImapAccountConfig, ImapConnectionConfig, FetchedMessage, MailboxTreeNode } from './imap-client.js'

export { convertMailToMarkdown } from './mail-to-markdown.js'
export type { ConvertedMail, ConvertedAttachment } from './mail-to-markdown.js'

export { MailNoteWriter } from './note-writer.js'
export type { IMailNoteWriter } from './note-writer.js'

export { MailImportEngine, MAIL_IMPORT_SECRET_MODULE_ID } from './import-engine.js'
export type { IMailImportEngine, MailImportRunOutcome } from './import-engine.js'

export { MailImportScheduler } from './mail-import-scheduler.js'
