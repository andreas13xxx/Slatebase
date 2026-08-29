// MailImportEngine — runs one IMAP poll cycle for one mail-import config:
// connect, list currently-unseen messages in the configured mailbox,
// convert + write each as a note, then mark it \Seen on the server. Dedup
// therefore lives on the IMAP server itself (the \Seen flag), not in local
// config state — a message only gets marked \Seen once it has been fully
// imported, so a failure mid-run leaves it unseen for the next run, and a
// message already imported is never fetched again.
//
// Each message is isolated: one failing message is logged and skipped
// rather than aborting the whole run, since there's no ordering dependency
// forcing sequential retry (unlike the old UID-watermark design).

import { KeyedMutex } from '../shared/async-mutex.js'
import type { ILogger } from '../logger/index.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'
import type { IMailImportConfigStore } from './config-store.js'
import type { IMailImportStatusStore } from './status-store.js'
import type { IImapClient } from './imap-client.js'
import type { IMailNoteWriter } from './note-writer.js'
import { convertMailToMarkdown } from './mail-to-markdown.js'
import { MailImportConfigNotFoundError } from './errors.js'
import type { MailImportResult } from './types.js'

export const MAIL_IMPORT_SECRET_MODULE_ID = 'mail-import'
const MAX_ERROR_SAMPLES = 5

export interface MailImportRunOutcome {
  result: MailImportResult
  error?: string
  /** Unread messages found in the mailbox this run (before any per-message failures). */
  foundCount: number
  importedCount: number
}

export interface IMailImportEngine {
  runOne(vaultId: string, configId: string): Promise<MailImportRunOutcome>
}

export class MailImportEngine implements IMailImportEngine {
  private readonly locks = new KeyedMutex()

  constructor(
    private readonly configStore: IMailImportConfigStore,
    private readonly statusStore: IMailImportStatusStore,
    private readonly secretStore: IModuleSecretStore,
    private readonly imapClient: IImapClient,
    private readonly noteWriter: IMailNoteWriter,
    private readonly logger: ILogger,
  ) {}

  /** Serialized per config so a manual trigger can't overlap a scheduled run for the same account. */
  async runOne(vaultId: string, configId: string): Promise<MailImportRunOutcome> {
    return this.locks.runExclusive(configId, () => this.runOneUnlocked(vaultId, configId))
  }

  private async runOneUnlocked(vaultId: string, configId: string): Promise<MailImportRunOutcome> {
    const config = await this.configStore.get(vaultId, configId)
    if (!config) {
      throw new MailImportConfigNotFoundError(vaultId, configId)
    }

    let importedCount = 0
    let foundCount = 0
    const failures: string[] = []

    try {
      const password = await this.secretStore.getSecret(vaultId, MAIL_IMPORT_SECRET_MODULE_ID, configId)
      if (password === null) {
        return this.finish(vaultId, configId, { result: 'error', importedCount: 0, foundCount: 0, error: 'No password stored for this account' })
      }

      const connection = await this.imapClient.connect({
        host: config.host, port: config.port, secure: config.secure,
        username: config.username, password, mailbox: config.mailbox,
      })

      try {
        const uids = await connection.listUnseenUids()
        foundCount = uids.length

        for (const uid of uids) {
          try {
            const source = await connection.fetchMessage(uid)
            const mail = await convertMailToMarkdown(source)
            await this.noteWriter.writeMail(vaultId, config.targetFolder, mail)
            // Mark read only after the note (and any attachments) are safely
            // written — a crash before this point leaves the message unseen,
            // so it's retried rather than lost.
            await connection.markAsRead(uid)
            importedCount++
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error('Mail-import failed for one message, leaving it unseen for retry', {
              vaultId, configId, uid, message,
            })
            failures.push(`UID ${uid}: ${message}`)
          }
        }
      } finally {
        await connection.close()
      }

      if (failures.length > 0) {
        const sample = failures.slice(0, MAX_ERROR_SAMPLES).join('; ')
        const suffix = failures.length > MAX_ERROR_SAMPLES ? ` (+${failures.length - MAX_ERROR_SAMPLES} more)` : ''
        return this.finish(vaultId, configId, { result: 'error', importedCount, foundCount, error: `${failures.length} of ${failures.length + importedCount} message(s) failed: ${sample}${suffix}` })
      }

      this.logger.info('Mail-import run succeeded', { vaultId, configId, importedCount, foundCount })
      return this.finish(vaultId, configId, { result: 'success', importedCount, foundCount })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Mail-import run failed', { vaultId, configId, message, importedCount, foundCount })
      return this.finish(vaultId, configId, { result: 'error', error: message, importedCount, foundCount })
    }
  }

  private async finish(vaultId: string, configId: string, outcome: MailImportRunOutcome): Promise<MailImportRunOutcome> {
    await this.statusStore.setStatus(vaultId, {
      configId,
      lastRunAt: new Date().toISOString(),
      lastResult: outcome.result,
      lastError: outcome.error ?? null,
      lastFoundCount: outcome.foundCount,
      lastImportedCount: outcome.importedCount,
    })
    return outcome
  }
}
