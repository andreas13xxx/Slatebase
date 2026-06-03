import type { VaultInfo, DirectoryTree, FileContent, FileSaveResult, AppError, Conversation, PaginatedConversations, PaginatedMessages, Message, GraphData, BacklinksResponse } from '../types'
import type { PublicUserInfo } from '../state/authState'
import type { SyncConfigResponse, SyncConfigResult, CreateSyncConfigInput, UpdateSyncConfigInput, SyncResult, AnalysisResult, PaginatedSyncLog, ConflictEntry } from '../state/syncState'

/**
 * Login response returned by the backend on successful authentication.
 */
export interface LoginResponse {
  token: string
  csrfToken: string
  user: PublicUserInfo
  expiresAt: string
}

/**
 * Session information for the session management UI.
 */
export interface SessionInfo {
  sessionId: string
  userAgent: string
  ipAddress: string
  createdAt: string
  lastActivity: string
}

/**
 * Data for updating the user profile.
 */
export interface UpdateProfileData {
  displayName?: string
  email?: string
  avatarUrl?: string
  preferredLanguage?: 'de' | 'en'
  colorScheme?: 'light' | 'dark' | 'system'
}

/**
 * Result item from user search (public info subset).
 */
export interface UserSearchResult {
  userId: string
  username: string
  displayName: string
}

/**
 * Public API token info returned by the backend (no raw token value).
 */
export interface McpTokenInfo {
  tokenId: string
  name: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  status: 'active' | 'expired' | 'revoked'
  maskedToken: string
}

/**
 * Result of creating a new API token (includes raw token, shown only once).
 */
export interface McpTokenCreateResult {
  token: string
  tokenId: string
  name: string
  expiresAt: string
}

/**
 * Tag information returned by the vault tags endpoint.
 */
export interface VaultTagInfo {
  name: string
  count: number
  files: string[]
}

/**
 * Response from the vault tags API endpoint.
 */
export interface VaultTagsResponse {
  tags: VaultTagInfo[]
}

/**
 * Obsidian-compatible plugin manifest.
 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  minAppVersion?: string
  author?: string
  description?: string
  [key: string]: unknown
}

/**
 * Result of uploading/installing a plugin.
 */
export interface PluginInstallResult {
  pluginId: string
  manifest: PluginManifest
  isUpgrade: boolean
}

/**
 * Plugin permissions configuration.
 */
export interface PluginPermissions {
  network: boolean
  networkAllowlist: string[]
  filesystemWrite: boolean
  domManipulation: boolean
}

/**
 * Plugin registry data (persisted activation state and permissions).
 */
export interface PluginRegistryData {
  version: 1
  plugins: Record<string, {
    status: string
    permissions: PluginPermissions
    compatibilityLevel: string
    installedAt: string
    updatedAt: string
    error?: string
  }>
}

/**
 * Interface for the Slatebase API client.
 * All methods throw an AppError on non-2xx responses.
 */
export interface IApiClient {
  /** Set the auth token for subsequent requests. */
  setToken(token: string | null): void
  /** Get the current auth token. */
  getToken(): string | null
  /** Set the CSRF token for state-changing requests. */
  setCsrfToken(csrfToken: string | null): void
  /** Get the current CSRF token. */
  getCsrfToken(): string | null
  /** Set callback invoked when a 401 response is received. */
  setOnSessionExpired(callback: (() => void) | null): void

  // --- Vault methods ---
  fetchVaults(): Promise<VaultInfo[]>
  fetchAllVaults(): Promise<VaultInfo[]>
  fetchVaultTree(vaultId: string): Promise<DirectoryTree>
  fetchFileContent(vaultId: string, filePath: string): Promise<FileContent>
  createVault(name: string): Promise<VaultInfo>
  deleteVault(vaultId: string): Promise<void>
  importFile(vaultId: string, file: File): Promise<void>
  importFolder(vaultId: string, files: FileList): Promise<void>
  deleteContent(vaultId: string, path: string): Promise<void>
  saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult>

  /** Moves a file or folder within a vault. */
  moveContent(vaultId: string, sourcePath: string, destinationPath: string): Promise<{ newPath: string }>

  /** Renames a file or folder within a vault. */
  renameContent(vaultId: string, path: string, newName: string): Promise<{ newPath: string }>

  // --- Auth methods ---
  login(username: string, password: string): Promise<LoginResponse>
  logout(): Promise<void>
  getSessions(): Promise<SessionInfo[]>
  invalidateSession(sessionId: string): Promise<void>
  invalidateAllOtherSessions(): Promise<void>
  getProfile(): Promise<PublicUserInfo>
  updateProfile(data: UpdateProfileData): Promise<PublicUserInfo>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  deleteSelf(password: string): Promise<void>

  // --- User search ---
  searchUsers(query: string): Promise<UserSearchResult[]>

  // --- Chat methods ---
  /** Create a new conversation with the given participant user IDs. */
  createConversation(participantIds: string[]): Promise<Conversation>
  /** List the current user's conversations (paginated). */
  listConversations(page?: number): Promise<PaginatedConversations>
  /** Get messages for a conversation (paginated). */
  getMessages(conversationId: string, page?: number): Promise<PaginatedMessages>
  /** Send a message to a conversation. */
  sendMessage(conversationId: string, content: string): Promise<Message>
  /** Leave a conversation (removes the current user from participants). */
  leaveConversation(conversationId: string): Promise<void>
  /** Get total unread count across all conversations for the current user. */
  getUnreadTotal(): Promise<{ total: number }>

  // --- Sync methods ---
  /** Get the sync configuration for a vault. */
  getSyncConfig(vaultId: string): Promise<SyncConfigResponse>
  /** Create a new sync configuration for a vault. */
  createSyncConfig(vaultId: string, input: CreateSyncConfigInput): Promise<SyncConfigResult>
  /** Update an existing sync configuration. */
  updateSyncConfig(vaultId: string, input: UpdateSyncConfigInput): Promise<SyncConfigResult>
  /** Remove the sync configuration for a vault. */
  removeSyncConfig(vaultId: string): Promise<void>
  /** Disable the sync configuration for a vault. */
  disableSyncConfig(vaultId: string): Promise<void>
  /** Enable the sync configuration for a vault. */
  enableSyncConfig(vaultId: string): Promise<void>
  /** Trigger a manual sync for a vault. */
  triggerSync(vaultId: string): Promise<SyncResult>
  /** Trigger an analysis for a vault. */
  triggerAnalysis(vaultId: string): Promise<AnalysisResult>
  /** Reset the sync checkpoint so the next sync performs a full pull. */
  resetSyncCheckpoint(vaultId: string): Promise<void>
  /** Get the sync log for a vault (paginated). */
  getSyncLog(vaultId: string, page?: number, pageSize?: number): Promise<PaginatedSyncLog>
  /** Get all open sync conflicts for a vault. */
  getSyncConflicts(vaultId: string): Promise<ConflictEntry[]>
  /** Resolve a sync conflict for a specific document. */
  resolveSyncConflict(vaultId: string, documentPath: string, resolution: string): Promise<void>

  // --- MCP Token methods ---
  /** List the current user's API tokens. */
  listMcpTokens(): Promise<McpTokenInfo[]>
  /** Create a new API token. */
  createMcpToken(name: string, expiryDays: number): Promise<McpTokenCreateResult>
  /** Revoke an API token by ID. */
  revokeMcpToken(tokenId: string): Promise<void>

  // --- Graph methods ---
  /** Get the full knowledge graph for a vault. */
  getGraph(vaultId: string): Promise<GraphData>
  /** Get backlinks for a specific file in a vault. */
  getBacklinks(vaultId: string, filePath: string): Promise<BacklinksResponse>
  /** Get all tags for a vault with occurrence counts and file lists. */
  getVaultTags(vaultId: string): Promise<VaultTagsResponse>

  // --- Plugin methods ---
  /** List all installed plugins for a vault. */
  listPlugins(vaultId: string): Promise<{ plugins: PluginManifest[] }>
  /** Upload/install a plugin (ZIP file). */
  uploadPlugin(vaultId: string, file: File): Promise<PluginInstallResult>
  /** Get a specific plugin's manifest. */
  getPlugin(vaultId: string, pluginId: string): Promise<PluginManifest>
  /** Delete/uninstall a plugin. */
  deletePlugin(vaultId: string, pluginId: string): Promise<void>
  /** Load a plugin's JavaScript bundle. */
  loadBundle(vaultId: string, pluginId: string): Promise<string>
  /** Load a plugin's styles (returns null if none exist). */
  loadStyles(vaultId: string, pluginId: string): Promise<string | null>
  /** Load a plugin's settings. */
  loadSettings(vaultId: string, pluginId: string): Promise<unknown | null>
  /** Save a plugin's settings. */
  saveSettings(vaultId: string, pluginId: string, data: unknown): Promise<void>
  /** Load the plugin registry for a vault. */
  loadRegistry(vaultId: string): Promise<PluginRegistryData>
  /** Save the plugin registry for a vault. */
  saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void>
}

/**
 * Parses a non-2xx response body as an ApiError and throws it as an AppError.
 */
async function handleErrorResponse(response: Response): Promise<never> {
  let error: AppError
  try {
    const body = await response.json()
    error = { code: body.code, message: body.message }
  } catch {
    error = { code: 'INTERNAL_ERROR', message: `Request failed with status ${response.status}` }
  }
  throw error
}

/** HTTP methods that require a CSRF token. */
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE'])

/**
 * Concrete implementation of IApiClient using the Fetch API.
 * Uses relative URLs — the Vite dev proxy forwards /api to the backend.
 *
 * Includes Authorization header on all authenticated requests and
 * X-CSRF-Token header on state-changing requests (POST, PUT, DELETE).
 * Calls onSessionExpired callback when a 401 response is received.
 */
export class ApiClient implements IApiClient {
  private token: string | null = null
  private csrfToken: string | null = null
  private onSessionExpired: (() => void) | null = null

  /** Set the auth token for subsequent requests. */
  setToken(token: string | null): void {
    this.token = token
  }

  /** Get the current auth token. */
  getToken(): string | null {
    return this.token
  }

  /** Set the CSRF token for state-changing requests. */
  setCsrfToken(csrfToken: string | null): void {
    this.csrfToken = csrfToken
  }

  /** Get the current CSRF token. */
  getCsrfToken(): string | null {
    return this.csrfToken
  }

  /** Set callback invoked when a 401 response is received. */
  setOnSessionExpired(callback: (() => void) | null): void {
    this.onSessionExpired = callback
  }

  // --- Vault methods ---

  async fetchVaults(): Promise<VaultInfo[]> {
    return this.request<VaultInfo[]>('GET', '/api/v1/vaults')
  }

  async fetchAllVaults(): Promise<VaultInfo[]> {
    return this.request<VaultInfo[]>('GET', '/api/v1/vaults?all=true')
  }

  async fetchVaultTree(vaultId: string): Promise<DirectoryTree> {
    return this.request<DirectoryTree>('GET', `/api/v1/vaults/${vaultId}/tree`)
  }

  async fetchFileContent(vaultId: string, filePath: string): Promise<FileContent> {
    const encodedPath = encodeURIComponent(filePath)
    return this.request<FileContent>('GET', `/api/v1/vaults/${vaultId}/files?path=${encodedPath}`)
  }

  async createVault(name: string): Promise<VaultInfo> {
    return this.request<VaultInfo>('POST', '/api/v1/vaults', { name })
  }

  async deleteVault(vaultId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/vaults/${vaultId}`)
  }

  async importFile(vaultId: string, file: File): Promise<void> {
    const formData = new FormData()
    formData.append('file', file)
    await this.requestFormData('POST', `/api/v1/vaults/${vaultId}/import/file`, formData)
  }

  async importFolder(vaultId: string, files: FileList): Promise<void> {
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      formData.append('files', file)
      formData.append('relativePaths', file.webkitRelativePath)
    }
    await this.requestFormData('POST', `/api/v1/vaults/${vaultId}/import/folder`, formData)
  }

  async deleteContent(vaultId: string, path: string): Promise<void> {
    const encodedPath = encodeURIComponent(path)
    await this.request<void>('DELETE', `/api/v1/vaults/${vaultId}/content?path=${encodedPath}`)
  }

  async saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult> {
    return this.request<FileSaveResult>('PUT', `/api/v1/vaults/${vaultId}/files`, { path: filePath, content })
  }

  /** Moves a file or folder within a vault. */
  async moveContent(vaultId: string, sourcePath: string, destinationPath: string): Promise<{ newPath: string }> {
    return this.request<{ newPath: string }>('PUT', `/api/v1/vaults/${vaultId}/move`, { sourcePath, destinationPath })
  }

  /** Renames a file or folder within a vault. */
  async renameContent(vaultId: string, path: string, newName: string): Promise<{ newPath: string }> {
    return this.request<{ newPath: string }>('PUT', `/api/v1/vaults/${vaultId}/rename`, { path, newName })
  }

  // --- Auth methods ---

  /**
   * Authenticate with username and password.
   * This request does NOT include the Authorization header (no token yet).
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      await handleErrorResponse(response)
    }
    return response.json()
  }

  /** End the current session. */
  async logout(): Promise<void> {
    await this.request<void>('POST', '/api/v1/auth/logout')
  }

  /** Get all active sessions for the current user. */
  async getSessions(): Promise<SessionInfo[]> {
    return this.request<SessionInfo[]>('GET', '/api/v1/auth/sessions')
  }

  /** Invalidate a specific session by ID. */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/auth/sessions/${sessionId}`)
  }

  /** Invalidate all sessions except the current one. */
  async invalidateAllOtherSessions(): Promise<void> {
    await this.request<void>('DELETE', '/api/v1/auth/sessions')
  }

  /** Get the current user's profile. */
  async getProfile(): Promise<PublicUserInfo> {
    return this.request<PublicUserInfo>('GET', '/api/v1/users/me')
  }

  /** Update the current user's profile. */
  async updateProfile(data: UpdateProfileData): Promise<PublicUserInfo> {
    return this.request<PublicUserInfo>('PUT', '/api/v1/users/me', data)
  }

  /** Change the current user's password. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request<void>('PUT', '/api/v1/users/me/password', { currentPassword, newPassword })
  }

  /** Delete the current user's account (requires password confirmation). */
  async deleteSelf(password: string): Promise<void> {
    await this.request<void>('DELETE', '/api/v1/users/me', { password })
  }

  // --- User search ---

  /** Search users by username prefix. */
  async searchUsers(query: string): Promise<UserSearchResult[]> {
    const encoded = encodeURIComponent(query)
    return this.request<UserSearchResult[]>('GET', `/api/v1/users/search?q=${encoded}`)
  }

  // --- Chat methods ---

  /** Create a new conversation with the given participant user IDs. */
  async createConversation(participantIds: string[]): Promise<Conversation> {
    return this.request<Conversation>('POST', '/api/v1/chat/conversations', { participants: participantIds })
  }

  /** List the current user's conversations (paginated). */
  async listConversations(page?: number): Promise<PaginatedConversations> {
    const query = page !== undefined ? `?page=${page}` : ''
    return this.request<PaginatedConversations>('GET', `/api/v1/chat/conversations${query}`)
  }

  /** Get messages for a conversation (paginated). */
  async getMessages(conversationId: string, page?: number): Promise<PaginatedMessages> {
    const query = page !== undefined ? `?page=${page}` : ''
    return this.request<PaginatedMessages>('GET', `/api/v1/chat/conversations/${conversationId}/messages${query}`)
  }

  /** Send a message to a conversation. */
  async sendMessage(conversationId: string, content: string): Promise<Message> {
    return this.request<Message>('POST', `/api/v1/chat/conversations/${conversationId}/messages`, { content })
  }

  /** Leave a conversation (removes the current user from participants). */
  async leaveConversation(conversationId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/chat/conversations/${conversationId}/participants/me`)
  }

  /** Get total unread count across all conversations for the current user. */
  async getUnreadTotal(): Promise<{ total: number }> {
    return this.request<{ total: number }>('GET', '/api/v1/chat/unread/total')
  }

  // --- Sync methods ---

  /** Get the sync configuration for a vault. */
  async getSyncConfig(vaultId: string): Promise<SyncConfigResponse> {
    return this.request<SyncConfigResponse>('GET', `/api/v1/vaults/${vaultId}/sync/config`)
  }

  /** Create a new sync configuration for a vault. */
  async createSyncConfig(vaultId: string, input: CreateSyncConfigInput): Promise<SyncConfigResult> {
    return this.request<SyncConfigResult>('POST', `/api/v1/vaults/${vaultId}/sync/config`, input)
  }

  /** Update an existing sync configuration. */
  async updateSyncConfig(vaultId: string, input: UpdateSyncConfigInput): Promise<SyncConfigResult> {
    return this.request<SyncConfigResult>('PUT', `/api/v1/vaults/${vaultId}/sync/config`, input)
  }

  /** Remove the sync configuration for a vault. */
  async removeSyncConfig(vaultId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/vaults/${vaultId}/sync/config`)
  }

  /** Disable the sync configuration for a vault. */
  async disableSyncConfig(vaultId: string): Promise<void> {
    await this.request<void>('PUT', `/api/v1/vaults/${vaultId}/sync/config/disable`)
  }

  /** Enable the sync configuration for a vault. */
  async enableSyncConfig(vaultId: string): Promise<void> {
    await this.request<void>('PUT', `/api/v1/vaults/${vaultId}/sync/config/enable`)
  }

  /** Trigger a manual sync for a vault. */
  async triggerSync(vaultId: string): Promise<SyncResult> {
    return this.request<SyncResult>('POST', `/api/v1/vaults/${vaultId}/sync/trigger`)
  }

  /** Trigger an analysis for a vault. */
  async triggerAnalysis(vaultId: string): Promise<AnalysisResult> {
    return this.request<AnalysisResult>('POST', `/api/v1/vaults/${vaultId}/sync/analyze`)
  }

  /** Reset the sync checkpoint so the next sync performs a full pull. */
  async resetSyncCheckpoint(vaultId: string): Promise<void> {
    await this.request<unknown>('POST', `/api/v1/vaults/${vaultId}/sync/reset-checkpoint`)
  }

  /** Get the sync log for a vault (paginated). */
  async getSyncLog(vaultId: string, page?: number, pageSize?: number): Promise<PaginatedSyncLog> {
    const params: string[] = []
    if (page !== undefined) params.push(`page=${page}`)
    if (pageSize !== undefined) params.push(`pageSize=${pageSize}`)
    const query = params.length > 0 ? `?${params.join('&')}` : ''
    return this.request<PaginatedSyncLog>('GET', `/api/v1/vaults/${vaultId}/sync/log${query}`)
  }

  /** Get all open sync conflicts for a vault. */
  async getSyncConflicts(vaultId: string): Promise<ConflictEntry[]> {
    return this.request<ConflictEntry[]>('GET', `/api/v1/vaults/${vaultId}/sync/conflicts`)
  }

  /** Resolve a sync conflict for a specific document. */
  async resolveSyncConflict(vaultId: string, documentPath: string, resolution: string): Promise<void> {
    const encodedPath = encodeURIComponent(documentPath)
    await this.request<void>('POST', `/api/v1/vaults/${vaultId}/sync/conflicts/${encodedPath}/resolve`, { resolution })
  }

  // --- MCP Token methods ---

  /** List the current user's API tokens. */
  async listMcpTokens(): Promise<McpTokenInfo[]> {
    return this.request<McpTokenInfo[]>('GET', '/api/v1/mcp/tokens')
  }

  /** Create a new API token. */
  async createMcpToken(name: string, expiryDays: number): Promise<McpTokenCreateResult> {
    return this.request<McpTokenCreateResult>('POST', '/api/v1/mcp/tokens', { name, expiryDays })
  }

  /** Revoke an API token by ID. */
  async revokeMcpToken(tokenId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/mcp/tokens/${tokenId}`)
  }

  // --- Graph methods ---

  /** Get the full knowledge graph for a vault. */
  async getGraph(vaultId: string): Promise<GraphData> {
    return this.request<GraphData>('GET', `/api/v1/vaults/${vaultId}/graph`)
  }

  /** Get backlinks for a specific file in a vault. */
  async getBacklinks(vaultId: string, filePath: string): Promise<BacklinksResponse> {
    const encodedPath = encodeURIComponent(filePath)
    return this.request<BacklinksResponse>('GET', `/api/v1/vaults/${vaultId}/backlinks?path=${encodedPath}`)
  }

  /** Get all tags for a vault with occurrence counts and file lists. */
  async getVaultTags(vaultId: string): Promise<VaultTagsResponse> {
    return this.request<VaultTagsResponse>('GET', `/api/v1/vaults/${vaultId}/tags`)
  }

  // --- Plugin methods ---

  /** List all installed plugins for a vault. */
  async listPlugins(vaultId: string): Promise<{ plugins: PluginManifest[] }> {
    return this.request<{ plugins: PluginManifest[] }>('GET', `/api/v1/vaults/${vaultId}/plugins`)
  }

  /** Upload/install a plugin (ZIP file). */
  async uploadPlugin(vaultId: string, file: File): Promise<PluginInstallResult> {
    const formData = new FormData()
    formData.append('file', file)

    const headers: Record<string, string> = {}

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken
    }

    const response = await fetch(`/api/v1/vaults/${vaultId}/plugins`, {
      method: 'POST',
      headers,
      body: formData,
    })
    return this.handleResponse<PluginInstallResult>(response)
  }

  /** Get a specific plugin's manifest. */
  async getPlugin(vaultId: string, pluginId: string): Promise<PluginManifest> {
    return this.request<PluginManifest>('GET', `/api/v1/vaults/${vaultId}/plugins/${pluginId}`)
  }

  /** Delete/uninstall a plugin. */
  async deletePlugin(vaultId: string, pluginId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/v1/vaults/${vaultId}/plugins/${pluginId}`)
  }

  /** Load a plugin's JavaScript bundle. */
  async loadBundle(vaultId: string, pluginId: string): Promise<string> {
    const headers = this.buildHeaders('GET', false)
    const response = await fetch(`/api/v1/vaults/${vaultId}/plugins/${pluginId}/bundle`, { method: 'GET', headers })

    if (response.status === 401) {
      this.token = null
      this.csrfToken = null
      if (this.onSessionExpired) {
        this.onSessionExpired()
      }
      await handleErrorResponse(response)
    }

    if (!response.ok) {
      await handleErrorResponse(response)
    }

    return response.text()
  }

  /** Load a plugin's styles (returns null if none exist). */
  async loadStyles(vaultId: string, pluginId: string): Promise<string | null> {
    const headers = this.buildHeaders('GET', false)
    const response = await fetch(`/api/v1/vaults/${vaultId}/plugins/${pluginId}/styles`, { method: 'GET', headers })

    if (response.status === 401) {
      this.token = null
      this.csrfToken = null
      if (this.onSessionExpired) {
        this.onSessionExpired()
      }
      await handleErrorResponse(response)
    }

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      await handleErrorResponse(response)
    }

    return response.text()
  }

  /** Load a plugin's settings. */
  async loadSettings(vaultId: string, pluginId: string): Promise<unknown | null> {
    const headers = this.buildHeaders('GET', false)
    const response = await fetch(`/api/v1/vaults/${vaultId}/plugins/${pluginId}/settings`, { method: 'GET', headers })

    if (response.status === 401) {
      this.token = null
      this.csrfToken = null
      if (this.onSessionExpired) {
        this.onSessionExpired()
      }
      await handleErrorResponse(response)
    }

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      await handleErrorResponse(response)
    }

    const text = await response.text()
    if (!text) {
      return null
    }

    return JSON.parse(text) as unknown
  }

  /** Save a plugin's settings. */
  async saveSettings(vaultId: string, pluginId: string, data: unknown): Promise<void> {
    await this.request<void>('PUT', `/api/v1/vaults/${vaultId}/plugins/${pluginId}/settings`, data)
  }

  /** Load the plugin registry for a vault. */
  async loadRegistry(vaultId: string): Promise<PluginRegistryData> {
    return this.request<PluginRegistryData>('GET', `/api/v1/vaults/${vaultId}/plugins/registry`)
  }

  /** Save the plugin registry for a vault. */
  async saveRegistry(vaultId: string, registry: PluginRegistryData): Promise<void> {
    await this.request<void>('PUT', `/api/v1/vaults/${vaultId}/plugins/registry`, registry)
  }

  // --- Internal helpers ---

  /**
   * Builds the headers for a request, including auth and CSRF tokens.
   */
  private buildHeaders(method: string, isJson: boolean): Record<string, string> {
    const headers: Record<string, string> = {}

    if (isJson) {
      headers['Content-Type'] = 'application/json'
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (CSRF_METHODS.has(method) && this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken
    }

    return headers
  }

  /**
   * Handles a response, checking for 401 (session expired) and other errors.
   * Returns the parsed JSON body for successful responses, or undefined for 204.
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 401) {
      this.token = null
      this.csrfToken = null
      if (this.onSessionExpired) {
        this.onSessionExpired()
      }
      await handleErrorResponse(response)
    }

    if (!response.ok) {
      await handleErrorResponse(response)
    }

    // 204 No Content — nothing to parse
    if (response.status === 204) {
      return undefined as T
    }

    // Some DELETE/POST endpoints return empty body
    const text = await response.text()
    if (!text) {
      return undefined as T
    }

    return JSON.parse(text) as T
  }

  /**
   * Generic JSON request with auth headers and 401 interception.
   */
  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const hasBody = body !== undefined
    const headers = this.buildHeaders(method, hasBody)

    const init: RequestInit = { method, headers }
    if (hasBody) {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)
    return this.handleResponse<T>(response)
  }

  /**
   * FormData request with auth headers and 401 interception.
   * Does not set Content-Type (browser sets multipart boundary automatically).
   */
  private async requestFormData(method: string, url: string, formData: FormData): Promise<void> {
    const headers: Record<string, string> = {}

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    if (CSRF_METHODS.has(method) && this.csrfToken) {
      headers['X-CSRF-Token'] = this.csrfToken
    }

    const response = await fetch(url, { method, headers, body: formData })
    await this.handleResponse<void>(response)
  }
}
