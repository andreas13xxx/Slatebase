// ─── Plugin Installer ─────────────────────────────────────────────────────────
// Handles ZIP upload processing, manifest validation, bundle integrity checks,
// version upgrade logic, and plugin installation.

import AdmZip from 'adm-zip'
import { PLUGIN_LIMITS, formatPluginLimit } from '@slatebase/shared-contracts'
import type { IInstalledPluginStore, PluginManifest } from './types.js'
import { pluginManifestSchema } from './validation.js'
import { compareSemver } from '../shared/semver.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum ZIP file size (see shared-contracts plugin-limits.ts) */
const MAX_ZIP_SIZE = PLUGIN_LIMITS.maxZipBytes

/** Maximum total extracted size */
const MAX_EXTRACTED_SIZE = PLUGIN_LIMITS.maxExtractedBytes

/** Patterns in bundle source that indicate unsafe code */
const UNSAFE_PATTERNS: readonly string[] = [
  'eval(',
  'new Function(',
  'document.write(',
]

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of a successful plugin installation */
export interface PluginInstallResult {
  pluginId: string
  manifest: PluginManifest
  isUpgrade: boolean
  /** Warnings about detected patterns that may indicate unsafe code (non-blocking) */
  warnings: string[]
}

/** Interface for the plugin installer */
export interface IPluginInstaller {
  /** Install a plugin from a ZIP buffer */
  installFromZip(vaultId: string, zipBuffer: Buffer): Promise<PluginInstallResult>
}

/** Error thrown when plugin installation fails */
export class PluginInstallError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'PluginInstallError'
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Handles ZIP upload processing and plugin installation.
 *
 * Installation logic:
 * 1. Validate ZIP size ≤ PLUGIN_LIMITS.maxZipBytes (50 MB)
 * 2. Extract ZIP into memory
 * 3. Find manifest.json + main.js (in root or single subdirectory)
 * 4. Validate manifest (Zod schema)
 * 5. Check bundle integrity (warn about eval, new Function, document.write)
 * 6. Calculate total extracted size — reject if > PLUGIN_LIMITS.maxExtractedBytes (100 MB)
 * 7. Check if plugin already installed:
 *    - Not installed → fresh install
 *    - Installed with lower version → upgrade (preserve data.json)
 *    - Installed with same/higher version → reject
 * 8. Save files to PluginStore
 * 9. Return install result
 */
export class PluginInstaller implements IPluginInstaller {
  constructor(private readonly pluginStore: IInstalledPluginStore) {}

  /**
   * Install a plugin from a ZIP buffer.
   * @param vaultId - The vault to install the plugin into
   * @param zipBuffer - Raw ZIP file content
   * @returns Installation result with plugin ID, manifest, and upgrade status
   * @throws PluginInstallError on validation or installation failure
   */
  async installFromZip(vaultId: string, zipBuffer: Buffer): Promise<PluginInstallResult> {
    // Step 1: Validate ZIP size
    if (zipBuffer.length > MAX_ZIP_SIZE) {
      throw new PluginInstallError(
        `ZIP file exceeds maximum size of ${formatPluginLimit(MAX_ZIP_SIZE)} (actual: ${formatPluginLimit(zipBuffer.length)}, ${zipBuffer.length} bytes)`,
        'ZIP_TOO_LARGE',
      )
    }

    // Step 2: Extract ZIP into memory
    let zip: AdmZip
    try {
      zip = new AdmZip(zipBuffer)
    } catch {
      throw new PluginInstallError(
        'ZIP file is not readable or corrupted',
        'ZIP_INVALID',
      )
    }

    const entries = zip.getEntries()

    // Step 3: Find manifest.json + main.js
    const extracted = this.findPluginFiles(entries)

    // Step 4: Validate manifest
    const manifest = this.validateManifest(extracted.manifestContent)

    // Step 5: Check bundle integrity (warnings, non-blocking)
    const warnings = this.checkBundleIntegrity(extracted.bundleContent, manifest.id)

    // Step 6: Calculate total extracted size
    this.validateExtractedSize(entries)

    // Step 7: Check existing installation (version comparison)
    const existingManifest = await this.pluginStore.loadManifest(vaultId, manifest.id)
    let isUpgrade = false

    if (existingManifest !== null) {
      const comparison = compareSemver(manifest.version, existingManifest.version)
      if (comparison <= 0) {
        throw new PluginInstallError(
          `Plugin "${manifest.id}" is already installed with version ${existingManifest.version}. ` +
          `Uploaded version ${manifest.version} is not higher.`,
          'VERSION_NOT_HIGHER',
        )
      }
      isUpgrade = true
    }

    // Step 8: Save files to PluginStore
    const files = extracted.stylesContent !== undefined
      ? { manifest: extracted.manifestContent, bundle: extracted.bundleContent, styles: extracted.stylesContent }
      : { manifest: extracted.manifestContent, bundle: extracted.bundleContent }
    await this.pluginStore.savePlugin(vaultId, manifest.id, files)

    // Step 9: Return install result
    return {
      pluginId: manifest.id,
      manifest,
      isUpgrade,
      warnings,
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Find manifest.json and main.js in the ZIP entries.
   * Supports two layouts:
   * - Root: manifest.json and main.js directly in ZIP root
   * - Subdirectory: A single directory containing manifest.json and main.js
   */
  private findPluginFiles(entries: AdmZip.IZipEntry[]): ExtractedPluginFiles {
    // Try root-level first
    const rootManifest = this.findEntry(entries, 'manifest.json')
    const rootBundle = this.findEntry(entries, 'main.js')

    if (rootManifest && rootBundle) {
      const rootStyles = this.findEntry(entries, 'styles.css')
      const result: ExtractedPluginFiles = {
        manifestContent: rootManifest.getData().toString('utf-8'),
        bundleContent: rootBundle.getData().toString('utf-8'),
      }
      if (rootStyles) {
        result.stylesContent = rootStyles.getData().toString('utf-8')
      }
      return result
    }

    // Try single subdirectory layout
    const subdirs = this.getTopLevelDirectories(entries)

    if (subdirs.length === 1) {
      const prefix = subdirs[0]!
      const subManifest = this.findEntry(entries, `${prefix}manifest.json`)
      const subBundle = this.findEntry(entries, `${prefix}main.js`)

      if (subManifest && subBundle) {
        const subStyles = this.findEntry(entries, `${prefix}styles.css`)
        const result: ExtractedPluginFiles = {
          manifestContent: subManifest.getData().toString('utf-8'),
          bundleContent: subBundle.getData().toString('utf-8'),
        }
        if (subStyles) {
          result.stylesContent = subStyles.getData().toString('utf-8')
        }
        return result
      }
    }

    // Neither layout found
    const missingFiles: string[] = []
    if (!rootManifest && !this.hasFileInAnySubdir(entries, 'manifest.json')) {
      missingFiles.push('manifest.json')
    }
    if (!rootBundle && !this.hasFileInAnySubdir(entries, 'main.js')) {
      missingFiles.push('main.js')
    }

    throw new PluginInstallError(
      `ZIP file does not contain required plugin files: ${missingFiles.join(', ')}. ` +
      `Expected manifest.json and main.js in root or in a single subdirectory.`,
      'MISSING_FILES',
    )
  }

  /**
   * Find a ZIP entry by exact path (case-sensitive).
   */
  private findEntry(entries: AdmZip.IZipEntry[], entryPath: string): AdmZip.IZipEntry | undefined {
    return entries.find(e => e.entryName === entryPath)
  }

  /**
   * Get unique top-level directory prefixes from entries.
   * E.g., entries like "plugin-name/manifest.json" → ["plugin-name/"]
   */
  private getTopLevelDirectories(entries: AdmZip.IZipEntry[]): string[] {
    const dirs = new Set<string>()
    for (const entry of entries) {
      const slashIndex = entry.entryName.indexOf('/')
      if (slashIndex > 0) {
        dirs.add(entry.entryName.substring(0, slashIndex + 1))
      }
    }
    return [...dirs]
  }

  /**
   * Check if a file exists in any subdirectory.
   */
  private hasFileInAnySubdir(entries: AdmZip.IZipEntry[], fileName: string): boolean {
    return entries.some(e => e.entryName.endsWith(`/${fileName}`) || e.entryName === fileName)
  }

  /**
   * Validate manifest content using the Zod schema.
   * @throws PluginInstallError if manifest is invalid.
   */
  private validateManifest(manifestContent: string): PluginManifest {
    let parsed: unknown
    try {
      parsed = JSON.parse(manifestContent)
    } catch {
      throw new PluginInstallError(
        'manifest.json contains invalid JSON',
        'MANIFEST_INVALID_JSON',
      )
    }

    const result = pluginManifestSchema.safeParse(parsed)
    if (!result.success) {
      const firstIssue = result.error.issues[0]
      const field = firstIssue?.path[0]?.toString() ?? 'unknown'
      throw new PluginInstallError(
        `Manifest validation failed: field "${field}" — ${firstIssue?.message ?? 'invalid'}`,
        'MANIFEST_VALIDATION_FAILED',
      )
    }

    return result.data as PluginManifest
  }

  /**
   * Check bundle source for unsafe patterns.
   * Returns warnings for detected patterns (non-blocking).
   * Many bundlers emit `new Function(` in their output — this is not necessarily malicious.
   */
  private checkBundleIntegrity(bundleContent: string, pluginId: string): string[] {
    const warnings: string[] = []
    for (const pattern of UNSAFE_PATTERNS) {
      if (bundleContent.includes(pattern)) {
        warnings.push(
          `Plugin "${pluginId}" bundle contains pattern: "${pattern}". ` +
          `This may be bundler-generated code, but review the plugin if unexpected.`,
        )
      }
    }
    return warnings
  }

  /**
   * Validate that total extracted size does not exceed PLUGIN_LIMITS.maxExtractedBytes.
   * @throws PluginInstallError if total size exceeds limit.
   */
  private validateExtractedSize(entries: AdmZip.IZipEntry[]): void {
    let totalSize = 0
    for (const entry of entries) {
      if (!entry.isDirectory) {
        totalSize += entry.header.size
      }
    }

    if (totalSize > MAX_EXTRACTED_SIZE) {
      throw new PluginInstallError(
        `Extracted content exceeds maximum size of ${formatPluginLimit(MAX_EXTRACTED_SIZE)} (actual: ${formatPluginLimit(totalSize)}, ${totalSize} bytes)`,
        'EXTRACTED_TOO_LARGE',
      )
    }
  }
}

// Re-exported for backward compatibility — callers of this module (and
// plugin/index.ts's barrel export) import compareSemver from here.
export { compareSemver }

// ─── Internal Types ──────────────────────────────────────────────────────────

interface ExtractedPluginFiles {
  manifestContent: string
  bundleContent: string
  stylesContent?: string
}
