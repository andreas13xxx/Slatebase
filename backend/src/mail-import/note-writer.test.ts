import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MailNoteWriter } from './note-writer.js'
import { VaultReader, VaultManager } from '../vault/index.js'
import type { ConvertedMail } from './mail-to-markdown.js'

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as import('../logger/index.js').ILogger
}

const MAIL_DATE = new Date('2026-01-05T10:30:00.000Z')

/** Mirrors note-writer's own local-time filename formatting, so the expected
 * filename in each test is independent of the machine's timezone. */
function expectedDatePrefix(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}${min}`
}

function makeMail(overrides: Partial<ConvertedMail> = {}): ConvertedMail {
  return {
    markdown: '---\nsubject: "Test"\n---\nHello\n',
    attachments: [],
    subject: 'Test',
    date: MAIL_DATE,
    ...overrides,
  }
}

describe('MailNoteWriter', () => {
  let vaultPath: string
  let vaultManager: VaultManager
  let writer: MailNoteWriter
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    vaultPath = await mkdtemp(join(tmpdir(), 'mail-note-writer-vault-'))
    const vaultReader = new VaultReader()
    vaultManager = new VaultManager(vaultReader, createMockLogger(), 10)
    vaultManager.addVault({
      info: { id: 'vault-1', name: 'Vault', path: vaultPath, status: 'loaded' },
      tree: await vaultReader.readDirectory(vaultPath, 10),
    })
    logger = createMockLogger()
    writer = new MailNoteWriter(vaultManager, vaultReader, 10, logger)
  })

  afterEach(async () => {
    await rm(vaultPath, { recursive: true, force: true })
  })

  it('writes a note into the target folder, creating it if needed', async () => {
    const relativePath = await writer.writeMail('vault-1', 'Mail', makeMail())
    expect(relativePath).toBe(`Mail/${expectedDatePrefix(MAIL_DATE)} Test.md`)

    const content = await readFile(join(vaultPath, relativePath), 'utf-8')
    expect(content).toContain('Hello')
  })

  it('writes to the vault root when targetFolder is empty', async () => {
    const relativePath = await writer.writeMail('vault-1', '', makeMail())
    expect(relativePath).toBe(`${expectedDatePrefix(MAIL_DATE)} Test.md`)
  })

  it('de-duplicates note filenames on repeated imports with the same subject/date, and logs the collision', async () => {
    const first = await writer.writeMail('vault-1', 'Mail', makeMail())
    const second = await writer.writeMail('vault-1', 'Mail', makeMail())
    expect(first).not.toBe(second)
    expect(second).toBe(`Mail/${expectedDatePrefix(MAIL_DATE)} Test-1.md`)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('filename collision'),
      expect.objectContaining({
        vaultId: 'vault-1',
        desiredName: `${expectedDatePrefix(MAIL_DATE)} Test.md`,
        writtenAs: `${expectedDatePrefix(MAIL_DATE)} Test-1.md`,
      }),
    )
  })

  it('writes attachments into <targetFolder>/attachments and embeds them as wikilinks', async () => {
    const mail = makeMail({
      attachments: [{ filename: 'invoice.pdf', content: Buffer.from('pdf-bytes'), contentType: 'application/pdf' }],
    })
    const relativePath = await writer.writeMail('vault-1', 'Mail', mail)

    const note = await readFile(join(vaultPath, relativePath), 'utf-8')
    expect(note).toContain('![[invoice.pdf]]')

    const attachmentContent = await readFile(join(vaultPath, 'Mail', 'attachments', 'invoice.pdf'), 'utf-8')
    expect(attachmentContent).toBe('pdf-bytes')
  })

  it('de-duplicates attachment filenames across imports, and logs the collision', async () => {
    const mail = makeMail({
      attachments: [{ filename: 'invoice.pdf', content: Buffer.from('first'), contentType: 'application/pdf' }],
    })
    await writer.writeMail('vault-1', 'Mail', mail)
    vi.mocked(logger.warn).mockClear()
    await writer.writeMail('vault-1', 'Mail', {
      ...mail,
      attachments: [{ filename: 'invoice.pdf', content: Buffer.from('second'), contentType: 'application/pdf' }],
    })

    const files = await readdir(join(vaultPath, 'Mail', 'attachments'))
    expect(files.sort()).toEqual(['invoice-1.pdf', 'invoice.pdf'])

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('filename collision'),
      expect.objectContaining({ vaultId: 'vault-1', desiredName: 'invoice.pdf', writtenAs: 'invoice-1.pdf' }),
    )
  })

  it('sanitizes filesystem-unsafe characters in the subject', async () => {
    const mail = makeMail({ subject: 'Re: Invoice/Order #42 "urgent"' })
    const relativePath = await writer.writeMail('vault-1', '', mail)
    expect(relativePath).toBe(`${expectedDatePrefix(MAIL_DATE)} Re InvoiceOrder #42 urgent.md`)
  })
})
