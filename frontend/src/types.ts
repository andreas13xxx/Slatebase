/**
 * Shared TypeScript types for the Slatebase frontend.
 * These interfaces match the design data models and represent
 * the data structures exchanged with the backend REST API.
 */

// VaultInfo, DirectoryTree, FileContent, FileSaveResult are derived from the
// Zod schemas in @slatebase/shared-contracts (AP10 feasibility proof) rather
// than hand-maintained here — the backend validates/produces these same
// shapes from the identical schema, so a field rename on one side is a
// compile error on the other instead of a runtime surprise. See that
// package's README/AP10 PR description for what's covered so far (just the
// vault routes) and what rolling this out further would take.
import type { VaultInfo, DirectoryTree, FileContent } from '@slatebase/shared-contracts'
export type { VaultInfo, DirectoryTree, FileContent, FileSaveResult } from '@slatebase/shared-contracts'

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
  /** Per-vault directory trees for the unified explorer view. */
  vaultTrees: Record<string, DirectoryTree | null>
  /** Vault IDs currently being loaded (tree fetch in progress). */
  vaultTreesLoading: Set<string>
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

/** Node type for the knowledge graph. */
export type GraphNodeType = 'file' | 'tag' | 'property'

/** Edge type for the knowledge graph. */
export type GraphEdgeType = 'link' | 'tag' | 'property'

/** A node in the knowledge graph (represents a file, tag, or property value). */
export interface GraphNode {
  /** Unique node identifier. */
  id: string
  /** Node type discriminator. */
  type: GraphNodeType
  /** Relative file path from vault root (only for type 'file'). */
  path?: string
  /** Display label. */
  label: string
  /** Whether the node target exists (meaningful for type 'file'). */
  exists: boolean
}

/** An edge in the knowledge graph. */
export interface GraphEdge {
  /** Source node ID. */
  source: string
  /** Target node ID. */
  target: string
  /** Edge type discriminator. */
  type: GraphEdgeType
}

/** Full graph structure returned by the graph API endpoint. */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Options for querying the graph API with optional node types. */
export interface GraphQueryOptions {
  /** Include tag nodes and edges. */
  includeTags?: boolean
  /** Include property nodes for the specified keys. */
  includeProperties?: string[]
}

/** Aggregated metadata about the knowledge graph (for settings panel). */
export interface GraphMeta {
  /** All tags across all files, sorted by count descending. */
  tags: Array<{ name: string; count: number }>
  /** All property keys across all files, sorted by count descending. */
  propertyKeys: Array<{ key: string; count: number }>
}

/** Response from the backlinks API endpoint. */
export interface BacklinksResponse {
  /** File path that was queried. */
  path: string
  /** Files that link to this path. */
  backlinks: string[]
}

/** Discriminated union of all actions dispatched to the app reducer. */
export type AppAction =
  | { type: 'VAULTS_LOADED'; payload: VaultInfo[] }
  | { type: 'VAULT_SELECTED'; payload: string }
  | { type: 'VAULT_DESELECTED' }
  | { type: 'TREE_LOADED'; payload: DirectoryTree }
  | { type: 'VAULT_TREE_LOADED'; payload: { vaultId: string; tree: DirectoryTree } }
  | { type: 'VAULT_TREE_LOADING'; payload: string }
  | { type: 'VAULT_TREE_RELOAD_REQUESTED'; payload: { vaultId: string } }
  | { type: 'FILE_LOADED'; payload: FileContent }
  | { type: 'LOADING_STARTED' }
  | { type: 'ERROR_OCCURRED'; payload: AppError }
  | { type: 'VAULT_CREATED'; payload: VaultInfo }
  | { type: 'VAULT_DELETED'; payload: string }
  | { type: 'CONTENT_DELETED'; payload: string }
