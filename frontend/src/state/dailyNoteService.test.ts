import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDailyNoteService,
  getDailyNotesConfig,
  cacheDailyNotesConfig,
  getTodayDateString,
  validateDirectoryPath,
  NoActiveVaultError,
  InvalidDirectoryPathError,
} from './dailyNoteService'
import type { IApiClient } from '../api'
import type { FileContent } from '../types'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    setToken: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn().mockReturnValue(null),
    setOnSessionExpired: vi.fn(),
    fetchVaults: vi.fn(),
    fetchAllVaults: vi.fn(),
    fetchVaultTree: vi.fn(),
    fetchFileContent: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    importFile: vi.fn(),
    importFolder: vi.fn(),
    deleteContent: vi.fn(),
    saveFile: vi.fn().mockResolvedValue({ path: '', name: '', size: 0 }),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSessions: vi.fn(),
    invalidateSession: vi.fn(),
    invalidateAllOtherSessions: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteSelf: vi.fn(),
    searchUsers: vi.fn(),
    createConversation: vi.fn(),
    listConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    leaveConversation: vi.fn(),
    getUnreadTotal: vi.fn(),
    getSyncConfig: vi.fn(),
    createSyncConfig: vi.fn(),
    updateSyncConfig: vi.fn(),
    removeSyncConfig: vi.fn(),
    disableSyncConfig: vi.fn(),
    enableSyncConfig: vi.fn(),
    triggerSync: vi.fn(),
    triggerAnalysis: vi.fn(),
    resetSyncCheckpoint: vi.fn(),
    getSyncLog: vi.fn(),
    getSyncProtocol: vi.fn(),
    getSyncConflicts: vi.fn(),
    resolveSyncConflict: vi.fn(),
    listMcpTokens: vi.fn(),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
    getGraph: vi.fn(),
    getBacklinks: vi.fn(),
    getVaultTags: vi.fn(),
    listPlugins: vi.fn(),
    uploadPlugin: vi.fn(),
    getPlugin: vi.fn(),
    deletePlugin: vi.fn(),
    loadBundle: vi.fn(),
    loadStyles: vi.fn(),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    loadRegistry: vi.fn(),
    saveRegistry: vi.fn(),
    getDetectedPlugins: vi.fn(),
    installDetectedPlugin: vi.fn(),
    loadFeatures: vi.fn(),
    loadAdminFeatures: vi.fn(),
    toggleAdminFeature: vi.fn(),
    searchVault: vi.fn(),
    searchMultiVault: vi.fn(),
    replaceInVault: vi.fn(),
    getVersion: vi.fn(),
    getVaultStatistics: vi.fn(),
    uploadFiles: vi.fn(),
    uploadImagePaste: vi.fn(),
    listTemplates: vi.fn(),
    createFromTemplate: vi.fn(),
    listTrash: vi.fn(),
    restoreTrash: vi.fn(),
    deleteTrash: vi.fn(),
    listVersions: vi.fn(),
    getVersionContent: vi.fn(),
    restoreVersion: vi.fn(),
    getRecentFiles: vi.fn().mockResolvedValue({ entries: [] }),
    saveRecentFiles: vi.fn().mockResolvedValue({ entries: [] }),
    getFavorites: vi.fn().mockResolvedValue({ entries: [] }),
    saveFavorites: vi.fn().mockResolvedValue({ entries: [] }),
    getKeybindings: vi.fn().mockResolvedValue({ entries: [] }),
    saveKeybindings: vi.fn().mockResolvedValue({ entries: [] }),
    getVaultConfig: vi.fn().mockResolvedValue({ templatesDirectory: '_templates', dailyNotesDirectory: '' }),
    saveVaultConfig: vi.fn().mockResolvedValue({ templatesDirectory: '_templates', dailyNotesDirectory: '' }),
    ...overrides,
  } as IApiClient
}

describe('dailyNoteService', () => {
  describe('getTodayDateString', () => {
    it('returns date in YYYY-MM-DD format using local timezone', () => {
      const result = getTodayDateString()
      // Should match YYYY-MM-DD pattern
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      // Should correspond to today's local date
      const now = new Date()
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      expect(result).toBe(expected)
    })
  })

  describe('validateDirectoryPath', () => {
    it('accepts empty string (vault root)', () => {
      expect(() => validateDirectoryPath('')).not.toThrow()
    })

    it('accepts valid directory path', () => {
      expect(() => validateDirectoryPath('daily-notes')).not.toThrow()
    })

    it('accepts path with 255 characters', () => {
      const path = 'a'.repeat(255)
      expect(() => validateDirectoryPath(path)).not.toThrow()
    })

    it('throws InvalidDirectoryPathError for path exceeding 255 characters', () => {
      const path = 'a'.repeat(256)
      expect(() => validateDirectoryPath(path)).toThrow(InvalidDirectoryPathError)
    })
  })

  describe('getDailyNotesConfig / cacheDailyNotesConfig', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('returns empty string when no config exists', () => {
      expect(getDailyNotesConfig('vault1')).toBe('')
    })

    it('returns configured directory after setting', () => {
      cacheDailyNotesConfig('vault1', 'journal')
      expect(getDailyNotesConfig('vault1')).toBe('journal')
    })

    it('returns empty string for invalid JSON in localStorage', () => {
      localStorage.setItem('slatebase:dailyNotes:vault1', 'not-json')
      expect(getDailyNotesConfig('vault1')).toBe('')
    })

    it('returns empty string when directory field is missing', () => {
      localStorage.setItem('slatebase:dailyNotes:vault1', '{}')
      expect(getDailyNotesConfig('vault1')).toBe('')
    })

    it('scopes config per vault', () => {
      cacheDailyNotesConfig('vault1', 'daily')
      cacheDailyNotesConfig('vault2', 'journal')
      expect(getDailyNotesConfig('vault1')).toBe('daily')
      expect(getDailyNotesConfig('vault2')).toBe('journal')
    })
  })

  describe('createDailyNoteService.openOrCreate', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('throws NoActiveVaultError when vaultId is empty', async () => {
      const apiClient = createMockApiClient()
      const service = createDailyNoteService(apiClient)

      await expect(service.openOrCreate('', '')).rejects.toThrow(NoActiveVaultError)
    })

    it('throws InvalidDirectoryPathError when dailyDir exceeds 255 chars', async () => {
      const apiClient = createMockApiClient()
      const service = createDailyNoteService(apiClient)

      const longPath = 'a'.repeat(256)
      await expect(service.openOrCreate('vault1', longPath)).rejects.toThrow(InvalidDirectoryPathError)
    })

    it('returns existing file path when daily note already exists', async () => {
      const fileContent: FileContent = {
        path: '2024-06-15.md',
        name: '2024-06-15.md',
        content: '# Daily Note',
        size: 12,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      }
      const apiClient = createMockApiClient({
        fetchFileContent: vi.fn().mockResolvedValue(fileContent),
      })
      const service = createDailyNoteService(apiClient)

      // Mock today's date
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 5, 15)) // June 15, 2024

      const result = await service.openOrCreate('vault1', '')
      expect(result).toBe('2024-06-15.md')
      expect(apiClient.fetchFileContent).toHaveBeenCalledWith('vault1', '2024-06-15.md')
      expect(apiClient.saveFile).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('creates file with template content when daily note does not exist', async () => {
      const templateContent: FileContent = {
        path: '_templates/daily.md',
        name: 'daily.md',
        content: '# {{date}}\n\n## Tasks\n',
        size: 20,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      }

      const fetchFileContent = vi.fn()
        // First call: check if daily note exists → 404
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })
        // Second call: load template → success
        .mockResolvedValueOnce(templateContent)

      const apiClient = createMockApiClient({ fetchFileContent })
      const service = createDailyNoteService(apiClient)

      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 5, 15))

      const result = await service.openOrCreate('vault1', '')
      expect(result).toBe('2024-06-15.md')
      expect(apiClient.saveFile).toHaveBeenCalledWith('vault1', '2024-06-15.md', '# {{date}}\n\n## Tasks\n')

      vi.useRealTimers()
    })

    it('creates empty file when no template exists', async () => {
      const fetchFileContent = vi.fn()
        // First call: daily note does not exist
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })
        // Second call: template does not exist
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })

      const apiClient = createMockApiClient({ fetchFileContent })
      const service = createDailyNoteService(apiClient)

      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 0, 1)) // Jan 1, 2024

      const result = await service.openOrCreate('vault1', '')
      expect(result).toBe('2024-01-01.md')
      expect(apiClient.saveFile).toHaveBeenCalledWith('vault1', '2024-01-01.md', '')

      vi.useRealTimers()
    })

    it('uses dailyDir in file path when provided', async () => {
      const fetchFileContent = vi.fn()
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })

      const apiClient = createMockApiClient({ fetchFileContent })
      const service = createDailyNoteService(apiClient)

      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 11, 31)) // Dec 31, 2024

      const result = await service.openOrCreate('vault1', 'journal/daily')
      expect(result).toBe('journal/daily/2024-12-31.md')
      expect(fetchFileContent).toHaveBeenNthCalledWith(1, 'vault1', 'journal/daily/2024-12-31.md')
      expect(apiClient.saveFile).toHaveBeenCalledWith('vault1', 'journal/daily/2024-12-31.md', '')

      vi.useRealTimers()
    })

    it('uses vault root when dailyDir is empty string', async () => {
      const fileContent: FileContent = {
        path: '2024-03-10.md',
        name: '2024-03-10.md',
        content: '',
        size: 0,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
      }
      const apiClient = createMockApiClient({
        fetchFileContent: vi.fn().mockResolvedValue(fileContent),
      })
      const service = createDailyNoteService(apiClient)

      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 2, 10)) // March 10, 2024

      const result = await service.openOrCreate('vault1', '')
      expect(result).toBe('2024-03-10.md')

      vi.useRealTimers()
    })

    it('propagates save errors from the API', async () => {
      const fetchFileContent = vi.fn()
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })
        .mockRejectedValueOnce({ code: 'NOT_FOUND', message: 'File not found' })

      const saveFile = vi.fn().mockRejectedValue({ code: 'WRITE_ERROR', message: 'Permission denied' })

      const apiClient = createMockApiClient({ fetchFileContent, saveFile })
      const service = createDailyNoteService(apiClient)

      vi.useFakeTimers()
      vi.setSystemTime(new Date(2024, 5, 15))

      await expect(service.openOrCreate('vault1', '')).rejects.toEqual({
        code: 'WRITE_ERROR',
        message: 'Permission denied',
      })

      vi.useRealTimers()
    })
  })
})
