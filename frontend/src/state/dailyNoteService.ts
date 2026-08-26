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
 * Formats a Date in YYYY-MM-DD using its local (not UTC) calendar fields.
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats today's date in YYYY-MM-DD using browser local timezone.
 */
export function getTodayDateString(): string {
  return formatDateString(new Date())
}

/**
 * Shifts a `YYYY-MM-DD` date string by `offsetDays` (may be negative), using
 * local calendar arithmetic (so DST transitions land on the right calendar day).
 */
export function offsetDateString(dateStr: string, offsetDays: number): string {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + offsetDays)
  return formatDateString(date)
}

/**
 * Daily Note Service interface.
 */
export interface IDailyNoteService {
  /**
   * Opens or creates the daily note for `dateStr` (defaults to today).
   * @returns The file path of the daily note.
   * @throws NoActiveVaultError if vaultId is empty.
   * @throws InvalidDirectoryPathError if dailyDir exceeds 255 chars.
   */
  openOrCreate(vaultId: string, dailyDir: string, dateStr?: string): Promise<string>
}

/**
 * Creates a DailyNoteService instance.
 * Uses the API client to check file existence and create files.
 */
export function createDailyNoteService(apiClient: IApiClient): IDailyNoteService {
  return {
    async openOrCreate(vaultId: string, dailyDir: string, dateStr?: string): Promise<string> {
      if (!vaultId) {
        throw new NoActiveVaultError()
      }

      validateDirectoryPath(dailyDir)

      const resolvedDateStr = dateStr ?? getTodayDateString()
      const filePath = dailyDir ? `${dailyDir}/${resolvedDateStr}.md` : `${resolvedDateStr}.md`

      // 1. Check if file exists
      try {
        await apiClient.fetchFileContent(vaultId, filePath)
        // File exists — return path so caller can open it in a tab
        return filePath
      } catch {
        // File does not exist (404) — proceed to create
      }

      // 2. Try loading daily note template from the vault's template directory
      // First get the template directory and template name from vault config
      let templateDir = 'Templates'
      let templateName = 'daily.md'
      try {
        const vaultConfig = await apiClient.getVaultConfig(vaultId)
        templateDir = vaultConfig.templatesDirectory || 'Templates'
        templateName = vaultConfig.dailyNoteTemplateName || 'daily.md'
      } catch {
        // Use default if config unavailable
      }

      let templateContent = ''
      try {
        const templateFile = await apiClient.fetchFileContent(vaultId, `${templateDir}/${templateName}`)
        templateContent = templateFile.content
      } catch {
        // No template found — use empty content
      }

      // 3. Replace placeholders in template content
      if (templateContent) {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const date = `${year}-${month}-${day}`
        const time = `${hours}:${minutes}`
        const title = resolvedDateStr

        templateContent = templateContent
          .replace(/\{\{date\}\}/g, date)
          .replace(/\{\{time\}\}/g, time)
          .replace(/\{\{title\}\}/g, title)
      }

      // 4. Create the daily note file
      await apiClient.saveFile(vaultId, filePath, templateContent)

      return filePath
    },
  }
}
