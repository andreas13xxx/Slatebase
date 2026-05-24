import type { VaultInfo, DirectoryTree, FileContent, FileSaveResult, AppError } from '../types'
import type { PublicUserInfo } from '../state/authState'

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
  fetchVaultTree(vaultId: string): Promise<DirectoryTree>
  fetchFileContent(vaultId: string, filePath: string): Promise<FileContent>
  createVault(name: string): Promise<VaultInfo>
  deleteVault(vaultId: string): Promise<void>
  importFile(vaultId: string, file: File): Promise<void>
  importFolder(vaultId: string, files: FileList): Promise<void>
  deleteContent(vaultId: string, path: string): Promise<void>
  saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult>

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
