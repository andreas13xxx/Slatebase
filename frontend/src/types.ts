/**
 * Shared TypeScript types for the Slatebase frontend.
 * These interfaces match the design data models and represent
 * the data structures exchanged with the backend REST API.
 */

/** Vault metadata as exposed by the API (no internal fields like path or status). */
export interface VaultInfo {
  /** SHA-256-Hash (first 12 hex characters) of the normalized vault path. */
  id: string
  /** Derived from directory name, max 128 characters, unique across vaults. */
  name: string
  /** User ID of the vault owner. */
  ownerId?: string
  /** Username of the vault owner (resolved by the backend). */
  ownerName?: string
  /** Access level for the current user: 'owner', 'read', or 'write'. */
  permission?: 'owner' | 'read' | 'write'
  /** Whether this vault has an active sync configuration. */
  syncEnabled?: boolean
  /** Number of active shares for this vault (only for owned vaults). */
  shareCount?: number
}

/** Recursive directory/file tree structure for a vault. */
export interface DirectoryTree {
  name: string
  type: 'directory' | 'file'
  /** Relative path from vault root. */
  path: string
  /** Child entries (only present for directories). */
  children?: DirectoryTree[]
  /** File size in bytes (only present when type === 'file'). */
  size?: number
  /** Number of direct child entries (only present when type === 'directory'). */
  itemCount?: number
}

/** Content and metadata of a single file. */
export interface FileContent {
  /** Relative path from vault root. */
  path: string
  name: string
  /** UTF-8 decoded text content (empty string when isBinary === true). */
  content: string
  /** Original file size in bytes. */
  size: number
  encoding: 'utf-8'
  /** True if the file contains binary data (null bytes detected). */
  isBinary: boolean
  /** True if the file exceeded maxFileSize and content was truncated. */
  isTruncated: boolean
}

/** Result of a successful file save operation. */
export interface FileSaveResult {
  /** Relative path from vault root. */
  path: string
  /** Filename (last segment of path). */
  name: string
  /** Written file size in bytes. */
  size: number
}

/** Application-level error representation. */
export interface AppError {
  code: string
  message: string
}

/** Global application state managed via useReducer. */
export interface AppState {
  vaults: VaultInfo[]
  selectedVaultId: string | null
  directoryTree: DirectoryTree | null
  selectedFile: FileContent | null
  loading: boolean
  error: AppError | null
}

/** Chat conversation metadata. */
export interface Conversation {
  id: string
  participants: string[]
  createdAt: string
  createdBy: string
}

/** A single chat message. */
export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  timestamp: string
}

/** Conversation list item with resolved names and last message preview. */
export interface ConversationListItem {
  id: string
  participants: string[]
  participantNames: string[]
  lastMessageTimestamp: string | null
  lastMessagePreview: string | null
  unreadCount: number
  archived?: boolean
}

/** Paginated messages response. */
export interface PaginatedMessages {
  messages: Message[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** Paginated conversations response. */
export interface PaginatedConversations {
  conversations: ConversationListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** Discriminated union of all actions dispatched to the app reducer. */
export type AppAction =
  | { type: 'VAULTS_LOADED'; payload: VaultInfo[] }
  | { type: 'VAULT_SELECTED'; payload: string }
  | { type: 'VAULT_DESELECTED' }
  | { type: 'TREE_LOADED'; payload: DirectoryTree }
  | { type: 'FILE_LOADED'; payload: FileContent }
  | { type: 'LOADING_STARTED' }
  | { type: 'ERROR_OCCURRED'; payload: AppError }
  | { type: 'VAULT_CREATED'; payload: VaultInfo }
  | { type: 'VAULT_DELETED'; payload: string }
  | { type: 'CONTENT_DELETED'; payload: string }
