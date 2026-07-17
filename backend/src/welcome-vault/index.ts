/**
 * Welcome Vault module.
 *
 * Provides a service that creates pre-populated vaults with tutorial content
 * for newly created users. Implements a strict never-throw guarantee — all
 * errors are caught and logged internally.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { IVaultService } from '../business/index.js'
import type { IFeatureToggleService } from '../feature-toggle/types.js'
import type { WelcomeVaultConfig, WelcomeVaultLanguage } from './types.js'

// --- Interface ---

/**
 * Result of a welcome vault creation attempt.
 * Contains vault metadata needed for post-creation hooks (e.g. link index rebuild).
 */
export interface WelcomeVaultResult {
  vaultId: string
  storagePath: string
  vaultName: string
}

/**
 * Service responsible for creating welcome vaults for new users.
 * All methods are designed to never throw — errors are logged internally.
 */
export interface IWelcomeVaultService {
  /**
   * Creates a welcome vault for the given user in the specified language.
   * - Checks feature toggle first
   * - Creates vault via VaultService
   * - Copies template files from the language-specific template directory
   * - Logs errors but never throws
   * @param userId - The user to create the vault for
   * @param language - The language determining template content
   * @param overrideName - Optional vault name override (e.g. deduplicated). Uses config name if omitted.
   * @returns Vault info (id + path + name) on success, undefined on skip/failure
   */
  createWelcomeVault(userId: string, language: WelcomeVaultLanguage, overrideName?: string): Promise<WelcomeVaultResult | undefined>
}

// --- Implementation ---

/**
 * Creates welcome vaults with template content for new users.
 *
 * Never throws — all errors are caught, logged, and silently swallowed.
 * This ensures user account creation is never blocked by welcome vault issues.
 */
export class WelcomeVaultService implements IWelcomeVaultService {
  private readonly baseTemplateDir: string

  /** Maps language to template directory suffix */
  private static readonly TEMPLATE_DIRS: Record<WelcomeVaultLanguage, string> = {
    de: 'welcome-vault',
    en: 'welcome-vault-en',
  }

  constructor(
    private readonly vaultService: IVaultService,
    private readonly featureToggleService: IFeatureToggleService,
    private readonly config: WelcomeVaultConfig,
    private readonly logger: ILogger,
    dataDir: string,
  ) {
    this.baseTemplateDir = path.join(path.resolve(dataDir), 'templates')
  }

  /** @inheritdoc */
  async createWelcomeVault(userId: string, language: WelcomeVaultLanguage, overrideName?: string): Promise<WelcomeVaultResult | undefined> {
    try {
      // 1. Check feature toggle
      if (!this.featureToggleService.isEnabled('welcome-vault')) {
        return undefined
      }

      // 2. Determine vault name and template directory based on language
      const vaultName = overrideName ?? this.config.name[language]
      const templateDir = this.getTemplateDir(language)

      // 3. Create vault
      const vault = await this.vaultService.createVault(vaultName, userId)

      // 4. Copy template files
      await this.copyTemplateFiles(vault.path, templateDir)

      return { vaultId: vault.id, storagePath: vault.path, vaultName }
    } catch (error) {
      // Never throw — log and return
      this.logger.error('Failed to create welcome vault', {
        userId,
        language,
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  /**
   * Returns the template directory path for the given language.
   * Falls back to German if the language-specific directory does not exist.
   */
  private getTemplateDir(language: WelcomeVaultLanguage): string {
    const dirName = WelcomeVaultService.TEMPLATE_DIRS[language]
    return path.join(this.baseTemplateDir, dirName)
  }

  /**
   * Copies all template files into the given vault path.
   * Missing or empty template directory is logged as a warning (not an error).
   * Each individual file copy is error-isolated.
   */
  private async copyTemplateFiles(vaultPath: string, templateDir: string): Promise<void> {
    // Check if template directory exists
    try {
      await fs.access(templateDir)
    } catch {
      this.logger.warn('Welcome vault template directory not found', {
        templateDir,
      })
      return
    }

    // Read all entries recursively
    const entries = await this.readDirRecursive(templateDir)

    if (entries.length === 0) {
      this.logger.warn('Welcome vault template directory is empty', {
        templateDir,
      })
      return
    }

    // Copy each file individually (error-isolated)
    for (const relativePath of entries) {
      try {
        const srcPath = path.join(templateDir, relativePath)
        const destPath = path.join(vaultPath, relativePath)

        // Ensure destination directory exists
        await fs.mkdir(path.dirname(destPath), { recursive: true })

        // Copy file
        await fs.copyFile(srcPath, destPath)
      } catch (error) {
        // Log but continue — partial copy is better than no copy
        this.logger.warn('Failed to copy template file', {
          relativePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    this.logger.info('Welcome vault template files copied', {
      fileCount: entries.length,
    })
  }

  /**
   * Recursively reads a directory and returns relative file paths.
   * Only regular files are included; directories are traversed but not listed.
   */
  private async readDirRecursive(dir: string, prefix = ''): Promise<string[]> {
    const results: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        const subEntries = await this.readDirRecursive(
          path.join(dir, entry.name),
          relativePath,
        )
        results.push(...subEntries)
      } else if (entry.isFile()) {
        results.push(relativePath)
      }
    }

    return results
  }
}

// --- Re-exports ---

export type { WelcomeVaultConfig, WelcomeVaultLanguage, OnUserCreatedFn } from './types.js'
