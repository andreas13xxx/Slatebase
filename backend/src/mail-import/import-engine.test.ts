import { describe, it, expect, vi } from 'vitest'
import { MailImportEngine } from './import-engine.js'
import type { IMailImportConfigStore } from './config-store.js'
import type { IMailImportStatusStore } from './status-store.js'
import type { IImapClient, IImapConnection } from './imap-client.js'
import type { IMailNoteWriter } from './note-writer.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'
import type { MailImportConfig, MailImportRunStatus } from './types.js'
import { MailImportConfigNotFoundError } from './errors.js'

const createMockLogger = () => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as import('../logger/index.js').ILogger)

function makeConfig(overrides: Partial<MailImportConfig> = {}): MailImportConfig {
  return {
    id: 'config-1', vaultId: 'vault-1', name: 'Inbox', host: 'imap.example.invalid', port: 993,
    secure: true, username: 'user@example.invalid', mailbox: 'INBOX', targetFolder: 'Mail',
    intervalMinutes: 15, enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRawMail(subject: string): Buffer {
  return Buffer.from(
    [
      'From: a@example.invalid',
      'To: b@example.invalid',
      `Subject: ${subject}`,
      'Date: Mon, 05 Jan 2026 10:30:00 +0000',
      'Content-Type: text/plain',
      '',
      'body',
      '',
    ].join('\r\n'),
  )
}

/** A fake IMAP connection backed by an in-memory map of uid -> raw source, tracking which UIDs got marked read. */
function makeFakeConnection(messagesByUid: Record<number, Buffer>) {
  const readUids: number[] = []
  const closeMock = vi.fn(async () => {})
  const connection: IImapConnection = {
    listUnseenUids: async () => Object.keys(messagesByUid).map(Number).sort((a, b) => a - b),
    fetchMessage: async (uid) => {
      const source = messagesByUid[uid]
      if (!source) throw new Error(`no message ${uid}`)
      return source
    },
    markAsRead: async (uid) => { readUids.push(uid) },
    close: closeMock,
  }
  return { connection, readUids, closeMock }
}

describe('MailImportEngine', () => {
  it('imports each unseen message and marks it read immediately after writing it', async () => {
    const config = makeConfig()
    const { connection, readUids, closeMock } = makeFakeConnection({
      11: makeRawMail('First'),
      12: makeRawMail('Second'),
    })

    const configStore = { get: async () => config } as unknown as IMailImportConfigStore
    const statuses: MailImportRunStatus[] = []
    const statusStore = { setStatus: async (_v: string, s: MailImportRunStatus) => { statuses.push(s) } } as unknown as IMailImportStatusStore
    const secretStore = { getSecret: async () => 'imap-password' } as unknown as IModuleSecretStore
    const imapClient = { connect: vi.fn(async () => connection) } as unknown as IImapClient
    const writeMail = vi.fn(async () => 'Mail/note.md')
    const noteWriter = { writeMail } as unknown as IMailNoteWriter

    const engine = new MailImportEngine(configStore, statusStore, secretStore, imapClient, noteWriter, createMockLogger())
    const outcome = await engine.runOne('vault-1', 'config-1')

    expect(outcome).toEqual({ result: 'success', importedCount: 2, foundCount: 2 })
    expect(writeMail).toHaveBeenCalledTimes(2)
    expect(readUids).toEqual([11, 12])
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(statuses[0]).toMatchObject({ configId: 'config-1', lastResult: 'success', lastImportedCount: 2, lastFoundCount: 2 })
  })

  it('isolates a failing message: it is not marked read, but the rest of the batch still imports', async () => {
    const config = makeConfig()
    const { connection, readUids } = makeFakeConnection({
      11: makeRawMail('First'),
      // UID 12 intentionally missing from the map so fetchMessage throws for it
      13: makeRawMail('Third'),
    })
    // Force the search to also report a UID with no backing message, simulating a fetch failure.
    connection.listUnseenUids = async () => [11, 12, 13]

    const configStore = { get: async () => config } as unknown as IMailImportConfigStore
    const statusStore = { setStatus: async () => {} } as unknown as IMailImportStatusStore
    const secretStore = { getSecret: async () => 'imap-password' } as unknown as IModuleSecretStore
    const imapClient = { connect: vi.fn(async () => connection) } as unknown as IImapClient
    const noteWriter = { writeMail: vi.fn(async () => 'Mail/note.md') } as unknown as IMailNoteWriter

    const engine = new MailImportEngine(configStore, statusStore, secretStore, imapClient, noteWriter, createMockLogger())
    const outcome = await engine.runOne('vault-1', 'config-1')

    expect(outcome.result).toBe('error')
    expect(outcome.importedCount).toBe(2)
    expect(outcome.foundCount).toBe(3)
    expect(outcome.error).toContain('UID 12')
    // The failed message was never marked read — it stays unseen and is retried next run.
    expect(readUids).toEqual([11, 13])
  })

  it('does not mark a message as read if writing it fails', async () => {
    const config = makeConfig()
    const { connection, readUids } = makeFakeConnection({ 11: makeRawMail('First') })

    const configStore = { get: async () => config } as unknown as IMailImportConfigStore
    const statusStore = { setStatus: async () => {} } as unknown as IMailImportStatusStore
    const secretStore = { getSecret: async () => 'imap-password' } as unknown as IModuleSecretStore
    const imapClient = { connect: vi.fn(async () => connection) } as unknown as IImapClient
    const noteWriter = { writeMail: vi.fn(async () => { throw new Error('disk full') }) } as unknown as IMailNoteWriter

    const engine = new MailImportEngine(configStore, statusStore, secretStore, imapClient, noteWriter, createMockLogger())
    const outcome = await engine.runOne('vault-1', 'config-1')

    expect(outcome.result).toBe('error')
    expect(outcome.importedCount).toBe(0)
    expect(outcome.foundCount).toBe(1)
    expect(readUids).toEqual([])
  })

  it('always closes the connection, even when listing unseen messages fails', async () => {
    const closeMock = vi.fn(async () => {})
    const connection: IImapConnection = {
      listUnseenUids: async () => { throw new Error('search failed') },
      fetchMessage: vi.fn(),
      markAsRead: vi.fn(),
      close: closeMock,
    }

    const configStore = { get: async () => makeConfig() } as unknown as IMailImportConfigStore
    const statusStore = { setStatus: async () => {} } as unknown as IMailImportStatusStore
    const secretStore = { getSecret: async () => 'imap-password' } as unknown as IModuleSecretStore
    const imapClient = { connect: vi.fn(async () => connection) } as unknown as IImapClient
    const noteWriter = { writeMail: vi.fn() } as unknown as IMailNoteWriter

    const engine = new MailImportEngine(configStore, statusStore, secretStore, imapClient, noteWriter, createMockLogger())
    const outcome = await engine.runOne('vault-1', 'config-1')

    expect(outcome.result).toBe('error')
    expect(closeMock).toHaveBeenCalledTimes(1)
  })

  it('reports an error without connecting to IMAP when no password is stored', async () => {
    const configStore = { get: async () => makeConfig() } as unknown as IMailImportConfigStore
    const statusStore = { setStatus: async () => {} } as unknown as IMailImportStatusStore
    const secretStore = { getSecret: async () => null } as unknown as IModuleSecretStore
    const connect = vi.fn()
    const imapClient = { connect } as unknown as IImapClient
    const noteWriter = { writeMail: vi.fn() } as unknown as IMailNoteWriter

    const engine = new MailImportEngine(configStore, statusStore, secretStore, imapClient, noteWriter, createMockLogger())
    const outcome = await engine.runOne('vault-1', 'config-1')

    expect(outcome.result).toBe('error')
    expect(outcome.error).toMatch(/password/i)
    expect(connect).not.toHaveBeenCalled()
  })

  it('throws when the config does not exist', async () => {
    const configStore = { get: async () => null } as unknown as IMailImportConfigStore
    const statusStore = { setStatus: async () => {} } as unknown as IMailImportStatusStore
    const secretStore = { getSecret: async () => null } as unknown as IModuleSecretStore
    const imapClient = { connect: vi.fn() } as unknown as IImapClient
    const noteWriter = { writeMail: vi.fn() } as unknown as IMailNoteWriter

    const engine = new MailImportEngine(configStore, statusStore, secretStore, imapClient, noteWriter, createMockLogger())
    await expect(engine.runOne('vault-1', 'missing')).rejects.toThrow(MailImportConfigNotFoundError)
  })
})
