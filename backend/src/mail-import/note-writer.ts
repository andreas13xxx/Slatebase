// MailNoteWriter — writes one converted mail as a Markdown note (+ attachments)
// into a vault. Mirrors the write/refresh pattern of ../import/index.ts
// (ImportService) and the atomic temp-file-then-rename pattern of
// ../api/uploadRoutes.ts.

import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IVaultManager, IVaultReader } from '../vault/index.js'
import { validateFilePath } from '../vault/index.js'
import { generateUniqueFilename } from '../business/unique-filename.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'
import type { ConvertedMail } from './mail-to-markdown.js'

/** Synthetic actor identity used for realtime events published by the background import job (no browser session is involved). */
const MAIL_IMPORT_ACTOR = { userId: 'system:mail-import', username: 'Mail-Import' }

/** Combining diacritical marks (U+0300-U+036F) left behind by NFKD decomposition. */
const COMBINING_DIACRITICS_RE = /[̀-ͯ]/g
const FILESYSTEM_UNSAFE_CHARS_RE = /[/\\:*?"<>|]/g

function slugifySubject(subject: string): string {
  const slug = subject
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS_RE, '')
    .replace(FILESYSTEM_UNSAFE_CHARS_RE, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return slug.length > 0 ? slug : 'Mail'
}

function formatDateForFilename(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}${min}`
}

async function writeFileAtomic(absolutePath: string, content: string | Buffer): Promise<void> {
  const tmpPath = `${absolutePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
  await fs.writeFile(tmpPath, content)
  await fs.rename(tmpPath, absolutePath)
}

export interface IMailNoteWriter {
  /** Writes one mail into `targetFolder` of the vault. Returns the note's vault-relative path. */
  writeMail(vaultId: string, targetFolder: string, mail: ConvertedMail): Promise<string>
}

export class MailNoteWriter implements IMailNoteWriter {
  constructor(
    private readonly vaultManager: IVaultManager,
    private readonly vaultReader: IVaultReader,
    private readonly maxDirectoryDepth: number,
    private readonly logger: ILogger,
    private readonly eventBus?: IEventBus,
    private readonly accessControl?: IVaultAccessControl,
  ) {}

  async writeMail(vaultId: string, targetFolder: string, mail: ConvertedMail): Promise<string> {
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`)
    }

    const targetDirAbsolute = targetFolder ? validateFilePath(vault.info.path, targetFolder) : vault.info.path
    await fs.mkdir(targetDirAbsolute, { recursive: true })

    let noteMarkdown = mail.markdown
    if (mail.attachments.length > 0) {
      const embedLinks = await this.writeAttachments(vaultId, vault.info.path, targetFolder, mail)
      noteMarkdown += `\n\n${embedLinks.join('\n')}\n`
    }

    let existingNoteNames: string[] = []
    try {
      existingNoteNames = await fs.readdir(targetDirAbsolute)
    } catch {
      // Directory was just created — no conflicts possible
    }

    const desiredNoteName = `${formatDateForFilename(mail.date)} ${slugifySubject(mail.subject)}.md`
    const noteName = this.resolveUniqueName(desiredNoteName, existingNoteNames, vaultId, targetFolder || '/')
    const noteRelativePath = targetFolder ? `${targetFolder}/${noteName}` : noteName
    const noteAbsolutePath = validateFilePath(vault.info.path, noteRelativePath)

    await writeFileAtomic(noteAbsolutePath, noteMarkdown)

    const updatedTree = await this.vaultReader.readDirectory(vault.info.path, this.maxDirectoryDepth)
    this.vaultManager.addVault({ info: vault.info, tree: updatedTree })

    this.logger.info('Mail imported as note', {
      vaultId, notePath: noteRelativePath, attachments: mail.attachments.length,
    })

    await this.publishVaultChange(vaultId, noteRelativePath)

    return noteRelativePath
  }

  /**
   * Publishes a vault:change event so open sessions refresh their file tree.
   * Unlike API-triggered changes, there's no browser session to exclude —
   * every user with access to the vault should be notified.
   */
  private async publishVaultChange(vaultId: string, filePath: string): Promise<void> {
    if (!this.eventBus) return

    const target = this.accessControl
      ? { kind: 'users' as const, userIds: await this.accessControl.getUsersWithAccess(vaultId) }
      : { kind: 'broadcast' as const }

    this.eventBus.publish({
      type: 'vault:change',
      payload: { vaultId, action: 'saved', path: filePath, ...MAIL_IMPORT_ACTOR },
      target,
    })
  }

  /** Writes attachments into `<targetFolder>/attachments/` and returns their Obsidian-style embed links. */
  private async writeAttachments(vaultId: string, vaultPath: string, targetFolder: string, mail: ConvertedMail): Promise<string[]> {
    const attachmentsRelativeDir = targetFolder ? `${targetFolder}/attachments` : 'attachments'
    const attachmentsAbsoluteDir = validateFilePath(vaultPath, attachmentsRelativeDir)
    await fs.mkdir(attachmentsAbsoluteDir, { recursive: true })

    let existingNames: string[] = []
    try {
      existingNames = await fs.readdir(attachmentsAbsoluteDir)
    } catch {
      // Directory was just created — no conflicts possible
    }

    const embedLinks: string[] = []
    for (const attachment of mail.attachments) {
      const uniqueName = this.resolveUniqueName(attachment.filename, existingNames, vaultId, attachmentsRelativeDir)
      existingNames.push(uniqueName)

      const attachmentAbsolutePath = validateFilePath(vaultPath, `${attachmentsRelativeDir}/${uniqueName}`)
      await writeFileAtomic(attachmentAbsolutePath, attachment.content)

      embedLinks.push(`![[${uniqueName}]]`)
    }

    return embedLinks
  }

  /**
   * Resolves a filename collision the same way uploads do (append `-1`,
   * `-2`, ... rather than overwrite), but also logs it: silent renames make
   * it look like content went missing when in fact a same-named file
   * already existed and a sibling was created instead.
   */
  private resolveUniqueName(desiredName: string, existingNames: string[], vaultId: string, location: string): string {
    const uniqueName = generateUniqueFilename(desiredName, existingNames)
    if (uniqueName !== desiredName) {
      this.logger.warn('Mail-import: filename collision, writing under a new name instead of overwriting', {
        vaultId, location, desiredName, writtenAs: uniqueName,
      })
    }
    return uniqueName
  }
}
