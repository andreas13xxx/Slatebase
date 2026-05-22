import type { VaultInfo, DirectoryTree, FileContent, AppError } from '../types'

/**
 * Interface for the Slatebase API client.
 * All methods throw an AppError on non-2xx responses.
 */
export interface IApiClient {
  fetchVaults(): Promise<VaultInfo[]>
  fetchVaultTree(vaultId: string): Promise<DirectoryTree>
  fetchFileContent(vaultId: string, filePath: string): Promise<FileContent>
  createVault(name: string): Promise<VaultInfo>
  deleteVault(vaultId: string): Promise<void>
  importFile(vaultId: string, file: File): Promise<void>
  importFolder(vaultId: string, files: FileList): Promise<void>
  deleteContent(vaultId: string, path: string): Promise<void>
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

/**
 * Concrete implementation of IApiClient using the Fetch API.
 * Uses relative URLs — the Vite dev proxy forwards /api to the backend.
 */
export class ApiClient implements IApiClient {
  async fetchVaults(): Promise<VaultInfo[]> {
    const response = await fetch('/api/v1/vaults')
    if (!response.ok) {
      await handleErrorResponse(response)
    }
    return response.json()
  }

  async fetchVaultTree(vaultId: string): Promise<DirectoryTree> {
    const response = await fetch(`/api/v1/vaults/${vaultId}/tree`)
    if (!response.ok) {
      await handleErrorResponse(response)
    }
    return response.json()
  }

  async fetchFileContent(vaultId: string, filePath: string): Promise<FileContent> {
    const encodedPath = encodeURIComponent(filePath)
    const response = await fetch(`/api/v1/vaults/${vaultId}/files?path=${encodedPath}`)
    if (!response.ok) {
      await handleErrorResponse(response)
    }
    return response.json()
  }

  async createVault(name: string): Promise<VaultInfo> {
    const response = await fetch('/api/v1/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      await handleErrorResponse(response)
    }
    return response.json()
  }

  async deleteVault(vaultId: string): Promise<void> {
    const response = await fetch(`/api/v1/vaults/${vaultId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      await handleErrorResponse(response)
    }
  }

  async importFile(vaultId: string, file: File): Promise<void> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`/api/v1/vaults/${vaultId}/import/file`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      await handleErrorResponse(response)
    }
  }

  async importFolder(vaultId: string, files: FileList): Promise<void> {
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      formData.append('files', file)
      formData.append('relativePaths', file.webkitRelativePath)
    }
    const response = await fetch(`/api/v1/vaults/${vaultId}/import/folder`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      await handleErrorResponse(response)
    }
  }

  async deleteContent(vaultId: string, path: string): Promise<void> {
    const encodedPath = encodeURIComponent(path)
    const response = await fetch(`/api/v1/vaults/${vaultId}/content?path=${encodedPath}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      await handleErrorResponse(response)
    }
  }
}
