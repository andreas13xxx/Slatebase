import type { IApiClient } from '../api'

/** localStorage key pattern for daily notes config per vault (cache). */
const STORAGE_KEY_PREFIX = 'slatebase:dailyNotes:'

/** Maximum allowed directory path length. */
const MAX_DIRECTORY_PATH_LENGTH = 255

/** Error thrown when no vault is active. */
export class NoActiveVaultError extends Error {
  constructor() {
    super('No active vault selected. Please select a vault first.')
    this.name = 'NoActiveVaultError'
  }
}

/** Error thrown when directory path validation fails. */
export class InvalidDirectoryPathError extends Error {
  constructor(reason: string) {
    super(`Invalid daily notes directory: ${reason}`)
    this.name = 'InvalidDirectoryPathError'
  }
}

/**
 * Validates the daily notes directory path.
 * @throws InvalidDirectoryPathError if path exceeds 255 characters.
 */
export function validateDirectoryPath(directory: string): void {
  if (directory.length > MAX_DIRECTORY_PATH_LENGTH) {
    throw new InvalidDirectoryPathError(
      `Path exceeds maximum length of ${MAX_DIRECTORY_PATH_LENGTH} characters`
    )
  }
}

/**
 * Reads the daily notes directory config from localStorage cache.
 * Returns the configured directory or empty string (vault root) as default.
 * This is the synchronous fallback — the actual source of truth is the vault config API.
 */
export function getDailyNotesConfig(vaultId: string): string {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${vaultId}`)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { directory?: string }
    return parsed.directory ?? ''
  } catch {
    return ''
  }
}

/**
 * Updates the localStorage cache for daily notes directory.
 * Called when vault config is loaded from API to keep the synchronous cache fresh.
 */
export function cacheDailyNotesConfig(vaultId: string, directory: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${vaultId}`, JSON.stringify({ directory }))
  } catch {
    // Silently fail
  }
}

/**
 * Loads the daily notes directory from the vault config API and updates the local cache.
 * Falls back to the cached value if the API call fails.
 */
export async function loadDailyNotesConfigFromServer(apiClient: IApiClient, vaultId: string): Promise<string> {
  try {
    const config = await apiClient.getVaultConfig(vaultId)
    cacheDailyNotesConfig(vaultId, config.dailyNotesDirectory)
    return config.dailyNotesDirectory
  } catch {
    // API unavailable — fall back to localStorage cache
    return getDailyNotesConfig(vaultId)
  }
}

/**
 * Formats today's date in YYYY-MM-DD using browser local timezone.
 */
export function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Daily Note Service interface.
 */
export interface IDailyNoteService {
  /**
   * Opens or creates today's daily note.
   * @returns The file path of the daily note.
   * @throws NoActiveVaultError if vaultId is empty.
   * @throws InvalidDirectoryPathError if dailyDir exceeds 255 chars.
   */
  openOrCreate(vaultId: string, dailyDir: string): Promise<string>
}

/**
 * Creates a DailyNoteService instance.
 * Uses the API client to check file existence and create files.
 */
export function createDailyNoteService(apiClient: IApiClient): IDailyNoteService {
  return {
    async openOrCreate(vaultId: string, dailyDir: string): Promise<string> {
      if (!vaultId) {
        throw new NoActiveVaultError()
      }

      validateDirectoryPath(dailyDir)

      const dateStr = getTodayDateString()
      const filePath = dailyDir ? `${dailyDir}/${dateStr}.md` : `${dateStr}.md`

      // 1. Check if file exists
      try {
        await apiClient.fetchFileContent(vaultId, filePath)
        // File exists — return path so caller can open it in a tab
        return filePath
      } catch {
        // File does not exist (404) — proceed to create
      }

      // 2. Try loading daily.md template from the vault's template directory
      // First get the template directory from vault config
      let templateDir = 'Templates'
      try {
        const vaultConfig = await apiClient.getVaultConfig(vaultId)
        templateDir = vaultConfig.templatesDirectory || 'Templates'
      } catch {
        // Use default if config unavailable
      }

      let templateContent = ''
      try {
        const templateFile = await apiClient.fetchFileContent(vaultId, `${templateDir}/daily.md`)
        templateContent = templateFile.content
      } catch {
        // No template found — use empty content
      }

      // 3. Create the daily note file
      await apiClient.saveFile(vaultId, filePath, templateContent)

      return filePath
    },
  }
}
