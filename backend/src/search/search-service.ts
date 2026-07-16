import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type {
  ISearchService,
  ISearchOptions,
  SearchResponse,
  SearchFileResult,
  SearchHit,
  SkippedFile,
  MultiVaultSearchResponse,
  VaultSearchResult,
  FailedVault,
} from './types.js'
import { RegexValidationError, RegexTooLongError } from './errors.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of files to search in a single operation. */
const MAX_FILES = 1000

/** Global timeout for search operations in milliseconds (30 seconds). */
const GLOBAL_TIMEOUT_MS = 30_000

/** Per-file regex evaluation timeout in milliseconds (5 seconds). */
const PER_FILE_REGEX_TIMEOUT_MS = 5_000

/** Maximum file size to search (10 MB). */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** Maximum length of matched text returned per hit. */
const MAX_MATCH_TEXT_LENGTH = 200

/** Maximum regex pattern length (characters). */
const MAX_REGEX_LENGTH = 1000

// ─── SearchService Implementation ───────────────────────────────────────────

/**
 * Service for performing full-text search across vault files.
 * Iterates text files linearly, matching plain-text or regex patterns.
 * Respects file limit (1000), time limit (30s), and result limit (maxResults).
 */
export class SearchService implements ISearchService {
  constructor(
    private readonly vaultService: IVaultService,
    private readonly _vaultAccessControl: IVaultAccessControl,
    private readonly logger: ILogger,
  ) {}

  /**
   * Searches all text files in a vault for the given query.
   * Respects file limit (1000), time limit (30s), and result limit (maxResults).
   */
  async search(vaultId: string, options: ISearchOptions): Promise<SearchResponse> {
    const startTime = Date.now()

    // Validate regex pattern if regex mode is enabled
    if (options.regex) {
      this.validateRegex(options.query)
    }

    const results: SearchFileResult[] = []
    const skippedFiles: SkippedFile[] = []
    let totalHits = 0
    let filesSearched = 0
    let truncated = false
    let truncationReason: 'file_limit' | 'time_limit' | 'result_limit' | undefined
    let truncationMessage: string | undefined

    // Get directory tree and extract all file paths
    const tree = await this.vaultService.getVaultTree(vaultId)
    const allFiles = this.extractFilePaths(tree)

    // Sort alphabetically and cap at MAX_FILES
    allFiles.sort((a, b) => a.localeCompare(b))

    let filesToSearch: string[]
    if (allFiles.length > MAX_FILES) {
      filesToSearch = allFiles.slice(0, MAX_FILES)
      truncated = true
      truncationReason = 'file_limit'
      truncationMessage = `Dateilimit von ${MAX_FILES} erreicht. Nicht alle Dateien wurden durchsucht.`
    } else {
      filesToSearch = allFiles
    }

    // Build regex or plain-text matcher
    const matcher = this.buildMatcher(options)

    // Iterate over files
    for (const filePath of filesToSearch) {
      // Check global timeout
      if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
        truncated = true
        truncationReason = 'time_limit'
        truncationMessage = 'Zeitlimit von 30 Sekunden erreicht. Nicht alle Dateien wurden durchsucht.'
        break
      }

      // Check result limit
      if (totalHits >= options.maxResults) {
        truncated = true
        truncationReason = 'result_limit'
        truncationMessage = `Ergebnislimit von ${options.maxResults} erreicht. Es existieren weitere Treffer.`
        break
      }

      // Read file content
      let fileContent: { content: string; size: number; isBinary: boolean }
      try {
        const fc = await this.vaultService.getFileContent(vaultId, filePath)

        // Skip files that are too large
        if (fc.size > MAX_FILE_SIZE) {
          skippedFiles.push({ path: filePath, reason: 'too_large' })
          continue
        }

        // Skip binary files
        if (fc.isBinary) {
          skippedFiles.push({ path: filePath, reason: 'binary' })
          continue
        }

        fileContent = { content: fc.content, size: fc.size, isBinary: fc.isBinary }
      } catch {
        skippedFiles.push({ path: filePath, reason: 'unreadable' })
        continue
      }

      filesSearched++

      // Search within the file
      const fileHits = this.searchInFile(
        fileContent.content,
        matcher,
        options,
        startTime,
        filePath,
      )

      if (fileHits === null) {
        // Per-file regex timeout — skip file
        skippedFiles.push({ path: filePath, reason: 'unreadable' })
        continue
      }

      if (fileHits.length === 0) {
        continue
      }

      // Enforce result limit
      const remainingSlots = options.maxResults - totalHits
      const hitsToKeep = fileHits.length <= remainingSlots ? fileHits : fileHits.slice(0, remainingSlots)

      if (hitsToKeep.length > 0) {
        results.push({
          filePath,
          fileName: this.getFileName(filePath),
          hits: hitsToKeep,
          hitCount: hitsToKeep.length,
        })
        totalHits += hitsToKeep.length
      }

      // Check if we hit the result limit after adding
      if (totalHits >= options.maxResults) {
        truncated = true
        truncationReason = 'result_limit'
        truncationMessage = `Ergebnislimit von ${options.maxResults} erreicht. Es existieren weitere Treffer.`
      }
    }

    const durationMs = Date.now() - startTime

    this.logger.info('Search completed', {
      vaultId,
      query: options.query,
      totalHits,
      filesSearched,
      truncated,
      durationMs,
    })

    const response: SearchResponse = {
      results,
      totalHits,
      filesSearched,
      truncated,
      skippedFiles,
      durationMs,
    }

    if (truncationReason !== undefined) {
      response.truncationReason = truncationReason
    }

    if (truncationMessage !== undefined) {
      response.truncationMessage = truncationMessage
    }

    return response
  }

  /**
   * Searches across multiple vaults.
   * Filters vaults by user read access, enforces global file limit (1000)
   * and time limit (30s) across all vaults.
   * Returns partial results on vault failure. Results sorted alphabetically by vault name.
   *
   * @param userId - The authenticated user's ID for access control checks
   * @param vaultIds - Specific vault IDs to search (max 20). If empty, searches all accessible vaults.
   * @param options - Search options (query, caseSensitive, regex, contextLines, maxResults)
   */
  async searchMultiVault(userId: string, vaultIds: string[], options: ISearchOptions): Promise<MultiVaultSearchResponse> {
    const startTime = Date.now()

    // Validate regex pattern if regex mode is enabled
    if (options.regex) {
      this.validateRegex(options.query)
    }

    // Determine which vaults to search
    let vaultsToSearch: Array<{ id: string; name: string }>

    if (vaultIds.length === 0) {
      // Search all vaults the user has read access to
      const allVaults = await this.vaultService.getVaultList(userId)
      vaultsToSearch = allVaults.map((v) => ({ id: v.id, name: v.name }))
    } else {
      // Cap at 20 vault IDs
      const limitedIds = vaultIds.slice(0, 20)

      // Filter by read access — only include vaults the user can read
      const accessible: Array<{ id: string; name: string }> = []
      for (const vId of limitedIds) {
        try {
          await this._vaultAccessControl.checkReadAccess(vId, userId)
          // Get vault name via getVaultTree (which throws VaultNotFoundError if missing)
          const allVaults = await this.vaultService.getVaultList(userId)
          const vaultInfo = allVaults.find((v) => v.id === vId)
          if (vaultInfo) {
            accessible.push({ id: vaultInfo.id, name: vaultInfo.name })
          }
        } catch {
          // User doesn't have access or vault doesn't exist — skip silently
        }
      }
      vaultsToSearch = accessible
    }

    // Sort vaults alphabetically by name for processing order
    vaultsToSearch.sort((a, b) => a.name.localeCompare(b.name))

    const vaultResults: VaultSearchResult[] = []
    const failedVaults: FailedVault[] = []
    let totalHits = 0
    let totalFilesSearched = 0
    let truncated = false
    let truncationReason: 'file_limit' | 'time_limit' | 'result_limit' | undefined
    let truncationMessage: string | undefined
    let globalFilesProcessed = 0

    // Build regex or plain-text matcher
    const matcher = this.buildMatcher(options)

    for (const vault of vaultsToSearch) {
      // Check global timeout
      if (Date.now() - startTime > GLOBAL_TIMEOUT_MS) {
        truncated = true
        truncationReason = 'time_limit'
        truncationMessage = 'Zeitlimit von 30 Sekunden erreicht. Nicht alle Vaults wurden durchsucht.'
        break
      }

      // Check global file limit
      if (globalFilesProcessed >= MAX_FILES) {
        truncated = true
        truncationReason = 'file_limit'
        truncationMessage = `Dateilimit von ${MAX_FILES} erreicht. Nicht alle Vaults wurden durchsucht.`
        break
      }

      // Check result limit
      if (totalHits >= options.maxResults) {
        truncated = true
        truncationReason = 'result_limit'
        truncationMessage = `Ergebnislimit von ${options.maxResults} erreicht. Es existieren weitere Treffer.`
        break
      }

      try {
        const vaultSearchResult = await this.searchSingleVaultInternal(
          vault.id,
          matcher,
          options,
          startTime,
          MAX_FILES - globalFilesProcessed,
          options.maxResults - totalHits,
        )

        globalFilesProcessed += vaultSearchResult.filesSearched

        if (vaultSearchResult.results.length > 0) {
          vaultResults.push({
            vaultId: vault.id,
            vaultName: vault.name,
            results: vaultSearchResult.results,
            totalHits: vaultSearchResult.totalHits,
          })
          totalHits += vaultSearchResult.totalHits
        }

        totalFilesSearched += vaultSearchResult.filesSearched

        // Propagate truncation from single vault search
        if (vaultSearchResult.truncated) {
          truncated = true
          truncationReason = vaultSearchResult.truncationReason
          truncationMessage = vaultSearchResult.truncationMessage
          if (truncationReason === 'time_limit' || truncationReason === 'result_limit') {
            break
          }
        }
      } catch (error) {
        // Partial failure: track the failed vault and continue
        const reason = error instanceof Error ? error.message : String(error)
        failedVaults.push({
          vaultId: vault.id,
          vaultName: vault.name,
          reason,
        })
        this.logger.warn('Multi-vault search: vault failed', {
          vaultId: vault.id,
          vaultName: vault.name,
          reason,
        })
      }
    }

    const durationMs = Date.now() - startTime

    this.logger.info('Multi-vault search completed', {
      userId,
      query: options.query,
      vaultsSearched: vaultResults.length,
      vaultsFailed: failedVaults.length,
      totalHits,
      filesSearched: totalFilesSearched,
      truncated,
      durationMs,
    })

    const response: MultiVaultSearchResponse = {
      vaults: vaultResults,
      totalHits,
      filesSearched: totalFilesSearched,
      truncated,
      failedVaults,
      durationMs,
    }

    if (truncationReason !== undefined) {
      response.truncationReason = truncationReason
    }

    if (truncationMessage !== undefined) {
      response.truncationMessage = truncationMessage
    }

    return response
  }

  /**
   * Internal helper: searches a single vault with shared global budget constraints.
   * Used by searchMultiVault to distribute file and result budgets across vaults.
   */
  private async searchSingleVaultInternal(
    vaultId: string,
    matcher: (line: string) => Array<{ start: number; end: number; text: string }> | null,
    options: ISearchOptions,
    globalStartTime: number,
    remainingFilesBudget: number,
    remainingResultsBudget: number,
  ): Promise<{
    results: SearchFileResult[]
    totalHits: number
    filesSearched: number
    truncated: boolean
    truncationReason?: 'file_limit' | 'time_limit' | 'result_limit'
    truncationMessage?: string
  }> {
    const results: SearchFileResult[] = []
    let totalHits = 0
    let filesSearched = 0
    let truncated = false
    let truncationReason: 'file_limit' | 'time_limit' | 'result_limit' | undefined
    let truncationMessage: string | undefined

    // Get directory tree and extract all file paths
    const tree = await this.vaultService.getVaultTree(vaultId)
    const allFiles = this.extractFilePaths(tree)

    // Sort alphabetically
    allFiles.sort((a, b) => a.localeCompare(b))

    // Cap at remaining file budget
    const filesToSearch = allFiles.length > remainingFilesBudget
      ? allFiles.slice(0, remainingFilesBudget)
      : allFiles

    if (allFiles.length > remainingFilesBudget) {
      truncated = true
      truncationReason = 'file_limit'
      truncationMessage = `Dateilimit von ${MAX_FILES} erreicht. Nicht alle Dateien wurden durchsucht.`
    }

    for (const filePath of filesToSearch) {
      // Check global timeout
      if (Date.now() - globalStartTime > GLOBAL_TIMEOUT_MS) {
        truncated = true
        truncationReason = 'time_limit'
        truncationMessage = 'Zeitlimit von 30 Sekunden erreicht. Nicht alle Dateien wurden durchsucht.'
        break
      }

      // Check result budget
      if (totalHits >= remainingResultsBudget) {
        truncated = true
        truncationReason = 'result_limit'
        truncationMessage = `Ergebnislimit von ${options.maxResults} erreicht. Es existieren weitere Treffer.`
        break
      }

      // Read file content
      let fileContent: { content: string; size: number; isBinary: boolean }
      try {
        const fc = await this.vaultService.getFileContent(vaultId, filePath)

        // Skip files that are too large
        if (fc.size > MAX_FILE_SIZE) {
          continue
        }

        // Skip binary files
        if (fc.isBinary) {
          continue
        }

        fileContent = { content: fc.content, size: fc.size, isBinary: fc.isBinary }
      } catch {
        continue
      }

      filesSearched++

      // Search within the file
      const fileHits = this.searchInFile(
        fileContent.content,
        matcher,
        options,
        globalStartTime,
        filePath,
      )

      if (fileHits === null) {
        // Per-file regex timeout — skip file
        continue
      }

      if (fileHits.length === 0) {
        continue
      }

      // Enforce result budget
      const remainingSlots = remainingResultsBudget - totalHits
      const hitsToKeep = fileHits.length <= remainingSlots ? fileHits : fileHits.slice(0, remainingSlots)

      if (hitsToKeep.length > 0) {
        results.push({
          filePath,
          fileName: this.getFileName(filePath),
          hits: hitsToKeep,
          hitCount: hitsToKeep.length,
        })
        totalHits += hitsToKeep.length
      }

      // Check if we hit the result limit after adding
      if (totalHits >= remainingResultsBudget) {
        truncated = true
        truncationReason = 'result_limit'
        truncationMessage = `Ergebnislimit von ${options.maxResults} erreicht. Es existieren weitere Treffer.`
      }
    }

    const result: {
      results: SearchFileResult[]
      totalHits: number
      filesSearched: number
      truncated: boolean
      truncationReason?: 'file_limit' | 'time_limit' | 'result_limit'
      truncationMessage?: string
    } = {
      results,
      totalHits,
      filesSearched,
      truncated,
    }

    if (truncationReason !== undefined) {
      result.truncationReason = truncationReason
    }

    if (truncationMessage !== undefined) {
      result.truncationMessage = truncationMessage
    }

    return result
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
   * Builds a matcher function based on search options.
   * Returns a function that takes a line and returns all match positions,
   * or null if no match.
   */
  private buildMatcher(options: ISearchOptions): (line: string) => Array<{ start: number; end: number; text: string }> | null {
    if (options.regex) {
      const flags = options.caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(options.query, flags)
      return (line: string) => {
        const matches: Array<{ start: number; end: number; text: string }> = []
        let match: RegExpExecArray | null
        regex.lastIndex = 0
        while ((match = regex.exec(line)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
          })
          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++
          }
        }
        return matches.length > 0 ? matches : null
      }
    }

    // Plain-text search
    const query = options.caseSensitive ? options.query : options.query.toLowerCase()
    return (line: string) => {
      const searchLine = options.caseSensitive ? line : line.toLowerCase()
      const matches: Array<{ start: number; end: number; text: string }> = []
      let startPos = 0
      while (true) {
        const idx = searchLine.indexOf(query, startPos)
        if (idx === -1) break
        matches.push({
          start: idx,
          end: idx + query.length,
          text: line.substring(idx, idx + query.length),
        })
        startPos = idx + 1
      }
      return matches.length > 0 ? matches : null
    }
  }

  /**
   * Searches within a single file's content, returning hits with context lines.
   * Returns null if the per-file regex timeout is exceeded.
   */
  private searchInFile(
    content: string,
    matcher: (line: string) => Array<{ start: number; end: number; text: string }> | null,
    options: ISearchOptions,
    globalStartTime: number,
    filePath: string,
  ): SearchHit[] | null {
    const lines = content.split('\n')
    const rawHits: Array<{ lineIndex: number; matchText: string; matchLine: string }> = []
    const fileStartTime = Date.now()

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!

      // Check per-file regex timeout (only for regex mode)
      if (options.regex && (Date.now() - fileStartTime > PER_FILE_REGEX_TIMEOUT_MS)) {
        this.logger.warn('Per-file regex timeout exceeded, skipping file', { filePath })
        return null
      }

      // Check global timeout
      if (Date.now() - globalStartTime > GLOBAL_TIMEOUT_MS) {
        break
      }

      const matches = matcher(line)
      if (matches === null) continue

      for (const match of matches) {
        const matchText = match.text.length > MAX_MATCH_TEXT_LENGTH
          ? match.text.substring(0, MAX_MATCH_TEXT_LENGTH)
          : match.text
        rawHits.push({
          lineIndex: i,
          matchText,
          matchLine: line,
        })
      }
    }

    if (rawHits.length === 0) return []

    // Build context lines with merging for nearby hits
    return this.buildHitsWithContext(rawHits, lines, options.contextLines)
  }

  /**
   * Builds SearchHit objects with context lines.
   * Merges context blocks for nearby hits to avoid duplicate lines.
   */
  private buildHitsWithContext(
    rawHits: Array<{ lineIndex: number; matchText: string; matchLine: string }>,
    lines: string[],
    contextLines: number,
  ): SearchHit[] {
    const totalLines = lines.length
    const result: SearchHit[] = []

    // Group nearby hits into blocks for context merging
    const blocks = this.groupNearbyHits(rawHits, contextLines)

    for (const block of blocks) {
      // Calculate the merged context range for this block
      const firstHitLine = block[0]!.lineIndex
      const lastHitLine = block[block.length - 1]!.lineIndex

      const blockStartLine = Math.max(0, firstHitLine - contextLines)
      const blockEndLine = Math.min(totalLines - 1, lastHitLine + contextLines)

      // For each hit in the block, compute its individual context
      for (let hitIdx = 0; hitIdx < block.length; hitIdx++) {
        const hit = block[hitIdx]!
        const hitLine = hit.lineIndex

        // Context before: from the edge of the previous hit's context (or block start)
        let contextBeforeStart: number
        if (hitIdx === 0) {
          contextBeforeStart = blockStartLine
        } else {
          // Start after the previous hit's line (avoid overlap)
          const prevHitLine = block[hitIdx - 1]!.lineIndex
          const midpoint = prevHitLine + 1
          contextBeforeStart = Math.max(midpoint, hitLine - contextLines)
        }
        const contextBefore = lines.slice(contextBeforeStart, hitLine)

        // Context after: up to the next hit's context start (or block end)
        let contextAfterEnd: number
        if (hitIdx === block.length - 1) {
          contextAfterEnd = blockEndLine
        } else {
          const nextHitLine = block[hitIdx + 1]!.lineIndex
          const midpoint = nextHitLine - 1
          contextAfterEnd = Math.min(midpoint, hitLine + contextLines)
        }
        const contextAfter = lines.slice(hitLine + 1, contextAfterEnd + 1)

        result.push({
          line: hitLine + 1, // 1-based
          matchText: hit.matchText,
          contextBefore,
          contextAfter,
          matchLine: hit.matchLine,
        })
      }
    }

    return result
  }

  /**
   * Groups raw hits into blocks of nearby hits.
   * Two hits are considered "nearby" if their distance is less than 2*contextLines+1.
   */
  private groupNearbyHits(
    rawHits: Array<{ lineIndex: number; matchText: string; matchLine: string }>,
    contextLines: number,
  ): Array<Array<{ lineIndex: number; matchText: string; matchLine: string }>> {
    if (rawHits.length === 0) return []

    const mergeDistance = 2 * contextLines + 1
    const blocks: Array<Array<{ lineIndex: number; matchText: string; matchLine: string }>> = []
    let currentBlock = [rawHits[0]!]

    for (let i = 1; i < rawHits.length; i++) {
      const current = rawHits[i]!
      const lastInBlock = currentBlock[currentBlock.length - 1]!

      if (current.lineIndex - lastInBlock.lineIndex < mergeDistance) {
        currentBlock.push(current)
      } else {
        blocks.push(currentBlock)
        currentBlock = [current]
      }
    }

    blocks.push(currentBlock)
    return blocks
  }

  /**
   * Extracts all file paths (relative) from a directory tree recursively.
   * Only includes files (not directories).
   */
  private extractFilePaths(tree: import('../vault/index.js').DirectoryTree): string[] {
    const paths: string[] = []
    this.collectFiles(tree, paths)
    return paths
  }

  /**
   * Recursively collects file paths from a directory tree node.
   */
  private collectFiles(node: import('../vault/index.js').DirectoryTree, paths: string[]): void {
    if (node.type === 'file') {
      // Only add if the path is non-empty (root node has empty path)
      if (node.path) {
        paths.push(node.path)
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
