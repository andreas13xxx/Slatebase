import type { IApiClient } from '../api'

/** localStorage key pattern for daily notes config per vault. */
const STORAGE_KEY_PREFIX = 'slatebase:dailyNotes:'

/** Maximum allowed directory path length. */
const MAX_DIRECTORY_PATH_LENGTH = 255

/** Config shape stored in localStorage. */
interface DailyNotesConfig {
  directory: string
}

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
 * Reads the daily notes directory config from localStorage.
 * Returns the configured directory or empty string (vault root) as default.
 */
export function getDailyNotesConfig(vaultId: string): string {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${vaultId}`)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as DailyNotesConfig
    return parsed.directory ?? ''
  } catch {
    return ''
  }
}

/**
 * Saves the daily notes directory config to localStorage.
 */
export function setDailyNotesConfig(vaultId: string, directory: string): void {
  const config: DailyNotesConfig = { directory }
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${vaultId}`, JSON.stringify(config))
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

      // 2. Try loading _templates/daily.md template
      let templateContent = ''
      try {
        const templateFile = await apiClient.fetchFileContent(vaultId, '_templates/daily.md')
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
