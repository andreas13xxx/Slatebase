import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type {
  IReplaceService,
  IReplaceOptions,
  ReplaceResponse,
  ReplaceFileResult,
  ReplaceFailure,
} from './types.js'
import { RegexValidationError, RegexTooLongError } from './errors.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of files to process in a single replace operation. */
const MAX_REPLACE_FILES = 100

/** Maximum regex pattern length (characters). */
const MAX_REGEX_LENGTH = 1000

// ─── ReplaceService Implementation ──────────────────────────────────────────

/**
 * Service for performing text replacements in vault files.
 * Uses atomic writes (temp → rename) per file via IVaultService.saveFile.
 * Processes files sequentially with partial failure handling.
 */
export class ReplaceService implements IReplaceService {
  constructor(
    private readonly vaultService: IVaultService,
    private readonly vaultAccessControl: IVaultAccessControl,
    private readonly logger: ILogger,
  ) {
    // vaultAccessControl is stored for potential future use (e.g., per-file access checks)
    void this.vaultAccessControl
  }

  /**
   * Replaces all occurrences of query with replacement in the specified vault.
   * Uses atomic writes (temp → rename) per file.
   * Processes at most 100 files per operation.
   * On partial failure, successful replacements are kept and failed files are reported.
   *
   * Note: Write access must be verified by the caller (route handler) before invoking this method.
   */
  async replace(vaultId: string, options: IReplaceOptions): Promise<ReplaceResponse> {
    // Validate regex pattern if regex mode is enabled
    if (options.regex) {
      this.validateRegex(options.query)
    }

    const files: ReplaceFileResult[] = []
    const failed: ReplaceFailure[] = []
    let totalReplacements = 0

    // Determine which files to process
    const filePaths = await this.resolveFilePaths(vaultId, options)

    // Cap at MAX_REPLACE_FILES
    const filesToProcess = filePaths.slice(0, MAX_REPLACE_FILES)

    // Build the replacer
    const replacer = this.buildReplacer(options)

    // Process files sequentially
    for (const filePath of filesToProcess) {
      try {
        const result = await this.processFile(vaultId, filePath, replacer)
        if (result !== null) {
          files.push(result)
          totalReplacements += result.replacements
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        failed.push({ path: filePath, reason })
      }
    }

    this.logger.info('Replace completed', {
      vaultId,
      query: options.query,
      totalReplacements,
      fileCount: files.length,
      failedCount: failed.length,
    })

    return {
      totalReplacements,
      fileCount: files.length,
      files,
      failed,
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Validates a regex pattern for syntax errors and length.
   * Throws RegexTooLongError if pattern exceeds 1000 characters.
   * Throws RegexValidationError if pattern is not a valid JavaScript regex.
   */
  private validateRegex(pattern: string): void {
    if (pattern.length > MAX_REGEX_LENGTH) {
      throw new RegexTooLongError(pattern.length)
    }

    try {
      new RegExp(pattern)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new RegexValidationError(pattern, reason)
    }
  }

  /**
   * Resolves the list of file paths to process.
   * If options.paths is provided, uses those (already capped at MAX_REPLACE_FILES by caller).
   * Otherwise, searches the vault tree for all text files.
   */
  private async resolveFilePaths(vaultId: string, options: IReplaceOptions): Promise<string[]> {
    if (options.paths && options.paths.length > 0) {
      return options.paths.slice(0, MAX_REPLACE_FILES)
    }

    // Get directory tree and extract all file paths
    const tree = await this.vaultService.getVaultTree(vaultId)
    const allFiles = this.extractFilePaths(tree)
    allFiles.sort((a, b) => a.localeCompare(b))
    return allFiles
  }

  /**
   * Builds a replacer function that applies the replacement to content.
   * Returns a function that takes the full file content and returns
   * { newContent, count } where count is the number of replacements made.
   */
  private buildReplacer(options: IReplaceOptions): (content: string) => { newContent: string; count: number } {
    if (options.regex) {
      const flags = options.caseSensitive ? 'g' : 'gi'
      return (content: string) => {
        // Count matches using exec loop
        const countRegex = new RegExp(options.query, flags)
        let count = 0
        let m: RegExpExecArray | null
        while ((m = countRegex.exec(content)) !== null) {
          count++
          if (m[0].length === 0) countRegex.lastIndex++
        }

        if (count === 0) {
          return { newContent: content, count: 0 }
        }

        // Perform the actual replacement using native String.replace
        // which correctly handles $1, $2, $&, $$, $`, $' patterns
        const replaceRegex = new RegExp(options.query, flags)
        const newContent = content.replace(replaceRegex, options.replacement)
        return { newContent, count }
      }
    }

    // Plain-text replacement
    return (content: string) => {
      const queryLength = options.query.length
      if (queryLength === 0) {
        return { newContent: content, count: 0 }
      }

      let count = 0
      let result = ''
      const searchContent = content
      const searchLower = options.caseSensitive ? content : content.toLowerCase()
      const queryLower = options.caseSensitive ? options.query : options.query.toLowerCase()
      let pos = 0

      while (pos < searchContent.length) {
        const idx = searchLower.indexOf(queryLower, pos)
        if (idx === -1) {
          result += searchContent.substring(pos)
          break
        }
        result += searchContent.substring(pos, idx) + options.replacement
        count++
        pos = idx + queryLength
      }

      return { newContent: result, count }
    }
  }

  /**
   * Processes a single file: reads content, applies replacements, saves if changed.
   * Returns null if no matches were found or file is binary.
   * Throws on read or write failure.
   */
  private async processFile(
    vaultId: string,
    filePath: string,
    replacer: (content: string) => { newContent: string; count: number },
  ): Promise<ReplaceFileResult | null> {
    // Read file content
    const fileContent = await this.vaultService.getFileContent(vaultId, filePath)

    // Skip binary files
    if (fileContent.isBinary) {
      return null
    }

    // Apply replacement
    const { newContent, count } = replacer(fileContent.content)

    // No matches found — skip
    if (count === 0) {
      return null
    }

    // Write the replaced content atomically via vaultService
    await this.vaultService.saveFile(vaultId, filePath, newContent)

    return {
      path: filePath,
      replacements: count,
    }
  }

  /**
   * Extracts all file paths (relative) from a directory tree recursively.
   * Only includes files (not directories). Skips internal files (with _ prefix).
   */
  private extractFilePaths(tree: import('../vault/index.js').DirectoryTree): string[] {
    const paths: string[] = []
    this.collectFiles(tree, paths)
    return paths
  }

  /**
   * Recursively collects file paths from a directory tree node.
   * Skips files with _ prefix (internal files).
   */
  private collectFiles(node: import('../vault/index.js').DirectoryTree, paths: string[]): void {
    if (node.type === 'file') {
      if (node.path) {
        const fileName = this.getFileName(node.path)
        if (!fileName.startsWith('_')) {
          paths.push(node.path)
        }
      }
      return
    }

    if (node.children) {
      for (const child of node.children) {
        this.collectFiles(child, paths)
      }
    }
  }

  /**
   * Gets the file name (last segment) from a relative path.
   */
  private getFileName(filePath: string): string {
    const parts = filePath.split('/')
    return parts[parts.length - 1] ?? filePath
  }
}
