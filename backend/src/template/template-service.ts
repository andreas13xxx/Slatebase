// TemplateService — reads template files and creates notes from templates

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ILogger } from '../logger/index.js'
import type { IVaultManager } from '../vault/index.js'
import { validateFilePath } from '../vault/index.js'
import type { ITemplateService, TemplateInfo } from './types.js'
import { TemplateNotFoundError, TemplateConflictError } from './errors.js'
import type { IVaultConfigService } from '../vault-config/index.js'

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Service for managing note templates.
 * Reads `.md` files (without `_` prefix) from a configurable directory
 * and creates new files with placeholder substitution.
 * Uses per-vault config (if available) to determine the templates directory,
 * falling back to the global default from server configuration.
 */
export class TemplateService implements ITemplateService {
  private static readonly MAX_TEMPLATES = 100

  constructor(
    private readonly defaultTemplatesDirectory: string,
    private readonly vaultManager: IVaultManager,
    private readonly logger: ILogger,
    private readonly vaultConfigService?: IVaultConfigService,
  ) {}

  /**
   * Lists available templates from the configured template directory.
   * Returns `.md` files that do not start with `_`, sorted alphabetically,
   * capped at 100 entries. Returns an empty list when the directory does not exist.
   */
  async listTemplates(vaultId: string): Promise<TemplateInfo[]> {
    const vaultDataDir = this.resolveVaultDataDir(vaultId)
    const templatesDir = await this.resolveTemplatesDirectory(vaultId)
    const templatesPath = path.join(vaultDataDir, templatesDir)

    try {
      const entries = await fs.readdir(templatesPath, { withFileTypes: true })

      const templates: TemplateInfo[] = entries
        .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
        .map(e => ({
          name: e.name.replace(/\.md$/, ''),
          path: e.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, TemplateService.MAX_TEMPLATES)

      return templates
    } catch (error: unknown) {
      // Return empty list when template directory doesn't exist
      if (this.isNodeError(error) && error.code === 'ENOENT') {
        this.logger.debug('Template directory does not exist', {
          vaultId,
          path: templatesPath,
        })
        return []
      }
      throw error
    }
  }

  /**
   * Creates a new file from a template with placeholder replacement.
   * Reads the template, substitutes known placeholders, validates the target path,
   * checks for conflicts, and writes the file atomically.
   */
  async createFromTemplate(
    vaultId: string,
    templateName: string,
    targetDir: string,
    fileName: string,
  ): Promise<{ path: string; content: string }> {
    const vaultDataDir = this.resolveVaultDataDir(vaultId)
    const templatesDir = await this.resolveTemplatesDirectory(vaultId)

    // 1. Read template content
    const templateFileName = templateName.endsWith('.md') ? templateName : `${templateName}.md`
    const templatePath = path.join(vaultDataDir, templatesDir, templateFileName)

    // Validate template path stays within vault (path traversal protection)
    validateFilePath(vaultDataDir, path.join(templatesDir, templateFileName))

    let templateContent: string
    try {
      templateContent = await fs.readFile(templatePath, 'utf-8')
    } catch (error: unknown) {
      if (this.isNodeError(error) && error.code === 'ENOENT') {
        throw new TemplateNotFoundError(templateName)
      }
      throw error
    }

    // 2. Replace placeholders
    const normalizedFileName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
    const content = this.replacePlaceholders(templateContent, normalizedFileName)

    // 3. Compute target path
    const outputFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`
    const relativePath = targetDir
      ? path.join(targetDir, outputFileName).replace(/\\/g, '/')
      : outputFileName

    // 4. Validate target path (path traversal protection)
    const resolvedTargetPath = validateFilePath(vaultDataDir, relativePath)

    // 5. Check for existing file (conflict)
    try {
      await fs.access(resolvedTargetPath)
      // File exists — conflict
      throw new TemplateConflictError(relativePath)
    } catch (error: unknown) {
      if (error instanceof TemplateConflictError) {
        throw error
      }
      // ENOENT is expected — file doesn't exist, proceed
      if (!this.isNodeError(error) || error.code !== 'ENOENT') {
        throw error
      }
    }

    // 6. Ensure target directory exists
    const targetDirPath = path.dirname(resolvedTargetPath)
    await fs.mkdir(targetDirPath, { recursive: true })

    // 7. Write atomically (temp file → rename)
    const tmpFile = `${resolvedTargetPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
    await fs.writeFile(tmpFile, content, 'utf-8')
    await fs.rename(tmpFile, resolvedTargetPath)

    this.logger.info('File created from template', {
      vaultId,
      template: templateName,
      target: relativePath,
    })

    return { path: relativePath, content }
  }

  /**
   * Replaces known placeholders in template content.
   * `{{date}}` → YYYY-MM-DD (server local time)
   * `{{time}}` → HH:mm (server local time)
   * `{{title}}` → fileName without extension
   * Unrecognized `{{...}}` placeholders remain as-is.
   */
  private replacePlaceholders(content: string, title: string): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')

    const date = `${year}-${month}-${day}`
    const time = `${hours}:${minutes}`

    return content
      .replace(/\{\{date\}\}/g, date)
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{title\}\}/g, title)
  }

  /**
   * Resolves the templates directory for a vault.
   * Uses per-vault config if available, otherwise falls back to global default.
   */
  private async resolveTemplatesDirectory(vaultId: string): Promise<string> {
    if (this.vaultConfigService) {
      try {
        return await this.vaultConfigService.getTemplatesDirectory(vaultId)
      } catch {
        // Fall back to default on error
      }
    }
    return this.defaultTemplatesDirectory
  }

  /**
   * Resolves vaultId to the vault's absolute data directory path.
   * Throws if the vault is not found.
   */
  private resolveVaultDataDir(vaultId: string): string {
    const vault = this.vaultManager.getVault(vaultId)
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`)
    }
    return vault.info.path
  }

  /**
   * Type guard for Node.js filesystem errors with a `code` property.
   */
  private isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error
  }
}
